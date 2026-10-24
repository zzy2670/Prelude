import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseDownloadDirectory, safeWallpaperFilename, validateWallpaperUrl, wallpaperFilename } from '../src/utils/wallpaperLibrary.js'

test('wallpaper cache only accepts HTTPS URLs on the exact image service', () => {
  const url = 'https://images.unsplash.com/photo-123?auto=format&w=1920'
  assert.equal(validateWallpaperUrl(url), url)
  for (const value of ['https://images.unsplash.com.evil.example/photo', 'http://images.unsplash.com/photo', 'https://evil.example/photo', 'https://user:pass@images.unsplash.com/photo', 'https://images.unsplash.com:444/photo', 'javascript:alert(1)']) {
    assert.throws(() => validateWallpaperUrl(value))
  }
})

test('generated file names are unique by image ID and retain the actual image format', () => {
  assert.equal(wallpaperFilename('abc123', 'image/jpeg'), '序页壁纸-abc123.jpg')
  assert.equal(wallpaperFilename('abc123', 'image/webp'), '序页壁纸-abc123.webp')
  assert.notEqual(wallpaperFilename('abc123'), wallpaperFilename('xyz789'))
})

test('file names cannot introduce directory traversal or Windows reserved names', () => {
  const name = safeWallpaperFilename('../../收藏\\壁纸:*?"<>|.jpg')
  assert.equal(/[\\/:*?"<>|]/.test(name), false)
  assert.equal(name.startsWith('.'), false)
  assert.equal(safeWallpaperFilename('CON.jpg'), '_CON.jpg')
  assert.equal(safeWallpaperFilename('   '), '序页壁纸.jpg')
  assert.ok(safeWallpaperFilename('a'.repeat(500)).length <= 160)
})

test('unsupported folder picker reports a browser limitation instead of claiming success', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'showDirectoryPicker')
  Object.defineProperty(globalThis, 'showDirectoryPicker', { configurable: true, writable: true, value: undefined })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'showDirectoryPicker', previous)
    else delete globalThis.showDirectoryPicker
  })
  await assert.rejects(chooseDownloadDirectory(), /不支持选择默认文件夹/)
})
