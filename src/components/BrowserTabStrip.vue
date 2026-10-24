<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Globe, Volume2, X } from 'lucide-vue-next'
import { isDemo, demoTabs } from '../utils/demoData'
import { t } from '../utils/i18n'

const tabs = ref([])
const imageErrors = reactive({})
const pageZoom = ref(1)
const stripStyle = computed(() => ({
  '--ui-scale': String(1 / pageZoom.value),
  // A definite width prevents flex:auto from shrinking to title min-content.
  // Chrome does not expose its native strip's measured tab widths to extensions.
  '--tab-list-width': `${tabs.value.reduce((width, tab) => width + (tab.pinned ? 42 : 240), 0) / pageZoom.value}px`
}))
let windowId = null
let ownTabId = null
let zoomEvent = null
let previousStripHeight = ''
let previousTabHeight = ''
let refreshTimer = 0
let refreshSequence = 0
let disposed = false
let draggedUntil = 0
const subscriptions = []

function applyZoom(value) {
  if (disposed) return
  const numeric = Number(value)
  pageZoom.value = Number.isFinite(numeric) && numeric >= 0.25 && numeric <= 5 ? numeric : 1
  if (globalThis.document?.documentElement) {
    document.documentElement.style.setProperty('--browser-strip-height', `${8 / pageZoom.value}px`)
    document.documentElement.style.setProperty('--browser-tab-height', `${40 / pageZoom.value}px`)
  }
}

function handleZoomChange(change) {
  if (change.tabId === ownTabId) applyZoom(change.newZoomFactor)
}

function isWebpage(tab) {
  return /^https?:\/\//i.test(tab.url || tab.pendingUrl || '')
}

function imageKey(tab) {
  return `${tab.id}:${tab.url || ''}:${tab.favIconUrl || ''}`
}

function cachedFavicon(tab) {
  const url = tab.url || tab.pendingUrl
  if (!url || !globalThis.chrome?.runtime?.getURL) return ''
  const icon = new URL(chrome.runtime.getURL('/_favicon/'))
  icon.searchParams.set('pageUrl', url)
  icon.searchParams.set('size', '32')
  return icon.href
}

function iconFor(tab) {
  const errors = imageErrors[imageKey(tab)] || 0
  const favicon = tab.favIconUrl || ''
  const sources = [favicon, cachedFavicon(tab)].filter(Boolean)
  return sources[errors] || ''
}

async function refresh() {
  if (disposed || !globalThis.chrome?.tabs?.query) return
  const sequence = ++refreshSequence
  try {
    const result = await chrome.tabs.query(windowId === null ? { currentWindow: true } : { windowId })
    if (disposed || sequence !== refreshSequence) return
    tabs.value = result.filter(isWebpage).sort((a, b) => a.index - b.index)
    const keys = new Set(tabs.value.map(imageKey))
    for (const key of Object.keys(imageErrors)) {
      if (!keys.has(key)) delete imageErrors[key]
    }
  } catch {
    // A window can disappear while Chrome is delivering the last tab event.
  }
}

function queueRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refresh, 40)
}

function subscribe(event) {
  if (!event?.addListener) return
  event.addListener(queueRefresh)
  subscriptions.push(event)
}

async function activate(tab) {
  if (isDemo) return
  if (Date.now() < draggedUntil || !globalThis.chrome?.tabs?.update) return
  try {
    await chrome.tabs.update(tab.id, { active: true })
  } catch {
    queueRefresh()
  }
}

async function close(tab) {
  if (isDemo) return
  if (!globalThis.chrome?.tabs?.remove) return
  try {
    await chrome.tabs.remove(tab.id)
  } catch {
    queueRefresh()
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function startDrag(event, tab) {
  if (!isWebpage(tab)) {
    event.preventDefault()
    return
  }
  const url = tab.url || tab.pendingUrl
  const title = tab.title || url
  const iconUrl = tab.favIconUrl || cachedFavicon(tab)
  const payload = { id: tab.id, url, title, iconUrl }
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-qiye-page', JSON.stringify(payload))
  event.dataTransfer.setData('text/uri-list', url)
  event.dataTransfer.setData('text/plain', url)
  event.dataTransfer.setData('text/html', `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`)
  draggedUntil = Date.now() + 400
}

function endDrag() {
  draggedUntil = Date.now() + 300
}

onMounted(async () => {
  previousStripHeight = document.documentElement.style.getPropertyValue('--browser-strip-height')
  previousTabHeight = document.documentElement.style.getPropertyValue('--browser-tab-height')
  applyZoom(1)
  if (isDemo) { tabs.value = demoTabs; return }
  if (!globalThis.chrome?.tabs) return
  const api = chrome.tabs
  for (const event of [api.onCreated, api.onRemoved, api.onUpdated, api.onMoved, api.onActivated, api.onAttached, api.onDetached]) subscribe(event)
  try {
    if (api.getCurrent) {
      const ownTab = await api.getCurrent()
      ownTabId = ownTab?.id ?? null
      windowId = ownTab?.windowId ?? null
    }
    if (windowId === null && chrome.windows?.getCurrent) {
      windowId = (await chrome.windows.getCurrent()).id ?? null
    }
  } catch {
    // currentWindow remains the scoped fallback for an extension document.
  }
  if (disposed) return
  if (api.onZoomChange?.addListener) {
    zoomEvent = api.onZoomChange
    zoomEvent.addListener(handleZoomChange)
  }
  if (api.getZoom) {
    try {
      applyZoom(ownTabId === null ? await api.getZoom() : await api.getZoom(ownTabId))
    } catch {
      applyZoom(1)
    }
  }
  await refresh()
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(refreshTimer)
  for (const event of subscriptions) event.removeListener(queueRefresh)
  zoomEvent?.removeListener(handleZoomChange)
  if (previousStripHeight) document.documentElement.style.setProperty('--browser-strip-height', previousStripHeight)
  else document.documentElement.style.removeProperty('--browser-strip-height')
  if (previousTabHeight) document.documentElement.style.setProperty('--browser-tab-height', previousTabHeight)
  else document.documentElement.style.removeProperty('--browser-tab-height')
})
</script>

<template>
  <div class="browser-tab-trigger" :style="stripStyle">
  <nav class="browser-tab-strip" :aria-label="t('当前窗口标签页副本')">
    <div class="browser-tab-list" role="tablist" :aria-label="t('已打开的标签页')">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="browser-tab"
        :class="{ active: tab.active, 'is-pinned': tab.pinned, 'can-drag': isWebpage(tab) }"
        role="tab"
        tabindex="0"
        :aria-selected="Boolean(tab.active)"
        :aria-label="tab.title || tab.url || t('新标签页')"
        :title="`${tab.title || t('新标签页')}${isWebpage(tab) ? '\n' + t('拖到下方分组添加卡片') : ''}`"
        :draggable="isWebpage(tab)"
        @click="activate(tab)"
        @keydown.enter.prevent="activate(tab)"
        @keydown.space.prevent="activate(tab)"
        @keydown.delete.prevent="close(tab)"
        @dragstart="startDrag($event, tab)"
        @dragend="endDrag"
      >
        <img v-if="iconFor(tab)" class="browser-tab-icon" :src="iconFor(tab)" alt="" draggable="false" @error="imageErrors[imageKey(tab)] = (imageErrors[imageKey(tab)] || 0) + 1" />
        <Globe v-else class="browser-tab-icon" :size="16" aria-hidden="true" />
        <span class="browser-tab-title">{{ tab.title || tab.url || t('新标签页') }}</span>
        <Volume2 v-if="tab.audible && !tab.mutedInfo?.muted" class="browser-tab-audio" :size="13" :aria-label="t('正在播放音频')" />
        <button v-if="!tab.pinned" class="browser-tab-close" type="button" :aria-label="t('关闭标签页：{title}', { title: tab.title || t('新标签页') })" :title="t('关闭标签页')" draggable="false" @pointerdown.stop @click.stop="close(tab)" @keydown.stop @dragstart.stop.prevent><X :size="13" /></button>
      </div>
    </div>
  </nav>
  </div>
</template>

<style scoped>
.browser-tab-trigger {
  position: relative;
  z-index: 50;
  width: 100%;
  height: calc(8px * var(--ui-scale));
}
.browser-tab-strip {
  position: absolute;
  z-index: 50;
  top: 0;
  left: 0;
  width: 100%;
  height: var(--browser-tab-height, calc(40px * var(--ui-scale)));
  display: flex;
  align-items: flex-end;
  gap: calc(8px * var(--ui-scale));
  padding: calc(5px * var(--ui-scale)) calc(12px * var(--ui-scale)) 0 calc(10px * var(--ui-scale));
  background: #202124;
  color: #bdc1c6;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  user-select: none;
  opacity: 0;
  pointer-events: none;
  transform: translateY(calc(-8px * var(--ui-scale)));
  transition: opacity 120ms ease, transform 120ms ease;
}
.browser-tab-trigger.demo-expanded .browser-tab-strip,
.browser-tab-trigger:hover .browser-tab-strip,
.browser-tab-trigger:focus-within .browser-tab-strip {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.browser-tab-list {
  display: flex;
  align-items: stretch;
  flex: 0 1 auto;
  width: var(--tab-list-width);
  min-width: 0;
  max-width: calc(100% - 40px * var(--ui-scale));
  height: calc(35px * var(--ui-scale));
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: #5f6368 transparent;
}
.browser-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(9px * var(--ui-scale));
  flex: 1 1 calc(240px * var(--ui-scale));
  min-width: calc(72px * var(--ui-scale));
  max-width: calc(240px * var(--ui-scale));
  height: calc(35px * var(--ui-scale));
  padding: 0 calc(9px * var(--ui-scale)) 0 calc(13px * var(--ui-scale));
  border-radius: calc(11px * var(--ui-scale)) calc(11px * var(--ui-scale)) 0 0;
  outline: none;
  cursor: default;
}
.browser-tab::after {
  content: "";
  position: absolute;
  right: 0;
  top: calc(8px * var(--ui-scale));
  bottom: calc(8px * var(--ui-scale));
  width: calc(1px * var(--ui-scale));
  background: #5f6368;
}
.browser-tab:hover { background: #303134; }
.browser-tab.active { color: #f1f3f4; background: #3c4043; }
.browser-tab.active::after, .browser-tab:hover::after { display: none; }
.browser-tab:focus-visible { box-shadow: inset 0 0 0 calc(2px * var(--ui-scale)) #8ab4f8; }
.browser-tab.can-drag { cursor: grab; }
.browser-tab.can-drag:active { cursor: grabbing; }
.browser-tab.is-pinned { flex: 0 0 calc(42px * var(--ui-scale)); min-width: calc(42px * var(--ui-scale)); max-width: calc(42px * var(--ui-scale)); justify-content: center; padding: 0 calc(10px * var(--ui-scale)); }
.browser-tab.is-pinned .browser-tab-title, .browser-tab.is-pinned .browser-tab-audio { display: none; }
.browser-tab-icon { width: calc(16px * var(--ui-scale)); height: calc(16px * var(--ui-scale)); flex: 0 0 calc(16px * var(--ui-scale)); object-fit: contain; }
.browser-tab-title { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: calc(12px * var(--ui-scale)); line-height: calc(18px * var(--ui-scale)); }
.browser-tab-audio { width: calc(13px * var(--ui-scale)); height: calc(13px * var(--ui-scale)); flex: 0 0 calc(13px * var(--ui-scale)); }
.browser-tab-close, .browser-tab-new {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.browser-tab-close { width: calc(20px * var(--ui-scale)); height: calc(20px * var(--ui-scale)); }
.browser-tab-close :deep(svg) { width: calc(13px * var(--ui-scale)); height: calc(13px * var(--ui-scale)); }
.browser-tab-new { width: calc(28px * var(--ui-scale)); height: calc(28px * var(--ui-scale)); align-self: center; margin-bottom: calc(3px * var(--ui-scale)); }
.browser-tab-new :deep(svg) { width: calc(18px * var(--ui-scale)); height: calc(18px * var(--ui-scale)); }
.browser-tab-close:hover, .browser-tab-new:hover { background: #ffffff21; }
.browser-tab-close:focus-visible, .browser-tab-new:focus-visible { outline: calc(2px * var(--ui-scale)) solid #8ab4f8; outline-offset: calc(-2px * var(--ui-scale)); }
</style>
