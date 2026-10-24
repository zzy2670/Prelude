import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

test('background preloads and changes at the one-minute deadline; tab pin restores its slot', async () => {
  const originals = { chrome: globalThis.chrome, fetch: globalThis.fetch, Image: globalThis.Image, localStorage: globalThis.localStorage, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now }
  let clock = 100000
  let sequence = 0
  const timers = new Map()
  const memory = new Map()
  const tick = () => new Promise((resolve) => setImmediate(resolve))
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  let board
  try {
    Date.now = () => clock
    globalThis.localStorage = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) }
    globalThis.setTimeout = (callback, delay) => { const id = ++sequence; timers.set(id, { callback, due: clock + delay }); return id }
    globalThis.clearTimeout = (id) => timers.delete(id)
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ images: [1, 2, 3].map((id) => ({ urls: { full: `https://images.unsplash.com/test-${id}` } })) }) })
    globalThis.Image = class { set src(value) { if (value) queueMicrotask(() => this.onload?.()) } }
    const { useDashboard } = await server.ssrLoadModule('/src/store.js')
    board = useDashboard()
    await board.load()
    assert.equal(Object.hasOwn(board.state, 'onboardingOpen'), false)
    assert.equal(Object.hasOwn(board.state.settings, 'onboardingCompleted'), false)
    assert.equal(Object.hasOwn(board, 'dismissOnboarding'), false)
    for (let index = 0; index < 5; index++) await tick()
    const first = board.state.settings.currentBackground
    assert.ok(first)
    assert.equal(board.state.settings.backgroundIntervalMinutes, 1)
    const timer = [...timers.entries()].find(([, entry]) => entry.due === clock + 60000)
    assert.ok(timer, 'switch is scheduled exactly 60 seconds after image display')
    clock += 60000
    timers.delete(timer[0])
    await timer[1].callback()
    assert.notEqual(board.state.settings.currentBackground, first)
    await board.setBackgroundInterval(0.5)
    assert.ok([...timers.values()].some((timer) => timer.due === clock + 30000), 'manual decimal interval schedules thirty seconds from saving')
    await board.setBackgroundInterval(5)
    assert.ok([...timers.values()].some((timer) => timer.due === clock + 300000), 'preset schedules five minutes from saving')
    await board.setBackgroundInterval(0)
    assert.equal(board.state.settings.backgroundIntervalMinutes, 0)
    assert.ok(![...timers.values()].some((timer) => timer.due === clock + 300000), 'pause cancels the rotation deadline')
    await board.addInNewGroup({ kind: 'external', source: 'tab', url: 'https://example.com', title: '页面' }, 8)
    const group = board.state.groups.find((item) => item.id !== 'pinned')
    const card = board.state.cards[0]
    await board.togglePin(card.id)
    assert.equal(card.groupId, 'pinned')
    await board.togglePin(card.id)
    assert.equal(card.groupId, group.id)
    assert.equal(card.slot, 8)
    globalThis.chrome = {
      runtime: { getURL: (path) => `chrome-extension://test/${path.replace(/^\//, '')}` },
      bookmarks: { search: async () => [{ id: 'doc', title: '文档', url: 'https://example.com/' }] }
    }
    await board.addExternalCard({ url: 'https://example.com/', title: 'example.com' }, group.id, 0)
    const bookmarkCard = board.state.cards.find((item) => item.slot === 0 && item.groupId === group.id)
    assert.equal(bookmarkCard.title, '文档')
    assert.equal(bookmarkCard.titleSource, 'bookmark')
    assert.equal(bookmarkCard.bookmarkId, 'doc')
    await board.addExternalCard({ url: 'https://example.com/', title: '打开的网页标题', source: 'tab' }, group.id, 1)
    const tabCard = board.state.cards.find((item) => item.slot === 1 && item.groupId === group.id)
    assert.equal(tabCard.title, '打开的网页标题')
    assert.equal(tabCard.titleSource, 'tab')
    memory.set('xuye_dashboard_v4', JSON.stringify({
      version: 3,
      groups: [{ id: 'legacy', title: '原分组' }],
      cards: [{ id: 'old', url: 'https://example.com/', title: '自定义名称', groupId: 'legacy', slot: 5 }],
      settings: { backgroundIntervalMinutes: 0, rotationTimingVersion: 1, currentBackground: first, onboardingCompleted: false, retainedSetting: 'keep' }
    }))
    await board.load()
    assert.equal(board.state.cards[0].slot, 6, 'five-to-six column migration keeps old second-row first-column placement')
    assert.equal(Object.hasOwn(board.state, 'onboardingOpen'), false)
    assert.equal(board.state.cards[0].title, '自定义名称')
    assert.equal(board.state.settings.retainedSetting, 'keep', 'obsolete guidance flags do not invalidate existing settings')
    await board.setAppearance('brightness', 60)
    const retained = JSON.parse(memory.get('xuye_dashboard_v4'))
    assert.equal(retained.settings.retainedSetting, 'keep')
    assert.equal(retained.settings.onboardingCompleted, false, 'removing the guide does not destructively rewrite legacy settings')
    for (let index = 0; index < 10; index++) await tick()
  } finally {
    board?.dispose()
    Object.assign(globalThis, { chrome: originals.chrome, fetch: originals.fetch, Image: originals.Image, localStorage: originals.localStorage, setTimeout: originals.setTimeout, clearTimeout: originals.clearTimeout })
    Date.now = originals.now
    await server.close()
  }
})
