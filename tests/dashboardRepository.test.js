import test from 'node:test'
import assert from 'node:assert/strict'
import { createDashboardRepository, mergeDashboardSnapshot } from '../src/utils/dashboardRepository.js'

const KEY = 'lucuro_dashboard_v3'
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))

function base() {
  return {
    version: 3,
    layoutColumns: 6,
    groups: [{ id: 'pinned', title: '置顶' }, { id: 'g', title: '工作' }],
    cards: [{ id: 'c', title: '文档', groupId: 'g', slot: 2 }],
    wallpapers: [{ id: 'w', url: 'https://images.unsplash.com/a' }],
    settings: { brightness: 55, cardOpacity: 56, backgroundIntervalMinutes: 1, currentBackground: 'https://images.unsplash.com/old', backgroundChangedAt: 100, rotationAnchorAt: 100, backgroundPool: [{ url: 'https://images.unsplash.com/next' }] }
  }
}

function memoryStorage(initial) {
  let value = clone(initial)
  const calls = []
  return {
    calls,
    async get(key) {
      assert.equal(key, KEY)
      calls.push(['get', value?.__revision || 0])
      return clone(value)
    },
    async set(key, next) {
      assert.equal(key, KEY)
      await Promise.resolve()
      calls.push(['set', next.__revision])
      value = clone(next)
    }
  }
}

async function withoutWebLocks(run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
  try {
    await run()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
}

test('a stale page background patch cannot overwrite the latest layout', () => {
  const latest = base()
  latest.cards[0].slot = 10
  latest.groups[1].title = '已修改的分组'
  latest.__revision = 4
  const result = mergeDashboardSnapshot(latest, 'background', {
    currentBackground: 'https://images.unsplash.com/new',
    backgroundChangedAt: 200,
    rotationAnchorAt: 200,
    backgroundPool: [],
    groups: [{ id: 'stale' }],
    cards: [{ id: 'stale' }],
    brightness: 0
  }, 'old-page')
  assert.deepEqual(result.cards, latest.cards)
  assert.deepEqual(result.groups, latest.groups)
  assert.deepEqual(result.wallpapers, latest.wallpapers)
  assert.equal(result.settings.brightness, 55)
  assert.equal(result.settings.currentBackground, 'https://images.unsplash.com/new')
  assert.equal(result.__revision, 5)
  assert.equal(result.__writer, 'old-page')
  assert.equal(latest.settings.currentBackground, 'https://images.unsplash.com/old')
})

test('preferences cannot change background runtime fields or unrelated domains', () => {
  const initial = base()
  const result = mergeDashboardSnapshot(initial, 'preferences', {
    brightness: 30,
    backgroundIntervalMinutes: 0.5,
    currentBackground: 'stale',
    backgroundChangedAt: 0,
    rotationAnchorAt: 0,
    backgroundPool: []
  }, 'settings-page')
  assert.equal(result.settings.brightness, 30)
  assert.equal(result.settings.backgroundIntervalMinutes, 0.5)
  for (const key of ['currentBackground', 'backgroundChangedAt', 'rotationAnchorAt', 'backgroundPool']) {
    assert.deepEqual(result.settings[key], initial.settings[key])
  }
  assert.deepEqual(result.cards, initial.cards)
  assert.deepEqual(result.groups, initial.groups)
  assert.deepEqual(result.wallpapers, initial.wallpapers)
})

test('layout and wallpaper merges preserve all other domains and isolate references', () => {
  const initial = base()
  const patch = { groups: [{ id: 'new' }], cards: [], layoutColumns: 6, settings: { brightness: 0 }, wallpapers: [] }
  const layout = mergeDashboardSnapshot(initial, 'layout', patch, 'layout-page')
  assert.deepEqual(layout.groups, patch.groups)
  assert.deepEqual(layout.settings, initial.settings)
  assert.deepEqual(layout.wallpapers, initial.wallpapers)
  patch.groups[0].id = 'mutated'
  layout.settings.brightness = 1
  assert.equal(layout.groups[0].id, 'new')
  assert.equal(initial.settings.brightness, 55)
  const wallpapers = [{ id: 'added' }]
  const result = mergeDashboardSnapshot(initial, 'wallpapers', wallpapers, 'album-page')
  wallpapers[0].id = 'mutated'
  assert.deepEqual(result.wallpapers, [{ id: 'added' }])
  assert.deepEqual(result.groups, initial.groups)
  assert.deepEqual(result.cards, initial.cards)
  assert.deepEqual(result.settings, initial.settings)
})

test('fallback queue rereads the latest snapshot and revisions increase per write', async () => {
  await withoutWebLocks(async () => {
    const storage = memoryStorage(base())
    const repo = createDashboardRepository({ storage, key: KEY, writerId: 'writer' })
    const layoutPayload = { groups: [{ id: 'latest' }], cards: [{ id: 'new' }], layoutColumns: 6 }
    const first = repo.update('layout', layoutPayload)
    layoutPayload.groups[0].id = 'mutated-after-request'
    const second = repo.update('background', { currentBackground: 'new-image' })
    const third = repo.update('preferences', { brightness: 40 })
    const [one, two, three] = await Promise.all([first, second, third])
    assert.deepEqual([one.__revision, two.__revision, three.__revision], [1, 2, 3])
    assert.deepEqual(three.groups, [{ id: 'latest' }])
    assert.equal(three.settings.currentBackground, 'new-image')
    assert.equal(three.settings.brightness, 40)
    assert.deepEqual(storage.calls, [['get', 0], ['set', 1], ['get', 1], ['set', 2], ['get', 2], ['set', 3]])
    three.groups[0].id = 'mutated-return'
    const read = await repo.read()
    assert.equal(read.groups[0].id, 'latest')
    read.groups[0].id = 'mutated-read'
    assert.equal((await repo.read()).groups[0].id, 'latest')
  })
})

test('Web Locks serialize separate page repositories using the shared lock name', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let pending = Promise.resolve()
  const names = []
  const locks = {
    request(name, task) {
      names.push(name)
      const operation = pending.then(task)
      pending = operation.catch(() => {})
      return operation
    }
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } })
  try {
    const storage = memoryStorage(base())
    const layoutPage = createDashboardRepository({ storage, key: KEY, writerId: 'layout-page' })
    const backgroundPage = createDashboardRepository({ storage, key: KEY, writerId: 'background-page' })
    await Promise.all([
      layoutPage.update('layout', { groups: [{ id: 'latest' }], cards: [] }),
      backgroundPage.update('background', { currentBackground: 'new-image' })
    ])
    const result = await layoutPage.read()
    assert.deepEqual(result.groups, [{ id: 'latest' }])
    assert.equal(result.settings.currentBackground, 'new-image')
    assert.equal(result.__revision, 2)
    assert.equal(result.__writer, 'background-page')
    assert.deepEqual(names, Array(3).fill('qiye-dashboard-store'))
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
})

test('a rejected queued operation does not poison later writes', async () => {
  await withoutWebLocks(async () => {
    const storage = memoryStorage(base())
    const repo = createDashboardRepository({ storage, key: KEY, writerId: 'writer' })
    await assert.rejects(repo.update('unknown', {}), RangeError)
    const result = await repo.update('preferences', { brightness: 25 })
    assert.equal(result.__revision, 1)
    assert.equal(result.settings.brightness, 25)
  })
})

test('new snapshots retain version-three compatibility and missing reads stay missing', async () => {
  await withoutWebLocks(async () => {
    const storage = memoryStorage(undefined)
    const repo = createDashboardRepository({ storage, key: KEY, writerId: 'new-page' })
    assert.equal(await repo.read(), undefined)
    const result = await repo.update('layout', { groups: [], cards: [], layoutColumns: 6 })
    assert.equal(result.version, 3)
    assert.equal(result.layoutColumns, 6)
    assert.equal(result.__revision, 1)
    assert.equal(result.__writer, 'new-page')
  })
})

test('transactions from two pages append to the latest layout under one shared lock', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let pending = Promise.resolve()
  const locks = {
    request(name, task) {
      assert.equal(name, 'qiye-dashboard-store')
      const operation = pending.then(task)
      pending = operation.catch(() => {})
      return operation
    }
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } })
  try {
    const storage = memoryStorage(base())
    const firstPage = createDashboardRepository({ storage, key: KEY, writerId: 'page-a' })
    const secondPage = createDashboardRepository({ storage, key: KEY, writerId: 'page-b' })
    const observedRevisions = []
    function append(id) {
      return async (latest) => {
        observedRevisions.push(latest.__revision || 0)
        // Suspend inside the producer so the test exercises the full critical section.
        await Promise.resolve()
        latest.cards.push({ id, groupId: 'g', slot: latest.cards.length + 10 })
        return { groups: latest.groups, cards: latest.cards, layoutColumns: latest.layoutColumns }
      }
    }
    const [first, second] = await Promise.all([
      firstPage.transaction('layout', append('A')),
      secondPage.transaction('layout', append('B'))
    ])
    assert.deepEqual(observedRevisions, [0, 1])
    assert.deepEqual(first.cards.map((card) => card.id), ['c', 'A'])
    assert.deepEqual(second.cards.map((card) => card.id), ['c', 'A', 'B'])
    assert.equal(second.__revision, 2)
    assert.equal(second.__writer, 'page-b')
    assert.deepEqual(second.settings, base().settings)
    assert.deepEqual(second.wallpapers, base().wallpapers)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
})

test('a producer failure performs no write and does not poison the local transaction queue', async () => {
  await withoutWebLocks(async () => {
    const storage = memoryStorage(base())
    const repo = createDashboardRepository({ storage, key: KEY, writerId: 'writer' })
    await assert.rejects(repo.transaction('layout', async (latest) => {
      latest.cards.length = 0
      throw new Error('Cancelled layout change')
    }), /Cancelled layout change/)
    assert.ok(!storage.calls.some(([operation]) => operation === 'set'))
    const current = await repo.read()
    assert.deepEqual(current.cards, base().cards)
    const result = await repo.transaction('layout', async (latest) => ({ cards: [...latest.cards, { id: 'after-failure' }] }))
    assert.equal(result.__revision, 1)
    assert.deepEqual(result.cards.map((card) => card.id), ['c', 'after-failure'])
    await assert.rejects(repo.transaction('layout', null), TypeError)
  })
})


test('alternate layout merges never overwrite primary layout or shared preferences', () => {
  const initial = base()
  const alternate = { groups: [{ id: 'alt' }], cards: [{ id: 'alt-card' }], layoutColumns: 6, settings: { brightness: 0 } }
  const result = mergeDashboardSnapshot(initial, 'alternateLayout', alternate, 'alternate')
  assert.deepEqual(result.groups, initial.groups)
  assert.deepEqual(result.cards, initial.cards)
  assert.deepEqual(result.settings, initial.settings)
  assert.deepEqual(result.alternateLayout, { groups: alternate.groups, cards: alternate.cards, layoutColumns: 6 })
  const primaryEdit = mergeDashboardSnapshot(result, 'layout', { cards: [{ id: 'primary-new' }] }, 'primary')
  const preferencesEdit = mergeDashboardSnapshot(primaryEdit, 'preferences', { brightness: 12 }, 'prefs')
  assert.deepEqual(preferencesEdit.alternateLayout, result.alternateLayout)
  assert.deepEqual(preferencesEdit.cards, [{ id: 'primary-new' }])
  assert.equal(preferencesEdit.settings.brightness, 12)
})

test('two page repositories can concurrently change primary and alternate layouts without lost writes', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let pending = Promise.resolve()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(name, task) {
    const operation = pending.then(task)
    pending = operation.catch(() => {})
    return operation
  } } } })
  try {
    const storage = memoryStorage(base())
    const primary = createDashboardRepository({ storage, key: KEY, writerId: 'primary' })
    const alternate = createDashboardRepository({ storage, key: KEY, writerId: 'alternate' })
    await Promise.all([
      primary.transaction('layout', async (latest) => ({ cards: [...latest.cards, { id: 'new-primary' }] })),
      alternate.transaction('alternateLayout', async (latest) => ({ groups: [{ id: 'alt' }], cards: [...(latest.alternateLayout?.cards || []), { id: 'new-alternate' }], layoutColumns: 6 })),
      primary.update('preferences', { brightness: 17 })
    ])
    const result = await primary.read()
    assert.equal(result.cards.at(-1).id, 'new-primary')
    assert.equal(result.alternateLayout.cards[0].id, 'new-alternate')
    assert.equal(result.settings.brightness, 17)
    assert.equal(result.__revision, 3)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete globalThis.navigator
  }
})
