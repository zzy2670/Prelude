const DATABASE_NAME = 'qiye-wallpapers'
const DIRECTORY_KEY = 'defaultDirectory'
let databasePromise

export function validateWallpaperUrl(value) {
  let url
  try { url = new URL(String(value || '')) } catch { throw new Error('壁纸地址无效。') }
  if (url.protocol !== 'https:' || url.hostname !== 'images.unsplash.com' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('只能收藏 Bonjourr 素材源中的 Unsplash 壁纸。')
  }
  return url.href
}

export function safeWallpaperFilename(value) {
  let name = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '')
  if (!name) name = '序页壁纸.jpg'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
  return name.slice(0, 160).replace(/[.\s]+$/g, '')
}

export function wallpaperFilename(id, mimeType = 'image/jpeg') {
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' }
  const extension = extensions[String(mimeType).toLowerCase().split(';')[0]] || 'jpg'
  return safeWallpaperFilename(`序页壁纸-${String(id).replace(/[^a-z\d_-]/gi, '').slice(0, 80) || 'image'}.${extension}`)
}

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前浏览器无法使用本地壁纸收藏。'))
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences', { keyPath: 'key' })
      }
      request.onerror = () => reject(request.error || new Error('无法打开本地壁纸收藏。'))
      request.onblocked = () => reject(new Error('壁纸收藏正在其他页面升级，请关闭旧页面后重试。'))
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => { db.close(); databasePromise = null }
        resolve(db)
      }
    }).catch((error) => { databasePromise = null; throw error })
  }
  return databasePromise
}

async function accessStore(name, mode, action) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode)
    let request
    try { request = action(transaction.objectStore(name)) } catch (error) { reject(error); return }
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onerror = () => reject(transaction.error || request?.error || new Error('本地壁纸收藏操作失败。'))
    transaction.onabort = () => reject(transaction.error || new Error('本地壁纸收藏操作已中止。'))
  })
}

async function imageId(url) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function metadata(image) {
  return { id: image.id, url: image.url, name: image.name, createdAt: image.createdAt }
}

export async function cacheWallpaper(value) {
  const url = validateWallpaperUrl(value)
  const id = await imageId(url)
  const existing = await accessStore('images', 'readonly', (store) => store.get(id))
  if (existing?.blob?.size > 0) return metadata(existing)
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`壁纸下载失败（${response.status}）。`)
  if (response.url) validateWallpaperUrl(response.url)
  const blob = await response.blob()
  if (!blob.size || !/^image\//i.test(blob.type)) throw new Error('素材源没有返回有效图片，尚未收藏。')
  const image = { id, url, name: wallpaperFilename(id, blob.type), createdAt: Date.now(), blob }
  await accessStore('images', 'readwrite', (store) => store.put(image))
  return metadata(image)
}

export async function getWallpaperPreview(record) {
  try {
    const image = await accessStore('images', 'readonly', (store) => store.get(String(record?.id || '')))
    if (image?.blob?.size > 0) return URL.createObjectURL(image.blob)
  } catch {
    // A missing local cache can still display the original saved source.
  }
  try { return validateWallpaperUrl(record?.url) } catch { return '' }
}

/** Delete only our IndexedDB image cache; never touch the displayed wallpaper or downloaded files. */
export async function removeCachedWallpaper(id) {
  const key = String(id || '')
  if (!key) return false
  await accessStore('images', 'readwrite', (store) => store.delete(key))
  return true
}

export async function chooseDownloadDirectory() {
  if (typeof globalThis.showDirectoryPicker !== 'function') throw new Error('当前浏览器不支持选择默认文件夹；下载将使用 Chrome 的默认下载位置。')
  let handle
  try {
    handle = await showDirectoryPicker({ id: 'qiye-wallpapers', mode: 'readwrite' })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('已取消选择文件夹。')
    throw new Error('无法选择文件夹，请在浏览器允许访问后重试。')
  }
  await accessStore('preferences', 'readwrite', (store) => store.put({ key: DIRECTORY_KEY, handle }))
  return { name: handle.name }
}

async function directoryHandle() {
  const preference = await accessStore('preferences', 'readonly', (store) => store.get(DIRECTORY_KEY))
  return preference?.handle || null
}

export async function getDownloadDirectoryName() {
  try { return (await directoryHandle())?.name || '' } catch { return '' }
}

export async function clearDownloadDirectory() {
  await accessStore('preferences', 'readwrite', (store) => store.delete(DIRECTORY_KEY))
}

async function cachedImage(record) {
  if (!record?.id) throw new Error('未找到这张壁纸的收藏记录。')
  let image = await accessStore('images', 'readonly', (store) => store.get(String(record.id)))
  if (!image?.blob?.size) {
    const restored = await cacheWallpaper(record.url)
    image = await accessStore('images', 'readonly', (store) => store.get(restored.id))
  }
  if (!image?.blob?.size) throw new Error('本地壁纸文件不可用，请重新收藏。')
  return image
}

/** Call from the user's download click; permission requests need user activation. */
export async function downloadWallpaper(record) {
  const image = await cachedImage(record)
  const name = safeWallpaperFilename(image.name || record.name)
  const handle = await directoryHandle()
  if (handle) {
    const options = { mode: 'readwrite' }
    let permission = await handle.queryPermission(options)
    if (permission !== 'granted') permission = await handle.requestPermission(options)
    if (permission !== 'granted') throw new Error('尚未允许写入收藏文件夹，请授权或清除默认文件夹后使用 Chrome 下载。')
    const file = await handle.getFileHandle(name, { create: true })
    const writable = await file.createWritable()
    try {
      await writable.write(image.blob)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => {})
      throw error
    }
    return { method: 'directory', name, directoryName: handle.name }
  }
  if (!globalThis.chrome?.downloads?.download) throw new Error('当前浏览器无法后台下载文件，请选择可写入的默认文件夹。')
  const objectUrl = URL.createObjectURL(image.blob)
  try {
    const downloadId = await chrome.downloads.download({ url: objectUrl, filename: `壁纸收藏/${name}`, saveAs: false, conflictAction: 'uniquify' })
    const timer = setTimeout(() => URL.revokeObjectURL(objectUrl), 120000)
    timer.unref?.()
    return { method: 'browser', name, downloadId }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function downloadAll(records) {
  const result = { downloaded: [], failed: [] }
  for (const record of records || []) {
    try {
      result.downloaded.push({ id: record.id, ...await downloadWallpaper(record) })
    } catch (error) {
      result.failed.push({ id: record?.id || '', name: record?.name || '', error: error?.message || '下载失败。' })
    }
  }
  return result
}
