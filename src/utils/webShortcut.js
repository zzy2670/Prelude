import { t } from './i18n.js'
import { normalizeUrl } from './layout.js'

export async function readWebShortcut(payload) {
  if (payload?.kind !== 'web-shortcut') return payload
  const file = payload.file
  if (!file?.arrayBuffer || Number(file.size) > 65536) throw new Error(t('无法读取网页快捷方式。'))
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > 65536) throw new Error(t('无法读取网页快捷方式。'))
  const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8'
  const text = new TextDecoder(encoding).decode(bytes)
  const url = normalizeUrl(text.match(/^\s*URL\s*=\s*(.+)$/im)?.[1]?.trim())
  if (!url) throw new Error(t('网页快捷方式中没有有效的网页地址。'))
  return { kind: 'external', source: 'tab', title: String(payload.name || 'Website').replace(/\.url$/i, ''), url }
}
