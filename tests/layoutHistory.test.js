import test from 'node:test'
import assert from 'node:assert/strict'
import { createLayoutHistory } from '../src/utils/layoutHistory.js'

function layout(title, slot = 0) {
  return {
    groups: [{ id: 'pinned', title: '置顶' }, { id: 'g', title }],
    cards: [{ id: 'c', title: '文档', groupId: 'g', slot }]
  }
}

test('empty history returns null without creating entries', () => {
  const history = createLayoutHistory()
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
  assert.equal(history.undo(layout('current')), null)
  assert.equal(history.redo(layout('current')), null)
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
})

test('multiple undo and redo operations preserve each layout step', () => {
  const history = createLayoutHistory()
  const first = layout('first', 0)
  const second = layout('second', 1)
  const third = layout('third', 7)
  history.record(first)
  history.record(second)
  assert.equal(history.canUndo, true)
  let current = history.undo(third)
  assert.deepEqual(current, second)
  assert.equal(history.canRedo, true)
  current = history.undo(current)
  assert.deepEqual(current, first)
  assert.equal(history.canUndo, false)
  current = history.redo(current)
  assert.deepEqual(current, second)
  assert.equal(history.canUndo, true)
  current = history.redo(current)
  assert.deepEqual(current, third)
  assert.equal(history.canRedo, false)
})

test('recording a new branch clears redo and preserves the branch origin', () => {
  const history = createLayoutHistory()
  const first = layout('first')
  const second = layout('second')
  history.record(first)
  const origin = history.undo(second)
  assert.equal(history.canRedo, true)
  history.record(origin)
  assert.equal(history.canRedo, false)
  assert.equal(history.redo(layout('branch')), null)
  assert.deepEqual(history.undo(layout('branch')), first)
})

test('snapshots are isolated from input and returned-object mutations', () => {
  const history = createLayoutHistory()
  const original = layout('original', 3)
  const current = layout('current', 9)
  history.record(original)
  original.groups[1].title = 'mutated input'
  original.cards[0].slot = 20
  const restored = history.undo(current)
  assert.deepEqual(restored, layout('original', 3))
  current.groups[1].title = 'mutated current'
  restored.cards[0].slot = 42
  const redone = history.redo(restored)
  assert.deepEqual(redone, layout('current', 9))
  redone.groups[1].title = 'mutated returned redo'
  assert.equal(history.undo(redone).cards[0].slot, 42)
})

test('clear removes both branches and permits fresh recording', () => {
  const history = createLayoutHistory()
  history.record(layout('first'))
  history.record(layout('second'))
  history.undo(layout('third'))
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, true)
  history.clear()
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
  assert.equal(history.undo(layout('third')), null)
  assert.equal(history.redo(layout('third')), null)
  history.record(layout('fresh'))
  assert.deepEqual(history.undo(layout('after fresh')), layout('fresh'))
})

test('history retains every recorded step without a fixed cap', () => {
  const history = createLayoutHistory()
  for (let index = 0; index < 1000; index++) history.record({ index })
  let current = { index: 1000 }
  for (let index = 999; index >= 0; index--) {
    current = history.undo(current)
    assert.deepEqual(current, { index })
  }
  assert.equal(history.canUndo, false)
  for (let index = 1; index <= 1000; index++) {
    current = history.redo(current)
    assert.deepEqual(current, { index })
  }
  assert.equal(history.canRedo, false)
})

test('identical recorded snapshots are not mistaken for a missing action', () => {
  const history = createLayoutHistory()
  history.record(layout('same'))
  history.record(layout('same'))
  let current = history.undo(layout('changed'))
  assert.deepEqual(current, layout('same'))
  assert.equal(history.canUndo, true)
  current = history.undo(current)
  assert.deepEqual(current, layout('same'))
  assert.equal(history.canUndo, false)
})
