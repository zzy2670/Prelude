import { computed, reactive } from 'vue'
import { storage as realStorage } from './utils/storage'
import { isDemo, createDemoSnapshot } from './utils/demoData'
import { COLUMN_COUNT, fallbackTitle, firstFreeSlot, insertionSlots, nearestFreeSlot, normalizeUrl } from './utils/layout'
import { fetchBonjourrBackgrounds, preloadImage } from './utils/backgrounds'
import { browserFaviconUrl, resolveBookmarkMetadata } from './utils/browserMetadata'
import { createLayoutHistory } from './utils/layoutHistory'
import { createDashboardRepository } from './utils/dashboardRepository'
import { setLocale, t } from './utils/i18n'
import { readWebShortcut } from './utils/webShortcut'
import { cacheWallpaper, removeCachedWallpaper, chooseDownloadDirectory, getDownloadDirectoryName, clearDownloadDirectory, downloadWallpaper, downloadAll } from './utils/wallpaperLibrary'

const STORAGE_KEY = 'xuye_dashboard_v4'
const LEGACY_KEY = 'lucuro_dashboard_v3'
const demoMemory = new Map()
const storage = isDemo ? { get: async (key) => demoMemory.get(key), set: async (key,value) => { demoMemory.set(key, JSON.parse(JSON.stringify(value))) } } : realStorage
export const PINNED_GROUP_ID = 'pinned'
const DEFAULT_SETTINGS = Object.freeze({
  backgroundIntervalMinutes: 1,
  currentBackground: '',
  backgroundChangedAt: 0,
  backgroundPool: [],
  brightness: 55,
  cardOpacity: 56,
  language: 'zh-CN'
})

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeCard(card) {
  const url = normalizeUrl(card?.url)
  if (!url) return null
  return {
    id: String(card?.id || uid()),
    title: String(card?.title || fallbackTitle(url)).trim().slice(0, 160),
    titleSource: String(card?.titleSource || ''),
    bookmarkId: String(card?.bookmarkId || ''),
    iconUrl: browserFaviconUrl(url) || String(card?.iconUrl || ''),
    url,
    groupId: String(card?.groupId || ''),
    slot: Math.max(0, Number.parseInt(card?.slot, 10) || 0),
    originalGroupId: card?.originalGroupId ? String(card.originalGroupId) : '',
    originalGroupTitle: String(card?.originalGroupTitle || ''),
    originalGroupIndex: Math.max(1, Number(card?.originalGroupIndex) || 1),
    originalSlot: Math.max(0, Number.parseInt(card?.originalSlot, 10) || 0)
  }
}

function normalizeSnapshot(snapshot) {
  const savedGroups = Array.isArray(snapshot?.groups)
    ? snapshot.groups
        .filter((group) => String(group?.id || '') !== PINNED_GROUP_ID)
        .map((group) => ({ id: String(group?.id || uid()), title: String(group?.title || '新分组').trim().slice(0, 80) || '新分组' }))
    : []
  const groups = [{ id: PINNED_GROUP_ID, title: '置顶', fixed: true }, ...savedGroups]
  const groupIds = new Set(groups.map((group) => group.id))
  const cards = Array.isArray(snapshot?.cards) ? snapshot.cards.map(normalizeCard).filter(Boolean) : []
  const previousColumns = Number(snapshot?.layoutColumns || 5)
  if (snapshot && previousColumns !== COLUMN_COUNT) {
    for (const card of cards) {
      card.slot = Math.floor(card.slot / previousColumns) * COLUMN_COUNT + (card.slot % previousColumns)
      card.originalSlot = Math.floor(card.originalSlot / previousColumns) * COLUMN_COUNT + (card.originalSlot % previousColumns)
    }
  }
  const seen = new Set()
  const uniqueSlots = cards.filter((card) => {
    if (!groupIds.has(card.groupId)) return false
    const key = `${card.groupId}:${card.slot}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    version: 3,
    layoutColumns: COLUMN_COUNT,
    groups: groups.filter((group) => group.id === PINNED_GROUP_ID || group.title !== '新分组' || uniqueSlots.some((card) => card.groupId === group.id)),
    cards: uniqueSlots,
    wallpapers: Array.isArray(snapshot?.wallpapers) ? snapshot.wallpapers.filter((item) => item?.id && /^https:\/\/images\.unsplash\.com\//.test(item.url || '')) : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(snapshot?.settings || {}),
      backgroundIntervalMinutes: Math.max(0, Number(snapshot?.settings?.backgroundIntervalMinutes ?? 1) || 0),
      backgroundPool: Array.isArray(snapshot?.settings?.backgroundPool)
        ? snapshot.settings.backgroundPool.filter((item) => /^https:\/\/images\.unsplash\.com\//i.test(item?.url || ''))
        : []
    }
  }
}

const state = reactive({
  loaded: false,
  pageMode: 'primary',
  pageSwitching: false,
  groups: [],
  cards: [],
  settings: { ...DEFAULT_SETTINGS },
  settingsOpen: false,
  addOpen: false,
  toast: '',
  backgroundLoading: false,
  dragActive: false,
  wallpapers: [],
  albumOpen: false,
  wallpaperBusy: false,
  downloadFolder: ''
})

let toastTimer = 0
let rotationTimer = 0
let preparedBackground = null
const history = createLayoutHistory()
let historyDepth = 0
let insideLayoutTransaction = false
let lastRevision = 0
const writerId = uid()
const repository = createDashboardRepository({ storage, key: STORAGE_KEY, writerId })
let storageEvents = null
const pendingLayoutActions = new Set()
const layoutDomain = (mode = state.pageMode) => mode === 'alternate' ? 'alternateLayout' : 'layout'

function layoutFingerprint(value) { return JSON.stringify({ groups: value.groups, cards: value.cards }) }

function applySnapshot(saved, clearHistory = true) {
  const selectedLayout = state.pageMode === 'alternate' ? saved?.alternateLayout : saved
  const snapshot = normalizeSnapshot({ ...selectedLayout, settings: saved?.settings, wallpapers: saved?.wallpapers })
  if (layoutFingerprint(snapshot) !== layoutFingerprint(state)) {
    state.groups = snapshot.groups
    state.cards = snapshot.cards
    if (clearHistory) history.clear()
  }
  if (state.settings.currentBackground !== snapshot.settings.currentBackground) preparedBackground = null
  state.settings = snapshot.settings
  setLocale(state.settings.language)
  state.wallpapers = snapshot.wallpapers
  lastRevision = Math.max(lastRevision, Number(saved?.__revision) || 0)
  if (state.loaded) scheduleBackground()
}

function receiveStorage(changes, area) {
  const saved = changes[STORAGE_KEY]?.newValue
  if (area !== 'local' || !saved || saved.__writer === writerId || (Number(saved.__revision) || 0) <= lastRevision) return
  applySnapshot(saved)
}

function layoutAction(action, prepare) {
  return (...args) => {
    if (state.pageSwitching) return Promise.resolve(false)
    const domain = layoutDomain()
    const operation = (async () => {
      const preparedArgs = prepare ? await prepare(...args) : args
      if (!preparedArgs) return false
      let result
      const saved = await repository.transaction(domain, async (latest) => {
        if (latest) applySnapshot(latest)
        insideLayoutTransaction = true
        try {
          result = await action(...preparedArgs)
          pruneEmptyDefaultGroups()
          return { ...layoutSnapshot(), layoutColumns: COLUMN_COUNT }
        } finally { insideLayoutTransaction = false }
      })
      lastRevision = Number(saved.__revision) || lastRevision
      return result
    })()
    pendingLayoutActions.add(operation)
    operation.then(() => pendingLayoutActions.delete(operation), () => pendingLayoutActions.delete(operation))
    return operation
  }
}

async function togglePage() {
  if (state.pageSwitching) return false
  state.pageSwitching = true
  try {
    await Promise.allSettled([...pendingLayoutActions])
    const latest = await repository.read()
    state.pageMode = state.pageMode === 'primary' ? 'alternate' : 'primary'
    history.clear()
    applySnapshot(latest)
    return true
  } finally { state.pageSwitching = false }
}

function layoutSnapshot() {
  return { groups: state.groups.map((group) => ({ ...group })), cards: state.cards.map((card) => ({ ...card })) }
}

function recordLayout() {
  if (!historyDepth) history.record(layoutSnapshot())
}

async function undo() {
  if (historyDepth) return
  const snapshot = history.undo(layoutSnapshot())
  if (!snapshot) return
  state.groups = snapshot.groups
  state.cards = snapshot.cards
  await persist()
}

async function redo() {
  if (historyDepth) return
  const snapshot = history.redo(layoutSnapshot())
  if (!snapshot) return
  state.groups = snapshot.groups
  state.cards = snapshot.cards
  await persist()
}

function prepareBackground() {
  if (preparedBackground) return preparedBackground
  preparedBackground = (async () => {
    let pool = state.settings.backgroundPool.filter((item) => item.url !== state.settings.currentBackground)
    if (!pool.length) pool = (await fetchBonjourrBackgrounds()).filter((item) => item.url !== state.settings.currentBackground)
    if (!pool.length) throw new Error('No alternate background available')
    const index = Math.floor(Math.random() * pool.length)
    const [next] = pool.splice(index, 1)
    await preloadImage(next.url)
    return { next, pool }
  })()
  preparedBackground.catch(() => { preparedBackground = null })
  return preparedBackground
}

async function persist(domain = 'layout', payload) {
  if (domain === 'layout' && insideLayoutTransaction) return
  if (!historyDepth) pruneEmptyDefaultGroups()
  const patch = payload ?? (domain === 'layout' ? { ...layoutSnapshot(), layoutColumns: COLUMN_COUNT } : domain === 'wallpapers' ? state.wallpapers.map((item) => ({ ...item })) : state.settings)
  const saved = await repository.update(domain === 'layout' ? layoutDomain() : domain, patch)
  applySnapshot(saved)
  return saved
}

function toast(message) {
  const status = String(message).match(/^壁纸下载失败（(\d+)）。$/)
  state.toast = status ? t('壁纸下载失败（{status}）。', { status: status[1] }) : t(message)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { state.toast = '' }, 2200)
}

function cardAt(groupId, slot) {
  return state.cards.find((card) => card.groupId === groupId && card.slot === slot)
}

async function addCard(input) {
  const url = normalizeUrl(input?.url)
  if (!url) {
    toast('请输入有效的网址')
    return false
  }
  const groupId = String(input?.groupId || '')
  if (!state.groups.some((group) => group.id === groupId)) {
    toast('请先创建分组')
    return false
  }
  const slot = Math.max(0, Number.parseInt(input?.slot, 10) || 0)
  if (cardAt(groupId, slot)) {
    toast('这个位置已经有卡片')
    return false
  }
  recordLayout()
  state.cards.push(normalizeCard({
    id: uid(),
    title: String(input?.title || fallbackTitle(url)).trim().slice(0, 160),
    titleSource: String(input?.titleSource || (input?.title ? 'manual' : 'fallback')),
    bookmarkId: String(input?.bookmarkId || ''),
    iconUrl: browserFaviconUrl(url) || String(input?.iconUrl || ''),
    url,
    groupId,
    slot
  }))
  await persist()
  return true
}

async function addExternalCard(payload, groupId, preferredSlot, columnPitch) {
  const metadata = payload.source === 'tab' ? {} : await resolveBookmarkMetadata(payload.url, payload.bookmarkId, payload.title)
  const slot = nearestFreeSlot(state.cards, groupId, preferredSlot, columnPitch)
  return addCard({ ...payload, groupId, slot,
    title: metadata.title || payload.title,
    bookmarkId: metadata.bookmarkId || '',
    iconUrl: metadata.iconUrl || payload.iconUrl || '',
    titleSource: metadata.title ? 'bookmark' : (payload.source === 'tab' ? 'tab' : 'fallback')
  })
}

async function prepareWebShortcut(payload, ...args) {
  if (payload?.kind !== 'web-shortcut') return null
  try { return [await readWebShortcut(payload), ...args] }
  catch (error) { toast(error.message || '无法读取网页快捷方式。'); return null }
}

async function placeWebShortcut(payload, groupId, slot, mode = 'replace', columnPitch) {
  if (!['replace', 'insert'].includes(mode)) return false
  return mode === 'insert' ? insertCard(payload, groupId, slot) : addExternalCard(payload, groupId, slot, columnPitch)
}

async function insertCard(payload, groupId, slot = 0) {
  const targetGroupId = String(groupId || '')
  const targetSlot = Number(slot)
  if (!state.groups.some((group) => group.id === targetGroupId)
    || !Number.isSafeInteger(targetSlot) || targetSlot < 0
    || !['internal', 'external'].includes(payload?.kind)) return false

  let source = null
  let added = null
  if (payload.kind === 'internal') {
    source = state.cards.find((card) => card.id === String(payload.id || ''))
    if (!source) return false
    if (source.groupId === targetGroupId && source.slot === targetSlot) return true
  } else {
    const url = normalizeUrl(payload.url)
    if (!url) {
      toast('请输入有效的网址')
      return false
    }
    const metadata = payload.source === 'tab' ? {} : await resolveBookmarkMetadata(url, payload.bookmarkId, payload.title)
    added = normalizeCard({
      id: uid(), url, groupId: targetGroupId, slot: targetSlot,
      title: metadata.title || payload.title || fallbackTitle(url),
      titleSource: metadata.title ? 'bookmark' : (payload.source === 'tab' ? 'tab' : 'fallback'),
      bookmarkId: metadata.bookmarkId || '',
      iconUrl: metadata.iconUrl || payload.iconUrl || ''
    })
    if (!added) return false
  }

  return placeInsertedCard(source, added, targetGroupId, targetSlot)
}

async function placeInsertedCard(source, added, targetGroupId, targetSlot) {
  const sourcePosition = source ? { groupId: source.groupId, slot: source.slot } : null
  const shifts = insertionSlots(state.cards.filter((card) => card.groupId === targetGroupId), targetSlot, source?.id || '')
  recordLayout()
  for (const card of state.cards) {
    if (shifts.has(card.id)) card.slot = shifts.get(card.id)
  }
  if (source) {
    source.groupId = targetGroupId
    source.slot = targetSlot
    updatePinReturnPosition(source, sourcePosition)
  } else state.cards.push(added)
  await persist()
  return true
}

async function moveCard(id, groupId, slot) {
  const source = state.cards.find((card) => card.id === id)
  if (!source || !state.groups.some((group) => group.id === groupId)) return false
  if (source.groupId === groupId && source.slot === slot) return true
  recordLayout()
  const target = cardAt(groupId, slot)
  const sourcePosition = { groupId: source.groupId, slot: source.slot }
  const targetPosition = target ? { groupId: target.groupId, slot: target.slot } : null
  source.groupId = groupId
  source.slot = slot
  if (target && target.id !== source.id) {
    target.groupId = sourcePosition.groupId
    target.slot = sourcePosition.slot
  }
  updatePinReturnPosition(source, sourcePosition)
  if (target && targetPosition) updatePinReturnPosition(target, targetPosition)
  await persist()
  return true
}

function updatePinReturnPosition(card, previous) {
  if (previous.groupId !== PINNED_GROUP_ID && card.groupId === PINNED_GROUP_ID) {
    card.originalGroupId = previous.groupId
    card.originalGroupTitle = state.groups.find((group) => group.id === previous.groupId)?.title || '新分组'
    card.originalGroupIndex = state.groups.findIndex((group) => group.id === previous.groupId)
    card.originalSlot = previous.slot
  } else if (previous.groupId === PINNED_GROUP_ID && card.groupId !== PINNED_GROUP_ID) {
    card.originalGroupId = ''
    card.originalSlot = 0
  }
}

async function renameCard(id, title) {
  const card = state.cards.find((entry) => entry.id === id)
  if (!card) return
  const next = String(title || '').trim()
  if (next && next !== card.title) {
    recordLayout()
    card.title = next.slice(0, 160)
    card.titleSource = 'manual'
  }
  await persist()
}

async function removeCard(id) {
  const index = state.cards.findIndex((card) => card.id === id)
  if (index < 0) return
  recordLayout()
  state.cards.splice(index, 1)
  await persist()
}

async function createGroup(index = state.groups.length) {
  recordLayout()
  const group = { id: uid(), title: '新分组' }
  state.groups.splice(Math.max(1, Math.min(state.groups.length, index)), 0, group)
  await persist()
  return group
}

async function renameGroup(id, title) {
  if (id === PINNED_GROUP_ID) return
  const group = state.groups.find((entry) => entry.id === id)
  if (!group) return
  const next = String(title || '').trim() || '新分组'
  if (next !== group.title) {
    recordLayout()
    group.title = next.slice(0, 80)
  }
  await persist()
}

async function removeGroup(id) {
  if (id === PINNED_GROUP_ID) return
  const index = state.groups.findIndex((group) => group.id === id)
  if (index < 0) return
  recordLayout()
  state.groups.splice(index, 1)
  state.cards = state.cards.filter((card) => card.groupId !== id)
  await persist()
}

async function togglePin(id) {
  const card = state.cards.find((entry) => entry.id === id)
  if (!card) return
  recordLayout()
  if (card.groupId !== PINNED_GROUP_ID) {
    card.originalGroupId = card.groupId
    card.originalGroupTitle = state.groups.find((group) => group.id === card.groupId)?.title || '新分组'
    card.originalGroupIndex = state.groups.findIndex((group) => group.id === card.groupId)
    card.originalSlot = card.slot
    card.groupId = PINNED_GROUP_ID
    card.slot = firstFreeSlot(state.cards.filter((entry) => entry.id !== card.id), PINNED_GROUP_ID)
  } else {
    let groupId = card.originalGroupId
    if (!state.groups.some((group) => group.id === groupId && group.id !== PINNED_GROUP_ID)) {
      if (groupId && card.originalGroupTitle) {
        state.groups.splice(Math.max(1, Math.min(state.groups.length, card.originalGroupIndex || 1)), 0, { id: groupId, title: card.originalGroupTitle })
      } else {
      let fallback = state.groups.find((group) => group.id !== PINNED_GROUP_ID)
      if (!fallback) {
        fallback = { id: uid(), title: '新分组' }
        state.groups.push(fallback)
      }
      groupId = fallback.id
      }
    }
    const preferred = Math.max(0, Number(card.originalSlot) || 0)
    card.groupId = groupId
    card.slot = state.cards.some((entry) => entry.id !== card.id && entry.groupId === groupId && entry.slot === preferred) ? firstFreeSlot(state.cards.filter((entry) => entry.id !== card.id), groupId) : preferred
    card.originalGroupId = ''
    card.originalSlot = 0
  }
  await persist()
}

async function changeBackground(force = false) {
  if (state.backgroundLoading) return false
  state.backgroundLoading = true
  try {
    if (force) preparedBackground = null
    const { next, pool } = await prepareBackground()
    preparedBackground = null
    const saved = await repository.transaction('background', (latest) => {
      const current = latest?.settings || {}
      const minutes = Number(current.backgroundIntervalMinutes ?? state.settings.backgroundIntervalMinutes)
      const anchor = Number(current.rotationAnchorAt || current.backgroundChangedAt || 0)
      if (!force && current.currentBackground && (!(minutes > 0) || Date.now() < anchor + minutes * 60000)) return {}
      return { currentBackground: next.url, backgroundChangedAt: Date.now(), rotationAnchorAt: Date.now(), backgroundPool: pool }
    })
    applySnapshot(saved)
    return true
  } catch (error) {
    console.warn('[序页] Background rotation failed', error)
    if (force) toast('背景暂时无法更新')
    return false
  } finally {
    state.backgroundLoading = false
    scheduleBackground()
    if (state.settings.backgroundIntervalMinutes > 0) prepareBackground().catch(() => {})
  }
}

function scheduleBackground() {
  clearTimeout(rotationTimer)
  const minutes = Number(state.settings.backgroundIntervalMinutes)
  if (!(minutes > 0)) return
  const remaining = (state.settings.rotationAnchorAt || state.settings.backgroundChangedAt) + minutes * 60_000 - Date.now()
  rotationTimer = setTimeout(() => changeBackground(), remaining > 0 ? remaining : 15_000)
}

async function setBackgroundInterval(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value < 0) return
  state.settings.backgroundIntervalMinutes = value
  const anchor = Date.now()
  state.settings.rotationAnchorAt = anchor
  await persist('preferences', { backgroundIntervalMinutes: value })
  await persist('background', { rotationAnchorAt: anchor })
  scheduleBackground()
}

async function load() {
  state.pageMode = 'primary'
  state.pageSwitching = false
  if (isDemo && !demoMemory.has(STORAGE_KEY)) await storage.set(STORAGE_KEY, await createDemoSnapshot())
  const current = await repository.read()
  const saved = current || await storage.get(LEGACY_KEY)
  const snapshot = normalizeSnapshot(saved)
  state.groups = snapshot.groups
  state.cards = snapshot.cards
  state.settings = snapshot.settings
  setLocale(state.settings.language)
  state.wallpapers = snapshot.wallpapers
  history.clear()
  getDownloadDirectoryName().then((name) => { state.downloadFolder = name }).catch(() => {})
  if (!saved?.settings?.rotationTimingVersion) {
    state.settings.backgroundIntervalMinutes = 1
    state.settings.rotationTimingVersion = 1
  }
  pruneEmptyDefaultGroups()
  if (!current) {
    const initialSettings = { ...state.settings, backgroundPool: [...state.settings.backgroundPool] }
    const initialWallpapers = state.wallpapers.map((item) => ({ ...item }))
    if (saved) await storage.set('xuye_backup_before_1_3', saved)
    await persist('layout')
    await persist('preferences', initialSettings)
    await persist('background', initialSettings)
    await persist('wallpapers', initialWallpapers)
  } else lastRevision = Number(current.__revision) || 0
  if (!isDemo && !storageEvents && globalThis.chrome?.storage?.onChanged) {
    storageEvents = chrome.storage.onChanged
    storageEvents.addListener(receiveStorage)
  }
  state.loaded = true
  // Repair previous hostname placeholders without overwriting manually edited titles.
  layoutAction(repairCardMetadata)().catch(() => {})

  const intervalMs = Number(state.settings.backgroundIntervalMinutes) * 60_000
  const due = !state.settings.currentBackground || (intervalMs > 0 && Date.now() - (state.settings.rotationAnchorAt || state.settings.backgroundChangedAt) >= intervalMs)
  if (!isDemo) changeBackground(true)
  scheduleBackground()
  if (!due && state.settings.backgroundIntervalMinutes > 0) prepareBackground().catch(() => {})
}

async function setAppearance(key, value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !['brightness', 'cardOpacity'].includes(key)) return
  state.settings[key] = key === 'brightness' ? Math.max(0, Math.min(80, numeric)) : Math.max(20, Math.min(95, numeric))
  await persist('preferences', { [key]: state.settings[key] })
}

async function setLanguage(value) {
  state.settings.language = setLocale(value)
  await persist('preferences', { language: state.settings.language })
}

async function openGroup(groupId) {
  const cards = state.cards.filter((card) => card.groupId === groupId).sort((a,b) => a.slot - b.slot)
  if (!globalThis.chrome?.tabs?.create) return
  for (const card of cards) await chrome.tabs.create({ url: card.url, active: false })
}

async function repairCardMetadata() {
  let changed = false
  for (const card of [...state.cards]) {
    if (card.titleSource === 'manual' || card.titleSource === 'tab') continue
    if (card.titleSource !== 'bookmark' && card.title !== fallbackTitle(card.url)) continue
    const metadata = await resolveBookmarkMetadata(card.url, card.bookmarkId)
    if (!state.cards.some((item) => item.id === card.id) || card.titleSource === 'manual') continue
    if (metadata.title) {
      card.title = metadata.title
      card.titleSource = 'bookmark'
      card.bookmarkId = metadata.bookmarkId
      changed = true
    }
  }
  if (changed) await persist()
}

async function addInNewGroup(payload, slot = 0, index = state.groups.length) {
  if (historyDepth) return
  const metadata = payload.kind === 'internal' || payload.source === 'tab' ? {} : await resolveBookmarkMetadata(payload.url, payload.bookmarkId, payload.title)
  recordLayout()
  historyDepth++
  try {
    const group = await createGroup(index)
    if (payload.kind === 'internal') await moveCard(payload.id, group.id, slot)
    else await addCard({ ...payload, ...metadata, title: metadata.title || payload.title, iconUrl: metadata.iconUrl || payload.iconUrl,
      titleSource: metadata.title ? 'bookmark' : (payload.source === 'tab' ? 'tab' : 'fallback'), groupId: group.id, slot })
  } finally { historyDepth--; await persist() }
}

function pruneEmptyDefaultGroups() {
  const populated = new Set(state.cards.map((card) => card.groupId))
  state.groups = state.groups.filter((group) => group.id === PINNED_GROUP_ID || group.title !== '新分组' || populated.has(group.id))
}

async function moveGroup(id, insertIndex) {
  if (id === PINNED_GROUP_ID) return
  const from = state.groups.findIndex((group) => group.id === id)
  if (from < 1) return
  const requested = Math.max(1, Math.min(state.groups.length, insertIndex))
  const to = requested > from ? requested - 1 : requested
  if (from === to) return
  recordLayout()
  const [group] = state.groups.splice(from, 1)
  state.groups.splice(to, 0, group)
  await persist()
}

async function deleteRow(groupId, row) {
  if (!state.groups.some((group) => group.id === groupId) || !Number.isInteger(row) || row < 0) return
  if (!state.cards.some((card) => card.groupId === groupId)) {
    pruneEmptyDefaultGroups()
    await persist()
    return
  }
  recordLayout()
  state.cards = state.cards.filter((card) => card.groupId !== groupId || Math.floor(card.slot / COLUMN_COUNT) !== row)
  for (const card of state.cards) {
    if (card.groupId === groupId && Math.floor(card.slot / COLUMN_COUNT) > row) card.slot -= COLUMN_COUNT
    if (card.originalGroupId === groupId && Math.floor(card.originalSlot / COLUMN_COUNT) > row) card.originalSlot -= COLUMN_COUNT
  }
  await persist()
}

async function favoriteWallpaper() {
  const url = state.settings.currentBackground
  if (!url || state.wallpaperBusy) return
  state.wallpaperBusy = true
  try {
    let removed = []
    const saved = await repository.transaction('wallpapers', async (latest) => {
      const collection = latest?.wallpapers || []
      removed = collection.filter((item) => item.url === url)
      if (removed.length) return collection.filter((item) => item.url !== url)
      const record = await cacheWallpaper(url)
      return [record, ...collection.filter((item) => item.id !== record.id)]
    })
    applySnapshot(saved)
    if (removed.length) {
      await cleanRemovedWallpaperCache(removed)
      toast('已取消收藏壁纸')
    } else toast('壁纸已收藏')
  } catch (error) { toast(error.message || '收藏失败') }
  finally { state.wallpaperBusy = false }
}

async function cleanRemovedWallpaperCache(records) {
  // Recheck the latest collection under the same repository lock: another page
  // may have saved the image again after the removal was committed.
  try {
    const saved = await repository.transaction('wallpapers', async (latest) => {
      const collection = latest?.wallpapers || []
      for (const record of records) {
        if (!collection.some((item) => item.id === record.id || item.url === record.url)) {
          await removeCachedWallpaper(record.id).catch(() => {})
        }
      }
      return collection
    })
    applySnapshot(saved)
  } catch {
    // Metadata removal remains successful if optional cache cleanup is unavailable.
  }
}

async function removeFavoriteWallpaper(recordOrId) {
  const id = String(typeof recordOrId === 'object' ? recordOrId?.id || '' : recordOrId || '')
  if (!id || state.wallpaperBusy) return false
  state.wallpaperBusy = true
  try {
    let removed = []
    const saved = await repository.transaction('wallpapers', (latest) => {
      const collection = latest?.wallpapers || []
      removed = collection.filter((item) => item.id === id)
      return collection.filter((item) => item.id !== id)
    })
    applySnapshot(saved)
    if (!removed.length) return false
    await cleanRemovedWallpaperCache(removed)
    toast('已取消收藏壁纸')
    return true
  } catch (error) {
    toast(error.message || '取消收藏失败')
    return false
  } finally { state.wallpaperBusy = false }
}

async function chooseWallpaperFolder() {
  try { state.downloadFolder = (await chooseDownloadDirectory()).name }
  catch (error) { toast(error.message) }
}

async function resetWallpaperFolder() {
  await clearDownloadDirectory()
  state.downloadFolder = ''
}

async function downloadFavorite(record) {
  if (state.wallpaperBusy) return
  state.wallpaperBusy = true
  try { await downloadWallpaper(record); toast('壁纸已保存') }
  catch (error) { toast(error.message || '下载失败') }
  finally { state.wallpaperBusy = false }
}

async function downloadFavorites() {
  if (state.wallpaperBusy) return
  state.wallpaperBusy = true
  try {
    const result = await downloadAll(state.wallpapers)
    toast(result.failed.length ? t('已保存 {count} 张，{failed} 张失败', { count: result.downloaded.length, failed: result.failed.length }) : t('已保存全部 {count} 张壁纸', { count: result.downloaded.length }))
  } catch (error) { toast(error.message || '下载失败') }
  finally { state.wallpaperBusy = false }
}

export function useDashboard() {
  return {
    state,
    groupsWithCards: computed(() => state.groups.map((group) => ({
      ...group,
      cards: state.cards.filter((card) => card.groupId === group.id)
    }))),
    load,
    togglePage,
    persist,
    toast,
    cardAt,
    addCard: layoutAction(addCard),
    addExternalCard: layoutAction(addExternalCard),
    addWebShortcut: layoutAction(placeWebShortcut, prepareWebShortcut),
    addWebShortcutInNewGroup: layoutAction(addInNewGroup, prepareWebShortcut),
    insertCard: layoutAction(insertCard),
    moveCard: layoutAction(moveCard),
    moveGroup: layoutAction(moveGroup),
    addInNewGroup: layoutAction(addInNewGroup),
    deleteRow: layoutAction(deleteRow),
    undo: layoutAction(undo),
    redo: layoutAction(redo),
    renameCard: layoutAction(renameCard),
    removeCard: layoutAction(removeCard),
    createGroup: layoutAction(createGroup),
    renameGroup: layoutAction(renameGroup),
    removeGroup: layoutAction(removeGroup),
    togglePin: layoutAction(togglePin),
    changeBackground,
    setBackgroundInterval,
    setAppearance,
    setLanguage,
    openGroup,
    favoriteWallpaper,
    removeFavoriteWallpaper,
    chooseWallpaperFolder,
    resetWallpaperFolder,
    downloadFavorite,
    downloadFavorites,
    dispose() {
      clearTimeout(rotationTimer)
      clearTimeout(toastTimer)
      storageEvents?.removeListener(receiveStorage)
      storageEvents = null
    },
    firstFreeSlot: (groupId) => firstFreeSlot(state.cards, groupId)
  }
}
