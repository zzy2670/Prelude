import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptsDrop, cardDropTarget, firstFreeSlot, insideDropWidth, insertionSlots, nearestDropZone, nearestFreeSlot, normalizeUrl, parseDropData, rowsForCards, slotFromPoint } from '../src/utils/layout.js'

test('accepts protected native drag by types without reading its payload', () => {
  const transfer = { types: ['text/uri-list'], getData() { throw new Error('Payload is protected') } }
  assert.equal(acceptsDrop(transfer), true)
  assert.equal(acceptsDrop({ types: ['Files'] }), true)
})

test('parses browser URL drops only after delivery', () => {
  const transfer = (data) => ({ getData: (type) => data[type] || '' })
  assert.equal(parseDropData(transfer({ 'text/uri-list': '# title\nhttps://example.com/path' })).url, 'https://example.com/path')
  assert.deepEqual(parseDropData(transfer({ 'text/x-moz-url': 'https://example.com/\n页面标题' })), { kind: 'external', url: 'https://example.com/', title: '页面标题' })
  assert.equal(parseDropData(transfer({ 'text/html': '<a href="https://example.com/?a=1&amp;b=2">网页</a>' })).url, 'https://example.com/?a=1&b=2')
})

test('file drops accept Internet Shortcuts and reject local launchers', () => {
  const file = { name: 'Website.url' }
  assert.deepEqual(parseDropData({ files: [file], getData: () => '' }), { kind: 'web-shortcut', name: 'Website.url', file })
  assert.equal(parseDropData({ files: [{ name: 'Workbench.lnk' }], getData: () => '' }), null)
  assert.equal(parseDropData({ getData: (type) => type === 'text/uri-list' ? 'file:///example/Workbench.lnk' : '' }), null)
  assert.equal(parseDropData({ files: [{ name: 'photo.png' }], getData: () => '' }), null)
})

test('replicated tab drop keeps its exact title and does not become a card move', () => {
  const transfer = { types: ['application/x-qiye-page'], getData: (type) => type === 'application/x-qiye-page' ? JSON.stringify({ url: 'https://example.com/path', title: '正在打开的网页', iconUrl: 'https://example.com/logo.png' }) : '' }
  assert.equal(acceptsDrop(transfer), true)
  assert.deepEqual(parseDropData(transfer), { kind: 'external', source: 'tab', url: 'https://example.com/path', title: '正在打开的网页', iconUrl: 'https://example.com/logo.png' })
})

test('normalizes only http and https links', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/')
  assert.equal(normalizeUrl('javascript:alert(1)'), '')
  assert.equal(normalizeUrl('file:///c:/secret.txt'), '')
})

test('maps a pointer to one of six persistent columns', () => {
  const rect = { left: 100, top: 50, width: 580 }
  assert.equal(slotFromPoint(rect, 101, 51), 0)
  assert.equal(slotFromPoint(rect, 679, 51), 5)
  assert.equal(slotFromPoint(rect, 101, 163), 6)
})

test('preserves holes and adds rows only when needed', () => {
  const cards = [
    { groupId: 'g', slot: 0 },
    { groupId: 'g', slot: 2 },
    { groupId: 'g', slot: 4 }
  ]
  assert.equal(firstFreeSlot(cards, 'g'), 1)
  assert.equal(rowsForCards(cards, 'g', 1), 1)
  cards.push({ groupId: 'g', slot: 6 })
  assert.equal(rowsForCards(cards, 'g', 1), 2)
})

test('gaps snap across their midpoint to the nearest card position', () => {
  const rect = { left: 0, top: 0, width: 580 }
  assert.equal(slotFromPoint(rect, 90, 10), 0)
  assert.equal(slotFromPoint(rect, 95, 10), 1)
  assert.equal(slotFromPoint(rect, 10, 108), 6)
})

test('only side margins reject drops; headers and vertical gaps resolve a group', () => {
  const rect = { left: 110, right: 900 }
  assert.equal(insideDropWidth(rect, 109), false)
  assert.equal(insideDropWidth(rect, 901), false)
  for (const x of [110, 500, 900]) assert.equal(insideDropWidth(rect, x), true)
  const zones = [{ groupId: 'pinned', rect: { top: 60, bottom: 156 } }, { groupId: 'g', rect: { top: 240, bottom: 336 } }]
  assert.equal(nearestDropZone(zones, 5).groupId, 'pinned')
  assert.equal(nearestDropZone(zones, 180).groupId, 'pinned')
  assert.equal(nearestDropZone(zones, 220).groupId, 'g')
  assert.equal(nearestDropZone(zones, 900).groupId, 'g')
})

test('occupied external drops use the nearest free position at the actual grid width', () => {
  const cards = Array.from({ length: 18 }, (_, slot) => ({ groupId: 'g', slot })).filter(({ slot }) => ![2, 13].includes(slot))
  assert.equal(nearestFreeSlot(cards, 'g', 0, 596 / 6), 2)
  assert.equal(nearestFreeSlot(cards, 'g', 0, 240), 13)
  assert.equal(nearestFreeSlot(cards, 'g', 2), 2)
})

test('card edges and the gap insert, while its central area keeps replacement', () => {
  const rect = { left: 0, top: 0, width: 680 }
  assert.deepEqual(cardDropTarget(rect, 95, 30), { slot: 1, mode: 'insert' })
  assert.deepEqual(cardDropTarget(rect, 108, 30), { slot: 1, mode: 'insert' })
  assert.deepEqual(cardDropTarget(rect, 125, 30), { slot: 1, mode: 'insert' })
  assert.deepEqual(cardDropTarget(rect, 165, 30), { slot: 1, mode: 'replace' })
  assert.deepEqual(cardDropTarget(rect, 210, 30), { slot: 2, mode: 'insert' })
})

test('insertion preview shifts only the occupied chain and wraps naturally into a new row', () => {
  const cards = [{ id: 'a', slot: 4 }, { id: 'b', slot: 5 }, { id: 'c', slot: 6 }, { id: 'd', slot: 9 }]
  assert.deepEqual([...insertionSlots(cards, 5)], [['b', 6], ['c', 7]])
  assert.deepEqual([...insertionSlots(cards, 5, 'b')], [])
  assert.deepEqual(cards.map((card) => card.slot), [4, 5, 6, 9])
})
