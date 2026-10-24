import test from 'node:test'
import assert from 'node:assert/strict'
import { browserFaviconUrl, resolveBookmarkMetadata } from '../src/utils/browserMetadata.js'

function useChrome(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
  Object.defineProperty(globalThis, 'chrome', { configurable: true, writable: true, value })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'chrome', previous)
    else delete globalThis.chrome
  })
}

const runtime = { getURL: (path) => `chrome-extension://test-extension/${path.replace(/^\//, '')}` }

test('returns no fabricated bookmark name or network icon without Chrome APIs', async (t) => {
  useChrome(t, undefined)
  assert.deepEqual(await resolveBookmarkMetadata('https://example.com/'), { title: '', bookmarkId: '', iconUrl: '' })
})

test('favicon cache URL safely encodes the complete webpage URL', (t) => {
  useChrome(t, { runtime })
  const pageUrl = 'https://docs.example.com/doc?a=1&name=%E6%96%87%E6%A1%A3#part'
  const favicon = new URL(browserFaviconUrl(pageUrl))
  assert.equal(favicon.protocol, 'chrome-extension:')
  assert.equal(favicon.pathname, '/_favicon/')
  assert.equal(favicon.searchParams.get('pageUrl'), pageUrl)
  assert.equal(favicon.searchParams.get('size'), '64')
  assert.equal(browserFaviconUrl('javascript:alert(1)'), '')
})

test('exact bookmark ID preserves the chosen custom title for duplicate URLs', async (t) => {
  let searches = 0
  useChrome(t, {
    runtime,
    bookmarks: {
      get: async (id) => [{ id, title: '文档', url: 'https://docs.example.com/' }],
      search: async () => { searches += 1; return [] }
    }
  })
  const metadata = await resolveBookmarkMetadata('https://docs.example.com/', '42')
  assert.equal(metadata.title, '文档')
  assert.equal(metadata.bookmarkId, '42')
  assert.equal(searches, 0)
  assert.ok(metadata.iconUrl.startsWith('chrome-extension://'))
})

test('a stale bookmark ID falls back to an exact URL match only', async (t) => {
  let query
  useChrome(t, {
    runtime,
    bookmarks: {
      get: async () => { throw new Error('Bookmark removed') },
      search: async (input) => {
        query = input
        return [
          { id: 'wrong', title: '另一文档', url: 'https://docs.example.com/other' },
          { id: 'correct', title: '我的收藏夹名称', url: 'https://docs.example.com/' }
        ]
      }
    }
  })
  const metadata = await resolveBookmarkMetadata('https://docs.example.com/', 'deleted')
  assert.deepEqual(query, { url: 'https://docs.example.com/' })
  assert.equal(metadata.title, '我的收藏夹名称')
  assert.equal(metadata.bookmarkId, 'correct')
})

test('an ID pointing at a different URL does not overwrite the dragged page', async (t) => {
  useChrome(t, {
    runtime,
    bookmarks: {
      get: async () => [{ id: 'different', title: '错误名称', url: 'https://other.example.com/' }],
      search: async () => []
    }
  })
  const metadata = await resolveBookmarkMetadata('https://docs.example.com/', 'different')
  assert.equal(metadata.title, '')
  assert.equal(metadata.bookmarkId, '')
})

test('duplicate bookmark URLs use the exact title delivered by the drag', async (t) => {
  useChrome(t, {
    runtime,
    bookmarks: {
      search: async () => [
        { id: 'folder-label', title: '文件夹', url: 'https://docs.example.com/' },
        { id: 'document-label', title: '文档', url: 'https://docs.example.com/' }
      ]
    }
  })
  const selected = await resolveBookmarkMetadata('https://docs.example.com/', '', '文档')
  assert.equal(selected.title, '文档')
  assert.equal(selected.bookmarkId, 'document-label')
  const fallback = await resolveBookmarkMetadata('https://docs.example.com/', '', '未匹配名称')
  assert.equal(fallback.title, '文件夹')
})
