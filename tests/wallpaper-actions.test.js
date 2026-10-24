import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

function memoryIndexedDB() {
  const stores = new Map()
  const deletions = []
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()) },
    transaction(name) {
      const transaction = {
        objectStore() {
          function request(operation) {
            const result = {}
            queueMicrotask(() => {
              try {
                result.result = operation(stores.get(name))
                queueMicrotask(() => transaction.oncomplete?.())
              } catch (error) {
                transaction.error = error
                transaction.onerror?.()
              }
            })
            return result
          }
          return {
            get: (key) => request((store) => store.get(key)),
            put: (value) => request((store) => store.set(value.id || value.key, value)),
            delete: (key) => request((store) => { deletions.push({ name, key }); return store.delete(key) })
          }
        }
      }
      return transaction
    },
    close() {}
  }
  return {
    stores,
    deletions,
    open() {
      const request = {}
      queueMicrotask(() => {
        request.result = database
        request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    }
  }
}

async function withWallpapers(run) {
  const names = ['location', 'chrome', 'fetch', 'indexedDB']
  const originals = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  const cache = memoryIndexedDB()
  const requests = []
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  let board
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: { href: 'https://example.test/?demo=zh' } })
    Object.defineProperty(globalThis, 'chrome', { configurable: true, writable: true, value: undefined })
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: cache })
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async (url) => {
      requests.push(url)
      return { ok: true, url, blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) }
    } })
    const { useDashboard } = await server.ssrLoadModule('/src/store.js')
    board = useDashboard()
    await board.load()
    await board.persist('background', { currentBackground: 'https://images.unsplash.com/favorite-a', backgroundIntervalMinutes: 0 })
    await run(board, { cache, requests })
  } finally {
    board?.dispose()
    await server.close()
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
}

test('the heart toggles saved wallpaper, persists removal, and leaves the background displayed', async () => {
  await withWallpapers(async (board, { cache, requests }) => {
    const background = board.state.settings.currentBackground
    await board.favoriteWallpaper()
    assert.equal(board.state.wallpapers.length, 1)
    const first = { ...board.state.wallpapers[0] }
    assert.ok(cache.stores.get('images').has(first.id), 'saving caches the actual image')
    await board.favoriteWallpaper()
    assert.equal(board.state.wallpapers.length, 0)
    assert.equal(board.state.settings.currentBackground, background)
    assert.equal(cache.stores.get('images').has(first.id), false, 'unsaving removes only the image cache')
    await board.load()
    assert.equal(board.state.wallpapers.length, 0, 'unsaving survives reload')
    assert.equal(board.state.settings.currentBackground, background)
    await board.favoriteWallpaper()
    assert.equal(board.state.wallpapers.length, 1, 'the next click can save the same wallpaper again')
    assert.equal(board.state.wallpapers[0].id, first.id)
    assert.equal(requests.length, 2, 'the removed cached image is fetched again when resaved')
    assert.equal(board.state.wallpaperBusy, false)
  })
})

test('album deletion removes just the chosen favorite and cache without clearing the current background', async () => {
  await withWallpapers(async (board, { cache }) => {
    await board.favoriteWallpaper()
    const first = { ...board.state.wallpapers[0] }
    await board.persist('background', { currentBackground: 'https://images.unsplash.com/favorite-b' })
    await board.favoriteWallpaper()
    const second = { ...board.state.wallpapers[0] }
    const background = board.state.settings.currentBackground
    assert.equal(await board.removeFavoriteWallpaper(second), true)
    assert.deepEqual(board.state.wallpapers.map((record) => record.id), [first.id])
    assert.equal(board.state.settings.currentBackground, background)
    assert.equal(cache.stores.get('images').has(first.id), true)
    assert.equal(cache.stores.get('images').has(second.id), false)
    await board.load()
    assert.deepEqual(board.state.wallpapers.map((record) => record.id), [first.id])
    assert.equal(await board.removeFavoriteWallpaper('missing-id'), false)
    assert.equal(board.state.wallpaperBusy, false)
  })
})

test('busy wallpaper work blocks repeated favorite and removal actions', async () => {
  await withWallpapers(async (board, { requests }) => {
    board.state.wallpaperBusy = true
    await board.favoriteWallpaper()
    assert.equal(await board.removeFavoriteWallpaper('any-id'), false)
    assert.equal(board.state.wallpapers.length, 0)
    assert.equal(requests.length, 0)
    board.state.wallpaperBusy = false
    await Promise.all([board.favoriteWallpaper(), board.favoriteWallpaper()])
    assert.equal(board.state.wallpapers.length, 1)
    assert.equal(requests.length, 1, 'a fast double click cannot save and immediately unsave')
  })
})

test('optional cache cleanup failure does not restore removed favorites or alter the wallpaper', async () => {
  await withWallpapers(async (board, { cache }) => {
    await board.favoriteWallpaper()
    const record = { ...board.state.wallpapers[0] }
    const background = board.state.settings.currentBackground
    cache.stores.get('images').delete = () => { throw new Error('Cache is temporarily unavailable') }
    assert.equal(await board.removeFavoriteWallpaper(record), true)
    assert.equal(board.state.wallpapers.length, 0)
    assert.equal(board.state.settings.currentBackground, background)
    assert.equal(board.state.wallpaperBusy, false)
    await board.load()
    assert.equal(board.state.wallpapers.length, 0)
  })
})
