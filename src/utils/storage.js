const extensionStorage = globalThis.chrome?.storage?.local

export const storage = {
  async get(key) {
    if (extensionStorage) {
      const result = await extensionStorage.get(key)
      return result[key]
    }
    const raw = localStorage.getItem(key)
    try {
      return raw ? JSON.parse(raw) : null
    } catch {
      return raw
    }
  },

  async set(key, value) {
    const payload = { [key]: value }
    if (extensionStorage) {
      await extensionStorage.set(payload)
      return
    }
    localStorage.setItem(key, JSON.stringify(value))
  },

  async remove(key) {
    if (extensionStorage) {
      await extensionStorage.remove(key)
      return
    }
    localStorage.removeItem(key)
  }
}
