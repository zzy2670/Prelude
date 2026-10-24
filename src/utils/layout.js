export const COLUMN_COUNT = 6

// During native dragover Chrome exposes types but keeps payloads protected.
export function acceptsDrop(dataTransfer) {
  return Array.from(dataTransfer?.types || []).some((type) => [
    'application/x-lucuro-card', 'application/x-qiye-page', 'text/uri-list', 'text/plain', 'text/html', 'text/x-moz-url', 'files'
  ].includes(type.toLowerCase()))
}

export function normalizeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export function fallbackTitle(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '新卡片'
  }
}

export function slotFromPoint(rect, clientX, clientY, columns = COLUMN_COUNT, rowHeight = 96, gap = 16) {
  const width = Math.max(1, rect.width)
  const columnWidth = Math.max(1, (width - gap * (columns - 1)) / columns)
  const x = Math.max(0, Math.min(width - 1, clientX - rect.left))
  const y = Math.max(0, clientY - rect.top)
  const column = Math.max(0, Math.min(columns - 1, Math.floor((x + gap / 2) / (columnWidth + gap))))
  const row = Math.max(0, Math.floor((y + gap / 2) / (rowHeight + gap)))
  return row * columns + column
}

export function firstFreeSlot(cards, groupId) {
  const occupied = new Set(cards.filter((card) => card.groupId === groupId).map((card) => card.slot))
  let slot = 0
  while (occupied.has(slot)) slot += 1
  return slot
}

export function insideDropWidth(rect, clientX) {
  return Boolean(rect && clientX >= rect.left && clientX <= rect.right)
}

// Edge bands and the gap insert; the middle of a card keeps replacement behavior.
export function cardDropTarget(rect, clientX, clientY, columns = COLUMN_COUNT, rowHeight = 96, gap = 16) {
  const slot = slotFromPoint(rect, clientX, clientY, columns, rowHeight, gap)
  const width = Math.max(1, (rect.width - gap * (columns - 1)) / columns)
  const pitch = width + gap
  const row = Math.floor(slot / columns)
  const column = slot % columns
  const offset = clientX - rect.left - column * pitch
  if (offset <= width * .24 && column > 0) return { slot, mode: 'insert' }
  if (offset >= width * .76 && column < columns - 1) return { slot: row * columns + column + 1, mode: 'insert' }
  return { slot, mode: 'replace' }
}

// Use one non-mutating plan for both the drag preview and the committed action.
export function insertionSlots(cards, preferredSlot, excludedId = '') {
  const occupied = new Map(cards.filter((card) => card.id !== excludedId).map((card) => [card.slot, card]))
  const shifts = new Map()
  for (let slot = preferredSlot; occupied.has(slot); slot++) shifts.set(occupied.get(slot).id, slot + 1)
  return shifts
}

export function nearestDropZone(zones, clientY) {
  return zones.reduce((best, zone) => {
    const distance = ({ rect }) => Math.max(rect.top - clientY, clientY - rect.bottom, 0)
    return !best || distance(zone) < distance(best) ? zone : best
  }, null)
}

export function nearestFreeSlot(cards, groupId, preferredSlot, columnPitch = 240, columns = COLUMN_COUNT) {
  const occupied = new Set(cards.filter((card) => card.groupId === groupId).map((card) => card.slot))
  if (!occupied.has(preferredSlot)) return preferredSlot
  const max = Math.max(preferredSlot, ...occupied)
  const candidates = (Math.floor(max / columns) + 2) * columns
  const row = Math.floor(preferredSlot / columns)
  const column = preferredSlot % columns
  let nearest = -1
  let distance = Infinity
  for (let slot = 0; slot < candidates; slot++) {
    if (occupied.has(slot)) continue
    const dy = (Math.floor(slot / columns) - row) * 112
    const dx = ((slot % columns) - column) * columnPitch
    const score = dx * dx + dy * dy
    if (score < distance) { distance = score; nearest = slot }
  }
  return nearest
}

export function rowsForCards(cards, groupId, minimumRows = 1) {
  const slots = cards.filter((card) => card.groupId === groupId).map((card) => card.slot)
  const highest = slots.length ? Math.max(...slots) : -1
  return Math.max(minimumRows, Math.floor(highest / COLUMN_COUNT) + 1)
}

export function parseDropData(dataTransfer) {
  const file = Array.from(dataTransfer?.files || []).find((item) => /\.url$/i.test(item.name || ''))
  if (file) return { kind: 'web-shortcut', name: file.name, file }
  const page = dataTransfer?.getData?.('application/x-qiye-page')
  if (page) {
    try {
      const parsed = JSON.parse(page)
      const url = normalizeUrl(parsed.url)
      if (url) return { kind: 'external', source: 'tab', url, title: String(parsed.title || fallbackTitle(url)), iconUrl: String(parsed.iconUrl || '') }
    } catch { /* Continue with standard URL formats. */ }
  }
  const internal = dataTransfer?.getData?.('application/x-lucuro-card')
  if (internal) {
    try {
      const parsed = JSON.parse(internal)
      if (parsed?.id) return { kind: 'internal', id: String(parsed.id) }
    } catch {
      // Continue with external URL parsing.
    }
  }

  const uriList = String(dataTransfer?.getData?.('text/uri-list') || '')
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith('#'))
  const plain = String(dataTransfer?.getData?.('text/plain') || '').trim()
  const moz = String(dataTransfer?.getData?.('text/x-moz-url') || '').split(/\r?\n/)
  const html = String(dataTransfer?.getData?.('text/html') || '')
  const href = html.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&')
  const candidates = [uriList, moz[0], href, ...plain.split(/\r?\n/)]
  const url = candidates.filter(Boolean).map(normalizeUrl).find((value) => /^https?:\/\//i.test(value))
  if (!url) return null

  let title = moz[1]?.trim() || ''
  const match = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)
  if (match) {
    title = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return { kind: 'external', url, title: title || fallbackTitle(url) }
}
