import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const KEY = 'xuye_dashboard_v4'
const clone = (value) => JSON.parse(JSON.stringify(value))
const tick = () => new Promise((resolve) => setImmediate(resolve))

function initialLayout(groups = [], cards = []) {
  return {
    version: 3,
    layoutColumns: 6,
    groups: [{ id: 'pinned', title: '置顶', fixed: true }, ...groups],
    cards,
    wallpapers: [],
    settings: { rotationTimingVersion: 1, backgroundIntervalMinutes: 0, currentBackground: 'https://images.unsplash.com/initial', backgroundChangedAt: 1000000, rotationAnchorAt: 1000000, backgroundPool: [] }
  }
}

function card(id, groupId, slot) {
  return { id, groupId, slot, title: id, titleSource: 'manual', url: `https://example.com/${id}` }
}

test('deleting a middle row shifts later rows without deleting its default group and is reversible', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '新分组' }], [card('A', 'g', 1), card('B', 'g', 7), card('C', 'g', 14)]), async (board) => {
    const before = layout(board)
    await board.deleteRow('g', 1)
    assert.ok(board.state.groups.some((group) => group.id === 'g'))
    assert.deepEqual(board.state.cards.map(({ id, slot }) => ({ id, slot })), [{ id: 'A', slot: 1 }, { id: 'C', slot: 8 }])
    const after = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.deepEqual(layout(board), after)
  })
})

test('deleting the final row removes only its empty default group and undo restores its cards exactly', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '新分组' }, { id: 'other', title: 'Other' }], [card('A', 'g', 0), card('B', 'g', 5), card('Other', 'other', 3)]), async (board, context) => {
    const before = layout(board)
    await board.deleteRow('g', 0)
    assert.equal(board.state.groups.some((group) => group.id === 'g'), false)
    assert.equal(board.state.cards.length, 1)
    assert.equal(board.state.cards[0].id, 'Other')
    const after = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.deepEqual(layout(board), after)
    await board.load()
    for (let i = 0; i < 8; i++) await tick()
    await board.persist('background', { rotationAnchorAt: 1000001 })
    await board.setAppearance('brightness', 60)
    assert.deepEqual(layout(board), after)
    assert.equal(context.readSaved().groups.some((group) => group.id === 'g'), false)
    await board.removeGroup('other')
    assert.equal(board.state.cards.length, 0)
    await board.undo()
    assert.deepEqual(layout(board), after)
  })
})

test('deleting the final card cleans a default group but keeps custom empty groups and the pinned group', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '新分组' }, { id: 'custom', title: 'Named' }], [card('A', 'g', 0), card('B', 'custom', 0), card('P', 'pinned', 0)]), async (board) => {
    const before = layout(board)
    await board.removeCard('A')
    assert.equal(board.state.groups.some((group) => group.id === 'g'), false)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.equal(board.state.groups.some((group) => group.id === 'g'), false)
    await board.deleteRow('custom', 0)
    assert.equal(board.state.groups.some((group) => group.id === 'custom'), true)
    await board.deleteRow('pinned', 0)
    assert.equal(board.state.groups.some((group) => group.id === 'pinned'), true)
    await board.deleteRow('custom', 0)
    assert.equal(board.state.groups.some((group) => group.id === 'custom'), true)
    await board.removeGroup('custom')
    assert.equal(board.state.groups.some((group) => group.id === 'custom'), false)
  })
})

test('clearing an empty custom group title cleans the resulting default group with exact undo and redo', async () => {
  await withBoard(initialLayout([{ id: 'g', title: 'Custom empty' }]), async (board, context) => {
    const before = layout(board)
    await board.renameGroup('g', '   ')
    assert.equal(board.state.groups.some((group) => group.id === 'g'), false)
    const after = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.deepEqual(layout(board), after)
    await board.load()
    for (let i = 0; i < 8; i++) await tick()
    await board.persist('background', { rotationAnchorAt: 1000002 })
    assert.deepEqual(layout(board), after)
    assert.equal(context.readSaved().groups.some((group) => group.id === 'g'), false)
  })
})

function external(id) {
  return { kind: 'external', source: 'tab', title: id, url: `https://example.com/${id}` }
}

function layout(board) {
  return clone({ groups: board.state.groups, cards: board.state.cards })
}

async function withBoard(saved, run, legacy) {
  const originals = {
    chrome: globalThis.chrome, fetch: globalThis.fetch, Image: globalThis.Image,
    localStorage: globalThis.localStorage, setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout, now: Date.now
  }
  let clock = 1000000
  let sequence = 0
  const timers = new Map()
  const memory = new Map()
  if (saved !== undefined) memory.set(KEY, JSON.stringify(saved))
  if (legacy !== undefined) memory.set('lucuro_dashboard_v3', JSON.stringify(legacy))
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  let board
  try {
    globalThis.chrome = undefined
    Date.now = () => clock
    globalThis.localStorage = { getItem: (key) => memory.get(key), setItem: (key, value) => memory.set(key, value) }
    globalThis.setTimeout = (callback, delay) => { const id = ++sequence; timers.set(id, { callback, due: clock + delay }); return id }
    globalThis.clearTimeout = (id) => timers.delete(id)
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ images: [1, 2, 3].map((id) => ({ urls: { full: `https://images.unsplash.com/test-${id}` } })) }) })
    globalThis.Image = class { set src(value) { if (value) queueMicrotask(() => this.onload?.()) } }
    const { useDashboard } = await server.ssrLoadModule('/src/store.js')
    board = useDashboard()
    await board.load()
    for (let index = 0; index < 8; index++) await tick()
    await run(board, {
      timers, memory, advance: (milliseconds) => { clock += milliseconds },
      readSaved: () => JSON.parse(memory.get(KEY))
    })
  } finally {
    board?.dispose()
    Object.assign(globalThis, {
      chrome: originals.chrome, fetch: originals.fetch, Image: originals.Image,
      localStorage: originals.localStorage, setTimeout: originals.setTimeout,
      clearTimeout: originals.clearTimeout
    })
    Date.now = originals.now
    await server.close()
  }
}

test('three composite group drops undo and redo as three complete actions', async () => {
  await withBoard(initialLayout(), async (board) => {
    const start = layout(board)
    await board.addInNewGroup(external('A'), 0)
    const first = layout(board)
    const firstCardId = board.state.cards[0].id
    await board.addInNewGroup(external('B'), 8, 1)
    const second = layout(board)
    await board.addInNewGroup({ kind: 'internal', id: firstCardId }, 4)
    const third = layout(board)
    assert.equal(board.state.groups.length, 3, 'moving the final card prunes its now-empty default group')
    assert.equal(board.state.cards.length, 2)
    await board.undo()
    assert.deepEqual(layout(board), second)
    await board.undo()
    assert.deepEqual(layout(board), first)
    await board.undo()
    assert.deepEqual(layout(board), start, 'one undo of the initial composite removes its group and card together')
    await board.redo()
    assert.deepEqual(layout(board), first)
    await board.redo()
    assert.deepEqual(layout(board), second)
    await board.redo()
    assert.deepEqual(layout(board), third)
  })
})

test('external drops on a full row find a free nearby row and save one reversible action', async () => {
  const cards = Array.from({ length: 6 }, (_, slot) => card(`old-${slot}`, 'pinned', slot))
  await withBoard(initialLayout([], cards), async (board, { readSaved }) => {
    const before = layout(board)
    assert.equal(await board.addExternalCard(external('added'), 'pinned', 3, 100), true)
    assert.equal(board.state.cards.find((item) => item.title === 'added').slot, 9)
    assert.equal(readSaved().cards.length, 7)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.equal(board.state.cards.find((item) => item.title === 'added').slot, 9)
  })
})

test('moving the final card removes only an unnamed default group and pin restoration recreates it', async () => {
  await withBoard(initialLayout([
    { id: 'default', title: '新分组' }, { id: 'named', title: '保留的空分组' }
  ], [card('A', 'default', 3)]), async (board) => {
    const before = layout(board)
    await board.moveCard('A', 'pinned', 0)
    assert.ok(!board.state.groups.some((group) => group.id === 'default'))
    assert.ok(board.state.groups.some((group) => group.id === 'named'))
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    await board.togglePin('A')
    assert.ok(board.state.groups.some((group) => group.id === 'default' && group.title === '新分组'))
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').slot, 3)
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').groupId, 'default')
  })
})

test('clearing a group title restores the default title, preserves cards, and supports undo', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '鸣潮' }], [card('A', 'g', 3)]), async (board, { readSaved }) => {
    const before = layout(board)
    await board.renameGroup('g', '   ')
    assert.equal(board.state.groups.find((group) => group.id === 'g').title, '新分组')
    assert.equal(readSaved().groups.find((group) => group.id === 'g').title, '新分组')
    assert.deepEqual(board.state.cards, before.cards)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.equal(board.state.groups.find((group) => group.id === 'g').title, '新分组')
    await board.renameGroup('pinned', '')
    assert.equal(board.state.groups[0].title, '置顶')
  })
})

test('deleting a row shifts later slots and undo restores cards and pinned return slots', async () => {
  const pinned = { ...card('P', 'pinned', 0), originalGroupId: 'g', originalGroupTitle: '工作', originalSlot: 19 }
  await withBoard(initialLayout([{ id: 'g', title: '工作' }], [
    pinned, card('A', 'g', 0), card('B', 'g', 7), card('C', 'g', 13)
  ]), async (board) => {
    const before = layout(board)
    await board.deleteRow('g', 1)
    assert.ok(!board.state.cards.some((entry) => entry.id === 'B'))
    assert.equal(board.state.cards.find((entry) => entry.id === 'C').slot, 7)
    assert.equal(board.state.cards.find((entry) => entry.id === 'P').originalSlot, 13)
    const after = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.deepEqual(layout(board), after)
  })
})

test('group reordering keeps the pinned group fixed and each move is reversible', async () => {
  await withBoard(initialLayout([
    { id: 'a', title: '甲' }, { id: 'b', title: '乙' }, { id: 'c', title: '丙' }
  ]), async (board) => {
    const ids = () => board.state.groups.map((group) => group.id)
    await board.moveGroup('a', 4)
    assert.deepEqual(ids(), ['pinned', 'b', 'c', 'a'])
    await board.moveGroup('pinned', 4)
    assert.deepEqual(ids(), ['pinned', 'b', 'c', 'a'])
    await board.moveGroup('c', 0)
    assert.deepEqual(ids(), ['pinned', 'c', 'b', 'a'])
    await board.undo()
    assert.deepEqual(ids(), ['pinned', 'b', 'c', 'a'])
    await board.undo()
    assert.deepEqual(ids(), ['pinned', 'a', 'b', 'c'])
    await board.redo()
    await board.redo()
    assert.deepEqual(ids(), ['pinned', 'c', 'b', 'a'])
  })
})

test('saving a new interval anchors its full delay at the save time', async () => {
  await withBoard(initialLayout(), async (board, fixture) => {
    fixture.advance(15000)
    const savedAt = Date.now()
    await board.setBackgroundInterval(5)
    assert.equal(fixture.readSaved().settings.rotationAnchorAt, savedAt)
    assert.ok([...fixture.timers.values()].some((timer) => timer.due === savedAt + 300000))
  })
})

test('legacy migration preserves appearance preferences and wallpaper favorites', async () => {
  const legacy = initialLayout([{ id: 'work', title: '工作' }], [card('A', 'work', 2)])
  legacy.settings.brightness = 31
  legacy.settings.cardOpacity = 72
  legacy.settings.backgroundIntervalMinutes = 7
  legacy.wallpapers = [{ id: 'saved-wallpaper', url: 'https://images.unsplash.com/saved' }]
  await withBoard(undefined, async (board, fixture) => {
    assert.equal(board.state.settings.brightness, 31)
    assert.equal(board.state.settings.cardOpacity, 72)
    assert.equal(board.state.settings.backgroundIntervalMinutes, 7)
    assert.deepEqual(clone(board.state.wallpapers), legacy.wallpapers)
    assert.deepEqual(fixture.readSaved().wallpapers, legacy.wallpapers)
    assert.equal(fixture.readSaved().settings.brightness, 31)
  }, legacy)
})

test('a stale drop cannot move a card into a group removed by another page', async () => {
  await withBoard(initialLayout([{ id: 'source', title: '来源' }], [card('A', 'source', 2)]), async (board, fixture) => {
    const before = layout(board)
    await board.moveCard('A', 'already-removed', 0)
    assert.deepEqual(layout(board), before)
    assert.equal(fixture.readSaved().cards.find((entry) => entry.id === 'A').groupId, 'source')
  })
})

test('unpin restores the original slot even when its pinned slot has the same number', async () => {
  await withBoard(initialLayout([{ id: 'source', title: '来源' }], [
    card('other-pinned', 'pinned', 0), card('A', 'source', 1)
  ]), async (board) => {
    await board.togglePin('A')
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').slot, 1)
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').groupId, 'pinned')
    await board.togglePin('A')
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').groupId, 'source')
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').slot, 1)
  })
})

test('same-group insertion excludes the source and shifts only the contiguous occupied chain', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '工作' }], [
    card('A', 'g', 0), card('B', 'g', 1), card('C', 'g', 2), card('far', 'g', 5)
  ]), async (board, { readSaved }) => {
    const before = layout(board)
    assert.equal(await board.insertCard({ kind: 'internal', id: 'C' }, 'g', 0), true)
    const slots = Object.fromEntries(board.state.cards.map((entry) => [entry.id, entry.slot]))
    assert.deepEqual(slots, { A: 1, B: 2, C: 0, far: 5 })
    assert.ok(!board.state.cards.some((entry) => [3, 4].includes(entry.slot)), 'unrelated empty holes remain empty')
    const after = layout(board)
    assert.deepEqual(readSaved().cards, after.cards)
    await board.undo()
    assert.deepEqual(layout(board), before, 'the whole insertion is one undo step')
    await board.redo()
    assert.deepEqual(layout(board), after)
  })
})

test('same-group rightward insertion leaves its old hole and a same-slot drop is a no-op', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '工作' }], [card('A', 'g', 0), card('B', 'g', 1), card('C', 'g', 2), card('far', 'g', 8)]), async (board) => {
    const before = layout(board)
    assert.equal(await board.insertCard({ kind: 'internal', id: 'A' }, 'g', 2), true)
    assert.deepEqual(Object.fromEntries(board.state.cards.map((entry) => [entry.id, entry.slot])), { A: 2, B: 1, C: 3, far: 8 })
    assert.ok(!board.state.cards.some((entry) => entry.slot === 0))
    const after = layout(board)
    assert.equal(await board.insertCard({ kind: 'internal', id: 'A' }, 'g', 2), true)
    assert.deepEqual(layout(board), after)
    await board.undo()
    assert.deepEqual(layout(board), before, 'the same-slot no-op never consumes another undo step')
    await board.redo()
    assert.deepEqual(layout(board), after)
  })
})

test('cross-group insertion wraps the last column, prunes an empty default source, and preserves central swap', async () => {
  await withBoard(initialLayout([
    { id: 'source', title: '新分组' }, { id: 'target', title: '工作' }
  ], [card('moving', 'source', 2), card('before', 'target', 4), card('C', 'target', 5), card('D', 'target', 6), card('after-gap', 'target', 8), card('far', 'target', 20)]), async (board) => {
    const before = layout(board)
    assert.equal(await board.insertCard({ kind: 'internal', id: 'moving' }, 'target', 5), true)
    const positions = Object.fromEntries(board.state.cards.map((entry) => [entry.id, [entry.groupId, entry.slot]]))
    assert.deepEqual(positions, { moving: ['target', 5], before: ['target', 4], C: ['target', 6], D: ['target', 7], 'after-gap': ['target', 8], far: ['target', 20] })
    assert.ok(!board.state.groups.some((group) => group.id === 'source'))
    const after = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.deepEqual(layout(board), after)
    await board.undo()
    await board.moveCard('moving', 'target', 5)
    assert.equal(board.state.cards.find((entry) => entry.id === 'C').groupId, 'source', 'central move retains the original two-card swap')
    assert.equal(board.state.cards.find((entry) => entry.id === 'C').slot, 2)
    assert.equal(board.state.cards.find((entry) => entry.id === 'D').slot, 6)
  })
})

test('external insertion keeps its exact title and icon, wraps a full row, and is atomically reversible', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '工作' }], [
    ...Array.from({ length: 6 }, (_, slot) => card(`old-${slot}`, 'g', slot)), card('after-gap', 'g', 9)
  ]), async (board, { readSaved }) => {
    const before = layout(board)
    assert.equal(await board.insertCard({ ...external('inserted'), title: '网页的原始标题', iconUrl: 'https://example.com/icon.png' }, 'g', 1), true)
    const added = board.state.cards.find((entry) => entry.title === '网页的原始标题')
    assert.ok(added)
    assert.equal(added.slot, 1)
    assert.equal(added.iconUrl, 'https://example.com/icon.png')
    assert.equal(added.titleSource, 'tab')
    assert.equal(board.state.cards.find((entry) => entry.id === 'old-0').slot, 0)
    for (let old = 1; old < 6; old++) assert.equal(board.state.cards.find((entry) => entry.id === `old-${old}`).slot, old + 1)
    assert.equal(board.state.cards.find((entry) => entry.id === 'after-gap').slot, 9)
    const after = layout(board)
    assert.deepEqual(readSaved().cards, after.cards)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.redo()
    assert.deepEqual(layout(board), after)
  })
})

test('external bookmark insertion resolves the saved title before making the insertion', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '工作' }]), async (board) => {
    globalThis.chrome = {
      runtime: { getURL: (path) => `chrome-extension://test/${path.replace(/^\//, '')}` },
      bookmarks: { search: async () => [{ id: 'doc', title: '文档', url: 'https://example.com/document' }] }
    }
    assert.equal(await board.insertCard({ kind: 'external', url: 'https://example.com/document', title: 'wrong-hostname' }, 'g', 5), true)
    const added = board.state.cards[0]
    assert.equal(added.title, '文档')
    assert.equal(added.bookmarkId, 'doc')
    assert.equal(added.titleSource, 'bookmark')
    assert.equal(added.slot, 5)
    await board.undo()
    assert.equal(board.state.cards.length, 0)
    assert.ok(board.state.groups.some((group) => group.id === 'g'))
  })
})

test('external insertion waits for bookmark metadata before shifting any occupied slot', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '工作' }], [card('A', 'g', 0), card('B', 'g', 1)]), async (board) => {
    let completeSearch
    globalThis.chrome = { bookmarks: { search: () => new Promise((resolve) => { completeSearch = resolve }) } }
    const before = layout(board)
    assert.equal(await board.insertCard({ kind: 'external', url: 'javascript:alert(1)' }, 'g', 0), false)
    assert.equal(completeSearch, undefined, 'invalid URLs are rejected before metadata work')
    const pending = board.insertCard({ kind: 'external', url: 'https://example.com/document', title: 'fallback' }, 'g', 0)
    for (let index = 0; index < 8 && !completeSearch; index++) await tick()
    assert.equal(typeof completeSearch, 'function')
    assert.deepEqual(layout(board), before, 'no slot is shifted while metadata is unresolved')
    completeSearch([{ id: 'doc', title: '文档', url: 'https://example.com/document' }])
    assert.equal(await pending, true)
    assert.equal(board.state.cards.find((entry) => entry.id === 'A').slot, 1)
    assert.equal(board.state.cards.find((entry) => entry.id === 'B').slot, 2)
    assert.equal(board.state.cards.find((entry) => entry.title === '文档').slot, 0)
    await board.undo()
    assert.deepEqual(layout(board), before)
  })
})

test('invalid insertion payloads, stale targets and invalid slots never shift cards or consume undo', async () => {
  await withBoard(initialLayout([{ id: 'g', title: '工作' }], [card('A', 'g', 0), card('B', 'g', 1)]), async (board, { readSaved }) => {
    const start = layout(board)
    await board.renameGroup('g', '重命名')
    const before = layout(board)
    for (const [payload, groupId, slot] of [
      [{ kind: 'external', url: 'javascript:alert(1)' }, 'g', 0],
      [{ kind: 'internal', id: 'missing-card' }, 'g', 0],
      [external('valid'), 'missing-group', 0],
      [{ kind: 'unknown', url: 'https://example.com/' }, 'g', 0],
      [null, 'g', 0],
      [external('valid'), 'g', -1],
      [external('valid'), 'g', 0.5],
      [external('valid'), 'g', Number.NaN]
    ]) {
      assert.equal(await board.insertCard(payload, groupId, slot), false)
      assert.deepEqual(layout(board), before)
    }
    assert.deepEqual(readSaved().cards, before.cards)
    await board.undo()
    assert.deepEqual(layout(board), start, 'failed insertions did not create hidden undo steps')
  })
})

test('insertion preserves pin return metadata for shifted cards and updates only the moved card', async () => {
  const pinned = { ...card('P', 'pinned', 0), originalGroupId: 'origin', originalGroupTitle: '来源', originalGroupIndex: 1, originalSlot: 8 }
  await withBoard(initialLayout([{ id: 'origin', title: '新分组' }], [pinned, card('moving', 'origin', 3)]), async (board) => {
    assert.equal(await board.insertCard({ kind: 'internal', id: 'moving' }, 'pinned', 0), true)
    assert.ok(!board.state.groups.some((group) => group.id === 'origin'))
    const shifted = board.state.cards.find((entry) => entry.id === 'P')
    const moved = board.state.cards.find((entry) => entry.id === 'moving')
    assert.equal(shifted.slot, 1)
    assert.equal(shifted.originalSlot, 8, 'shifting inside the pinned group never shifts its original return slot')
    assert.equal(moved.originalGroupId, 'origin')
    assert.equal(moved.originalGroupTitle, '新分组')
    assert.equal(moved.originalSlot, 3)
    await board.togglePin('moving')
    assert.equal(board.state.cards.find((entry) => entry.id === 'moving').groupId, 'origin')
    assert.equal(board.state.cards.find((entry) => entry.id === 'moving').slot, 3)
    assert.equal(board.state.cards.find((entry) => entry.id === 'P').originalSlot, 8)
    await board.insertCard({ kind: 'internal', id: 'P' }, 'origin', 1)
    assert.equal(board.state.cards.find((entry) => entry.id === 'P').originalGroupId, '')
    assert.equal(board.state.cards.find((entry) => entry.id === 'P').originalSlot, 0)
  })
})


test('alternate page stores an independent layout, shares preferences and returns to primary on reload', async () => {
  await withBoard(initialLayout([{ id: 'g', title: 'Primary' }], [card('A', 'g', 2)]), async (board, context) => {
    const primary = layout(board)
    assert.equal(board.state.pageMode, 'primary')
    await board.togglePage()
    assert.equal(board.state.pageMode, 'alternate')
    assert.equal(board.state.cards.length, 0)
    assert.deepEqual(board.state.groups, [{ id: 'pinned', title: '置顶', fixed: true }])
    await board.addInNewGroup(external('B'), 8)
    await board.setAppearance('brightness', 42)
    await board.setLanguage('en')
    const alternate = layout(board)
    const saved = context.readSaved()
    assert.deepEqual(saved.groups, primary.groups)
    assert.equal(saved.cards[0].id, 'A')
    assert.equal(saved.alternateLayout.cards[0].title, 'B')
    await board.togglePage()
    assert.deepEqual(layout(board), primary)
    assert.equal(board.state.settings.brightness, 42)
    assert.equal(board.state.settings.language, 'en')
    await board.togglePage()
    assert.deepEqual(layout(board), alternate)
    await board.load()
    for (let i = 0; i < 8; i++) await tick()
    assert.equal(board.state.pageMode, 'primary')
    assert.deepEqual(layout(board), primary)
    assert.deepEqual(context.readSaved().alternateLayout.cards, saved.alternateLayout.cards)
  })
})

test('switching pages clears undo and redo so actions never modify the other layout', async () => {
  await withBoard(initialLayout(), async (board, context) => {
    await board.addInNewGroup(external('Primary'), 0)
    const primary = layout(board)
    await board.togglePage()
    const emptyAlternate = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), emptyAlternate)
    await board.addInNewGroup(external('Alternate'), 3)
    const alternate = layout(board)
    await board.undo()
    assert.deepEqual(layout(board), emptyAlternate)
    await board.redo()
    assert.deepEqual(layout(board), alternate)
    await board.togglePage()
    await board.undo()
    await board.redo()
    assert.deepEqual(layout(board), primary)
    assert.equal(context.readSaved().alternateLayout.cards[0].title, 'Alternate')
    await board.togglePage()
    await board.undo()
    assert.deepEqual(layout(board), alternate)
  })
})

test('page switching waits for a slow bookmark drop and rejects new actions during the switch', async () => {
  await withBoard(initialLayout([{ id: 'g', title: 'Primary' }]), async (board, context) => {
    let finish
    globalThis.chrome = { bookmarks: { search: () => new Promise((resolve) => { finish = resolve }) } }
    const adding = board.addExternalCard({ kind: 'external', url: 'https://example.com/slow', title: 'Slow' }, 'g', 0)
    for (let i = 0; i < 3; i++) await tick()
    assert.equal(typeof finish, 'function')
    const switching = board.togglePage()
    assert.equal(board.state.pageSwitching, true)
    assert.equal(await board.addInNewGroup(external('Rejected'), 0), false)
    assert.equal(await board.togglePage(), false)
    assert.equal(board.state.pageMode, 'primary')
    finish([])
    await adding
    await switching
    assert.equal(board.state.pageMode, 'alternate')
    assert.equal(board.state.pageSwitching, false)
    assert.equal(board.state.cards.length, 0)
    assert.equal(context.readSaved().cards[0].title, 'Slow')
    assert.equal(context.readSaved().alternateLayout, undefined, 'switch state itself is not persisted')
    await board.togglePage()
    assert.equal(board.state.cards[0].title, 'Slow')
  })
})

test('storage events update only the selected page layout while settings remain shared', async () => {
  await withBoard(initialLayout([{ id: 'g', title: 'Primary' }], [card('A', 'g', 0)]), async (board, context) => {
    let listener
    globalThis.chrome = { storage: { onChanged: { addListener(fn) { listener = fn }, removeListener() {} } } }
    await board.load()
    for (let i = 0; i < 8; i++) await tick()
    await board.togglePage()
    await board.addInNewGroup(external('B'), 0)
    const alternate = layout(board)
    const incoming = context.readSaved()
    incoming.cards[0].title = 'Changed in another tab'
    incoming.settings.brightness = 33
    incoming.__revision += 10
    incoming.__writer = 'another-tab'
    context.memory.set(KEY, JSON.stringify(incoming))
    listener({ [KEY]: { newValue: incoming } }, 'local')
    assert.deepEqual(layout(board), alternate)
    assert.equal(board.state.settings.brightness, 33)
    incoming.alternateLayout.cards[0].title = 'Alternate changed in another tab'
    incoming.__revision++
    context.memory.set(KEY, JSON.stringify(incoming))
    listener({ [KEY]: { newValue: incoming } }, 'local')
    assert.equal(board.state.cards[0].title, 'Alternate changed in another tab')
    await board.togglePage()
    assert.equal(board.state.cards[0].title, 'Changed in another tab')
  })
})


test('legacy keepEmpty flags cannot keep empty default groups alive after loading or row cleanup', async () => {
  await withBoard(initialLayout([{ id: 'old', title: '新分组', keepEmpty: true }, { id: 'custom', title: 'Named', keepEmpty: true }]), async (board, context) => {
    assert.equal(board.state.groups.some((group) => group.id === 'old'), false)
    assert.equal(board.state.groups.some((group) => group.id === 'custom'), true)
    assert.equal(Object.hasOwn(board.state.groups.find((group) => group.id === 'custom'), 'keepEmpty'), false)
    assert.equal(context.readSaved().groups.some((group) => group.id === 'old'), false)
    const withOldAlternate = context.readSaved()
    withOldAlternate.alternateLayout = { groups: [{ id: 'old-alt', title: '新分组', keepEmpty: true }, { id: 'named-alt', title: 'Named alternate' }], cards: [], layoutColumns: 6 }
    context.memory.set(KEY, JSON.stringify(withOldAlternate))
    await board.togglePage()
    assert.equal(board.state.groups.some((group) => group.id === 'old-alt'), false)
    assert.equal(board.state.groups.some((group) => group.id === 'named-alt'), true)
    await board.togglePage()
    await board.addInNewGroup(external('A'), 0)
    const afterAdd = layout(board)
    await board.deleteRow('custom', 0)
    assert.deepEqual(layout(board), afterAdd)
    await board.undo()
    assert.equal(board.state.cards.length, 0, 'empty row cleanup does not consume a hidden undo step')
    assert.equal(board.state.groups.some((group) => group.id === 'stale'), false)
    await board.redo()
    assert.deepEqual(layout(board), afterAdd)
    const stale = context.readSaved()
    stale.groups.push({ id: 'stale', title: '新分组', keepEmpty: true })
    context.memory.set(KEY, JSON.stringify(stale))
    await board.deleteRow('stale', 0)
    assert.equal(board.state.groups.some((group) => group.id === 'stale'), false)
    await board.undo()
    await board.redo()
    assert.equal(board.state.groups.some((group) => group.id === 'stale'), false, 'automatic empty-group cleanup never resurrects an invalid history state')
  })
})

test('page switching waits for URL file reads before adding a card to its originating page', async () => {
  await withBoard(initialLayout([{ id: 'g', title: 'Primary' }]), async (board, context) => {
    let finish
    const bytes = new TextEncoder().encode('[InternetShortcut]\r\nURL=https://example.com/file-card\r\n')
    const payload = { kind: 'web-shortcut', name: 'Saved page.url', file: { arrayBuffer: () => new Promise((resolve) => { finish = resolve }) } }
    const adding = board.addWebShortcut(payload, 'g', 0)
    for (let i = 0; i < 3; i++) await tick()
    const switching = board.togglePage()
    assert.equal(board.state.pageSwitching, true)
    assert.equal(board.state.cards.length, 0)
    finish(bytes.buffer)
    assert.equal(await adding, true)
    await switching
    assert.equal(board.state.pageMode, 'alternate')
    assert.equal(board.state.cards.length, 0)
    assert.equal(context.readSaved().cards[0].url, 'https://example.com/file-card')
    assert.equal(context.readSaved().cards[0].title, 'Saved page')
    assert.equal(Object.hasOwn(context.readSaved().cards[0], 'file'), false)
    await board.togglePage()
    assert.equal(board.state.cards[0].title, 'Saved page')
  })
})

test('URL file import can insert or create a group atomically without consuming failed-import undo', async () => {
  await withBoard(initialLayout([{ id: 'g', title: 'Primary' }], [card('A', 'g', 0)]), async (board) => {
    const bytes = new TextEncoder().encode('[InternetShortcut]\nURL=https://example.com/new\n')
    const payload = { kind: 'web-shortcut', name: 'New page.url', file: { arrayBuffer: async () => bytes.buffer } }
    const before = layout(board)
    await board.addWebShortcut(payload, 'g', 0, 'insert')
    assert.equal(board.state.cards.find((item) => item.id === 'A').slot, 1)
    assert.equal(board.state.cards.find((item) => item.title === 'New page').slot, 0)
    await board.undo()
    assert.deepEqual(layout(board), before)
    await board.addWebShortcutInNewGroup(payload, 8)
    assert.equal(board.state.groups.length, 3)
    const imported = layout(board)
    const badBytes = new TextEncoder().encode('[InternetShortcut]\nURL=file:///unsafe\n')
    assert.equal(await board.addWebShortcutInNewGroup({ ...payload, file: { arrayBuffer: async () => badBytes.buffer } }, 0), false)
    assert.deepEqual(layout(board), imported)
    await board.undo()
    assert.deepEqual(layout(board), before)
  })
})
