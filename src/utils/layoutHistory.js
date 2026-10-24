function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot))
}

/** In-memory, unbounded undo/redo history for serializable layout snapshots. */
export function createLayoutHistory() {
  const undoStack = []
  const redoStack = []

  return {
    record(snapshot) {
      undoStack.push(cloneSnapshot(snapshot))
      redoStack.length = 0
    },

    undo(current) {
      if (!undoStack.length) return null
      const currentCopy = cloneSnapshot(current)
      const previous = undoStack.pop()
      redoStack.push(currentCopy)
      return cloneSnapshot(previous)
    },

    redo(current) {
      if (!redoStack.length) return null
      const currentCopy = cloneSnapshot(current)
      const next = redoStack.pop()
      undoStack.push(currentCopy)
      return cloneSnapshot(next)
    },

    clear() {
      undoStack.length = 0
      redoStack.length = 0
    },

    get canUndo() {
      return undoStack.length > 0
    },

    get canRedo() {
      return redoStack.length > 0
    }
  }
}
