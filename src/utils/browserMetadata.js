function webpageUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''
  } catch {
    return ''
  }
}

/** Use Chrome's own favicon cache, including profile-specific and visited icons. */
export function browserFaviconUrl(url, size = 64) {
  const pageUrl = webpageUrl(url)
  if (!pageUrl || !globalThis.chrome?.runtime?.getURL) return ''
  try {
    const icon = new URL(chrome.runtime.getURL('/_favicon/'))
    icon.searchParams.set('pageUrl', pageUrl)
    icon.searchParams.set('size', String(Math.max(16, Math.min(256, Number(size) || 64))))
    return icon.href
  } catch {
    return ''
  }
}

/** Read a bookmark's user-assigned title without changing the bookmark tree. */
export async function resolveBookmarkMetadata(url, bookmarkId = '', preferredTitle = '') {
  const pageUrl = webpageUrl(url)
  const result = { title: '', bookmarkId: '', iconUrl: browserFaviconUrl(pageUrl) }
  if (!pageUrl || !globalThis.chrome?.bookmarks) return result

  const matches = (node) => Boolean(node?.url) && webpageUrl(node.url) === pageUrl
  let bookmark
  if (bookmarkId && typeof chrome.bookmarks.get === 'function') {
    try {
      const nodes = await chrome.bookmarks.get(String(bookmarkId))
      bookmark = nodes?.find(matches)
    } catch {
      // A removed or inaccessible ID can still be recovered by exact URL.
    }
  }
  if (!bookmark && typeof chrome.bookmarks.search === 'function') {
    try {
      const nodes = await chrome.bookmarks.search({ url: pageUrl })
      const matching = nodes?.filter(matches) || []
      bookmark = matching.find((node) => preferredTitle && node.title === preferredTitle) || matching[0]
    } catch {
      // No bookmark permission or unavailable API: keep the caller's title.
    }
  }
  if (bookmark) {
    result.title = String(bookmark.title || '')
    result.bookmarkId = String(bookmark.id || '')
  }
  return result
}
