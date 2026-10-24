<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, ExternalLink, Image, X } from 'lucide-vue-next'
import { getWallpaperPreview, validateWallpaperUrl } from '../utils/wallpaperLibrary'
import { t } from '../utils/i18n'

const props = defineProps({ wallpapers: { type: Array, default: () => [] }, busy: Boolean })
const emit = defineEmits(['close', 'download', 'download-all', 'remove'])
const panel = ref(null)
const previews = ref({})
const previewUrls = new Set()
let generation = 0
let disposed = false

function revoke(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function clearPreviews() {
  for (const url of previewUrls) revoke(url)
  previewUrls.clear()
  previews.value = {}
}

async function refreshPreviews() {
  const current = ++generation
  clearPreviews()
  await Promise.all(props.wallpapers.map(async (wallpaper) => {
    let url
    try {
      url = await getWallpaperPreview(wallpaper)
    } catch {
      url = /^https:\/\/images\.unsplash\.com\//i.test(wallpaper.url || '') ? wallpaper.url : ''
    }
    if (disposed || current !== generation) {
      revoke(url)
      return
    }
    if (url?.startsWith('blob:')) previewUrls.add(url)
    previews.value[wallpaper.id] = url || ''
  }))
}

function originalUrl(wallpaper) {
  try { return validateWallpaperUrl(wallpaper.url) } catch { return '' }
}

function handleKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'Tab') {
    const controls = [...(panel.value?.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]') || [])]
    if (!controls.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

watch(() => props.wallpapers.map((wallpaper) => `${wallpaper.id}|${wallpaper.url}`).join('\n'), refreshPreviews, { immediate: true })
onMounted(() => panel.value?.focus())
onBeforeUnmount(() => {
  disposed = true
  generation += 1
  clearPreviews()
})
</script>

<template>
  <div class="album-backdrop" @mousedown.self="emit('close')">
    <section ref="panel" class="album-panel" role="dialog" aria-modal="true" aria-labelledby="album-title" tabindex="-1" @keydown="handleKey">
      <header class="album-header">
        <div class="album-heading"><h2 id="album-title">{{ t('收藏壁纸') }}</h2><span class="album-count">{{ t('{count} 张', { count: wallpapers.length }) }}</span></div>
        <div class="album-actions">
          <button type="button" class="album-download-all" :disabled="busy || !wallpapers.length" @click="emit('download-all')"><Download :size="16" />{{ busy ? t('下载中') : t('全部下载') }}</button>
          <button type="button" class="album-close" :aria-label="t('关闭相册')" @click="emit('close')"><X :size="20" /></button>
        </div>
      </header>
      <div v-if="wallpapers.length" class="album-scroll">
        <div class="album-grid">
          <figure v-for="wallpaper in wallpapers" :key="wallpaper.id" class="album-photo">
            <img v-if="previews[wallpaper.id]" class="album-image" :src="previews[wallpaper.id]" :alt="wallpaper.name || t('收藏的壁纸')" loading="lazy" draggable="false" />
            <div v-else class="album-placeholder" :aria-label="t('图片加载中')"><Image :size="24" /></div>
            <a v-if="originalUrl(wallpaper)" class="album-photo-original" :href="originalUrl(wallpaper)" target="_blank" rel="noopener noreferrer" :aria-label="t('图片原网址：{name}', { name: wallpaper.name || t('收藏的壁纸') })" :title="t('打开图片原网址')"><ExternalLink :size="18" /></a>
            <button type="button" class="album-photo-remove" :disabled="busy" :aria-label="t('删除收藏壁纸：{name}', { name: wallpaper.name || t('收藏的壁纸') })" :title="t('删除收藏壁纸')" @click="emit('remove', wallpaper)"><X :size="17" /></button>
            <button type="button" class="album-photo-download" :disabled="busy" :aria-label="t('下载壁纸：{name}', { name: wallpaper.name || t('收藏的壁纸') })" :title="t('下载壁纸')" @click="emit('download', wallpaper)"><Download :size="18" /></button>
          </figure>
        </div>
      </div>
      <div v-else class="album-empty"><Image :size="36" /><p>{{ t('还没有收藏的壁纸') }}</p></div>
    </section>
  </div>
</template>

<style scoped>
.album-backdrop { position: fixed; inset: 0; z-index: 110; display: grid; place-items: center; padding: 32px; background: rgba(0,0,0,.28); }
.album-panel { width: min(1040px, 100%); max-height: 80vh; display: flex; flex-direction: column; padding: 26px; border: 0; border-radius: 24px; outline: none; color: #f4f4f2; background: #252729; box-shadow: 0 30px 110px rgba(0,0,0,.36); }
.album-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-shrink: 0; padding-bottom: 22px; }
.album-heading, .album-actions { display: flex; align-items: center; gap: 12px; }
.album-heading h2 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: .02em; }
.album-count { color: #a6aaa9; font-size: 13px; white-space: nowrap; }
.album-actions button { font: inherit; color: inherit; border: 0; cursor: pointer; }
.album-download-all { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 13px; border-radius: 11px; background: #3b3e40; font-size: 13px !important; }
.album-download-all:hover { background: #4b5051; }
.album-close { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: transparent; }
.album-close:hover { background: #ffffff12; }
.album-actions button:disabled { opacity: .45; cursor: default; }
.album-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; scrollbar-width: thin; scrollbar-color: #606565 transparent; }
.album-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 16px; }
.album-photo { position: relative; align-self: start; margin: 0; overflow: hidden; border: 0; border-radius: 15px; background: #1b1d1f; }
.album-image { display: block; width: 100%; height: auto; border: 0; }
.album-placeholder { min-height: 140px; display: grid; place-items: center; color: #737b7c; }
.album-photo-download, .album-photo-remove, .album-photo-original { position: absolute; display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 11px; color: #fff; background: rgba(28,31,33,.88); opacity: 0; cursor: pointer; transition: opacity 120ms ease, background 120ms ease; }
.album-photo-download { right: 10px; bottom: 10px; }
.album-photo-original { left: 10px; top: 10px; text-decoration: none; }
.album-photo-remove { right: 10px; top: 10px; }
.album-photo:hover .album-photo-download, .album-photo:focus-within .album-photo-download,
.album-photo:hover .album-photo-remove, .album-photo:focus-within .album-photo-remove,
.album-photo:hover .album-photo-original, .album-photo:focus-within .album-photo-original { opacity: 1; }
.album-photo-download:disabled, .album-photo-remove:disabled { cursor: default; }
.album-photo:hover .album-photo-download:disabled, .album-photo:focus-within .album-photo-download:disabled,
.album-photo:hover .album-photo-remove:disabled, .album-photo:focus-within .album-photo-remove:disabled { opacity: .45; }
.album-photo-original:hover, .album-photo-download:hover { background: #4b5558; }
.album-photo-remove:hover { background: #a83842; }
.album-panel button:focus-visible, .album-panel a:focus-visible { outline: 2px solid #d3ddd9; outline-offset: 3px; }
.album-empty { min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: #a6aaa9; }
.album-empty p { margin: 0; font-size: 14px; }
@media (max-width: 760px) { .album-backdrop { padding: 18px; } .album-panel { padding: 18px; } .album-header { gap: 10px; } .album-heading { gap: 7px; } .album-heading h2 { font-size: 18px; } .album-grid { gap: 10px; } .album-photo { border-radius: 11px; } }
</style>
