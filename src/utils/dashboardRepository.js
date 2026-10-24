const LOCK_NAME = 'qiye-dashboard-store'
const BACKGROUND_FIELDS = new Set(['currentBackground', 'backgroundChangedAt', 'rotationAnchorAt', 'backgroundPool'])
const LAYOUT_FIELDS = ['groups', 'cards', 'layoutColumns']

function cloneSerializable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function objectPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Dashboard domain payload must be an object')
  }
  return payload
}

/** Merge only the named domain into the latest serializable dashboard snapshot. */
export function mergeDashboardSnapshot(snapshot, domain, payload, writerId) {
  const previous = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? cloneSerializable(snapshot)
    : {}
  const next = { version: 3, ...previous }
  const patch = cloneSerializable(payload)

  if (domain === 'layout') {
    objectPayload(patch)
    for (const field of LAYOUT_FIELDS) {
      if (Object.hasOwn(patch, field)) next[field] = patch[field]
    }
  } else if (domain === 'alternateLayout') {
    objectPayload(patch)
    const alternate = previous.alternateLayout && typeof previous.alternateLayout === 'object' && !Array.isArray(previous.alternateLayout) ? previous.alternateLayout : {}
    next.alternateLayout = { ...alternate }
    for (const field of LAYOUT_FIELDS) {
      if (Object.hasOwn(patch, field)) next.alternateLayout[field] = patch[field]
    }
  } else if (domain === 'preferences' || domain === 'background') {
    objectPayload(patch)
    const settings = previous.settings && typeof previous.settings === 'object' && !Array.isArray(previous.settings)
      ? previous.settings
      : {}
    const fields = Object.entries(patch).filter(([field]) => domain === 'background'
      ? BACKGROUND_FIELDS.has(field)
      : !BACKGROUND_FIELDS.has(field))
    next.settings = { ...settings, ...Object.fromEntries(fields) }
  } else if (domain === 'wallpapers') {
    if (!Array.isArray(patch)) throw new TypeError('Wallpaper payload must be an array')
    next.wallpapers = patch
  } else {
    throw new RangeError(`Unknown dashboard domain: ${String(domain)}`)
  }

  const revision = Number(previous.__revision)
  next.__revision = Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) + 1 : 1
  next.__writer = String(writerId || '')
  return next
}

/** Read/merge/write one domain while preserving updates from other open pages. */
export function createDashboardRepository({ storage, key, writerId }) {
  if (!storage?.get || !storage?.set) throw new TypeError('Dashboard storage must expose get and set')
  if (!key) throw new TypeError('Dashboard storage key is required')
  let pending = Promise.resolve()

  function enqueue(task) {
    const operation = pending.then(() => {
      const locks = globalThis.navigator?.locks
      return typeof locks?.request === 'function'
        ? locks.request(LOCK_NAME, task)
        : task()
    })
    // One failed write must not poison subsequent operations in this instance.
    pending = operation.catch(() => {})
    return operation
  }

  async function commit(latest, domain, payload) {
    const next = mergeDashboardSnapshot(latest, domain, payload, writerId)
    await storage.set(key, next)
    return cloneSerializable(next)
  }

  return {
    update(domain, payload) {
      // Capture the requested action now, not after waiting behind another write.
      let patch
      try {
        patch = cloneSerializable(payload)
      } catch (error) {
        return Promise.reject(error)
      }
      return enqueue(async () => {
        const latest = await storage.get(key)
        return commit(latest, domain, patch)
      })
    },

    transaction(domain, producer) {
      if (typeof producer !== 'function') return Promise.reject(new TypeError('Dashboard transaction producer must be a function'))
      return enqueue(async () => {
        const latest = await storage.get(key)
        const patch = await producer(cloneSerializable(latest))
        return commit(latest, domain, patch)
      })
    },

    read() {
      return enqueue(async () => cloneSerializable(await storage.get(key)))
    }
  }
}
