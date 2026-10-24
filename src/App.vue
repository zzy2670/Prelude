<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Settings, Heart, Images } from 'lucide-vue-next'
import GroupSection from './components/GroupSection.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import BrowserTabStrip from './components/BrowserTabStrip.vue'
import WallpaperAlbum from './components/WallpaperAlbum.vue'
import PageToggle from './components/PageToggle.vue'
import { useDashboard } from './store'
import { acceptsDrop, insideDropWidth, nearestDropZone, parseDropData, slotFromPoint } from './utils/layout'
import { locale, t } from './utils/i18n'
import { isDemo } from './utils/demoData'

const dashboard = useDashboard()
const { state, groupsWithCards } = dashboard
const activeGap = ref(null)
const groupDrag = ref(false)
const demoScene = isDemo ? new URL(location.href).searchParams.get('scene') : ''
const scrollPositions = { primary: 0, alternate: 0 }
async function togglePage() {
  if (state.pageSwitching) return
  scrollPositions[state.pageMode] = window.scrollY
  endDrag()
  state.settingsOpen = false
  state.albumOpen = false
  if (await dashboard.togglePage()) {
    await nextTick()
    window.scrollTo({ top: scrollPositions[state.pageMode] || 0, behavior: 'auto' })
  }
}
const currentWallpaperSaved = computed(() => state.wallpapers.some((item) => item.url === state.settings.currentBackground))
watch(locale, (language) => { document.title = t('productName'); document.documentElement.lang = language }, { immediate: true })
let dragTimer = 0
const backgroundStyle = computed(() => state.settings.currentBackground
  ? { backgroundImage: `url("${state.settings.currentBackground.replace(/["\\\n\r]/g, '')}")` } : {})
const cardAppearance = computed(() => ({ '--glass': `rgba(13,24,46,${Number(state.settings.cardOpacity ?? 56) / 100})` }))
const shadeStyle = computed(() => {
  const opacity = 1 - Number(state.settings.brightness ?? 55) / 100
  return { background: `linear-gradient(180deg,rgba(4,10,20,${opacity}),rgba(4,8,18,${Math.min(.94, opacity + .18)}))` }
})
const groupType = (event) => Array.from(event.dataTransfer?.types || []).includes('application/x-qiye-group')
function endDrag() { clearTimeout(dragTimer); state.dragActive = false; groupDrag.value = false; activeGap.value = null }
function trackDrag(event) {
  if (!acceptsDrop(event.dataTransfer) && !groupType(event)) return
  groupDrag.value = groupType(event)
  state.dragActive = !groupDrag.value
  clearTimeout(dragTimer)
  dragTimer = setTimeout(endDrag, 1800)
}
function leavePage(event) {
  if (!event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight)) endDrag()
}
function handleKeyboard(event) {
  if (event.key === 'Escape') { endDrag(); state.settingsOpen = false; state.albumOpen = false; return }
  if (event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) { event.preventDefault(); dashboard.undo() }
  else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); dashboard.redo() }
}
function handleVisibility() {
  if (document.visibilityState !== 'visible') return
  const minutes = Number(state.settings.backgroundIntervalMinutes)
  if (minutes > 0 && Date.now() - (state.settings.rotationAnchorAt || state.settings.backgroundChangedAt) >= minutes * 60000) dashboard.changeBackground()
}
onMounted(() => {
  dashboard.load().then(async () => {
    if (!isDemo) return
    if (demoScene === 'settings') state.settingsOpen = true
    if (demoScene === 'album') state.albumOpen = true
    if (demoScene === 'groups') activeGap.value = 1
    if (demoScene === 'pages' && new URL(location.href).searchParams.get('page') === 'alternate') await dashboard.togglePage()
  }).catch(() => dashboard.toast('数据加载失败'))
  document.addEventListener('visibilitychange', handleVisibility)
  document.addEventListener('dragover', trackDrag)
  document.addEventListener('dragleave', leavePage)
  document.addEventListener('drop', endDrag)
  document.addEventListener('dragend', endDrag)
  document.addEventListener('keydown', handleKeyboard)
  window.addEventListener('blur', endDrag)
})
onBeforeUnmount(() => {
  endDrag()
  document.removeEventListener('visibilitychange', handleVisibility)
  document.removeEventListener('dragover', trackDrag)
  document.removeEventListener('dragleave', leavePage)
  document.removeEventListener('drop', endDrag)
  document.removeEventListener('dragend', endDrag)
  document.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('blur', endDrag)
  dashboard.dispose?.()
})
async function handleDrop({ payload, groupId, slot, mode, columnPitch, onSettled }) {
  try {
    if (payload.kind === 'web-shortcut') await dashboard.addWebShortcut(payload, groupId, slot, mode, columnPitch)
    else if (mode === 'insert') await dashboard.insertCard(payload, groupId, slot)
    else if (payload.kind === 'internal') await dashboard.moveCard(payload.id, groupId, slot)
    else await dashboard.addExternalCard(payload, groupId, slot, columnPitch)
  } catch (error) { dashboard.toast(error.message) }
  finally { onSettled?.() }
}
function overGap(event, index) {
  if (!acceptsDrop(event.dataTransfer) && !groupType(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = groupType(event) || Array.from(event.dataTransfer.types).includes('application/x-lucuro-card') ? 'move' : 'copy'
  activeGap.value = index
}
function leaveGap(event, index) {
  const target = event.relatedTarget || document.elementFromPoint(event.clientX, event.clientY)
  if (!event.currentTarget.contains(target) && activeGap.value === index) activeGap.value = null
}
async function dropGap(event, index = state.groups.length) {
  event.preventDefault()
  endDrag()
  if (groupType(event)) {
    try { await dashboard.moveGroup(JSON.parse(event.dataTransfer.getData('application/x-qiye-group')).id, index) } catch { /* Invalid group drag is ignored. */ }
    return
  }
  let payload = parseDropData(event.dataTransfer)
  if (!payload) return
  const rect = event.currentTarget.getBoundingClientRect()
  const slot = slotFromPoint(rect, event.clientX, rect.top)
  try {
    if (payload.kind === 'web-shortcut') await dashboard.addWebShortcutInNewGroup(payload, slot, index)
    else await dashboard.addInNewGroup(payload, slot, index)
  }
  catch (error) { dashboard.toast(error.message) }
}
async function removeGroup(group) {
  await dashboard.removeGroup(group.id)
}

function insideContent(event) {
  const rect = document.querySelector('.groups')?.getBoundingClientRect()
  return insideDropWidth(rect, event.clientX)
}
function allowContentDrop(event) {
  if (insideContent(event) && (acceptsDrop(event.dataTransfer) || groupType(event))) event.preventDefault()
}
async function dropNearest(event) {
  if (event.defaultPrevented) return
  if (!insideContent(event)) { event.preventDefault(); return }
  const sections = [...document.querySelectorAll('.group-section')]
  if (!sections.length) return
  event.preventDefault()
  if (groupType(event)) {
    const nearest = sections.reduce((best,node) => Math.abs(node.getBoundingClientRect().top-event.clientY) < Math.abs(best.getBoundingClientRect().top-event.clientY) ? node : best)
    const index = state.groups.findIndex((group) => group.id === nearest.dataset.groupId)
    try { await dashboard.moveGroup(JSON.parse(event.dataTransfer.getData('application/x-qiye-group')).id, Math.max(1,index)) } catch { /* Ignore malformed group data. */ }
    return
  }
  const payload = parseDropData(event.dataTransfer)
  if (!payload) return
  const zones = sections.map((section) => ({ groupId: section.dataset.groupId, rect: section.querySelector('.card-zone').getBoundingClientRect() }))
  const nearest = nearestDropZone(zones, event.clientY)
  await handleDrop({ payload, groupId: nearest.groupId, columnPitch: (nearest.rect.width + 16) / 6, slot: slotFromPoint(nearest.rect,event.clientX,Math.max(nearest.rect.top,Math.min(nearest.rect.bottom-1,event.clientY))) })
}
</script>

<template>
  <Transition name="wallpaper"><div :key="state.settings.currentBackground || 'default'" class="background-layer" :style="backgroundStyle"></div></Transition>
  <div class="background-shade" :style="shadeStyle"></div>
  <BrowserTabStrip :class="{ 'demo-expanded': isDemo && demoScene === 'tabstrip' }" />
    <nav class="top-actions" :aria-label="t('页面操作')" @dragover.prevent @drop.prevent.stop="endDrag">
      <button class="round-button" type="button" :title="t('设置')" :aria-label="t('设置')" @click="state.settingsOpen = true"><Settings :size="20" /></button>
      <button class="round-button" type="button" :title="currentWallpaperSaved ? t('取消收藏当前壁纸') : t('收藏当前壁纸')" :aria-label="currentWallpaperSaved ? t('取消收藏当前壁纸') : t('收藏当前壁纸')" :aria-pressed="currentWallpaperSaved" :disabled="state.wallpaperBusy || !state.settings.currentBackground" @click="dashboard.favoriteWallpaper"><Heart :size="20" :fill="currentWallpaperSaved ? 'currentColor' : 'none'" /></button>
      <button class="round-button" type="button" :title="t('壁纸相册')" :aria-label="t('壁纸相册')" @click="state.albumOpen = true"><Images :size="20" /></button>
    </nav>
  <main class="dashboard" :class="{ ready: state.loaded, 'demo-card-controls': isDemo && demoScene === 'cards' }" :style="cardAppearance" @dragover="allowContentDrop" @drop="dropNearest">
    <TransitionGroup name="group-shift" tag="section" class="groups" :aria-label="t('卡片分组')">
      <GroupSection v-if="groupsWithCards.length" :key="'pinned'" :group="groupsWithCards[0]" :drag-active="state.dragActive" @open-group="dashboard.openGroup" @delete-row="dashboard.deleteRow" @drop-card="handleDrop" @rename-card="dashboard.renameCard" @remove-card="dashboard.removeCard" @toggle-pin="dashboard.togglePin" />
      <div v-for="(group,index) in groupsWithCards.slice(1)" :key="group.id" class="group-block">
        <div class="group-insert-row" :class="{ 'is-preview': activeGap === index + 1 && !groupDrag, 'group-reorder-target': activeGap === index + 1 && groupDrag }" @dragover="overGap($event,index+1)" @dragleave="leaveGap($event,index+1)" @drop.stop="dropGap($event,index+1)">
          <div v-if="activeGap === index + 1 && !groupDrag" class="group-preview"><h2>{{ t('新分组') }}</h2><div class="preview-space"></div></div>
        </div>
        <GroupSection :group="group" :drag-active="state.dragActive" @open-group="dashboard.openGroup" @delete-row="dashboard.deleteRow" @drop-card="handleDrop" @rename-card="dashboard.renameCard" @remove-card="dashboard.removeCard" @toggle-pin="dashboard.togglePin" @rename-group="dashboard.renameGroup" @remove-group="removeGroup(group)" />
      </div>
    </TransitionGroup>
    <div class="new-group-drop-zone" @dragover="overGap($event,state.groups.length)" @dragleave="leaveGap($event,state.groups.length)" @drop.stop="dropGap($event,state.groups.length)"></div>
  </main>
  <PageToggle :alternate="state.pageMode === 'alternate'" :busy="state.pageSwitching" :appearance="cardAppearance" :demo="isDemo" @toggle="togglePage" />
  <span v-if="isDemo && state.loaded" class="demo-badge">{{ t('演示数据') }}</span>
  <Transition name="settings-slide"><SettingsDialog v-if="state.settingsOpen" :language="state.settings.language" @language-change="dashboard.setLanguage" :interval="state.settings.backgroundIntervalMinutes" :loading="state.backgroundLoading" :brightness="state.settings.brightness" :card-opacity="state.settings.cardOpacity" :download-folder="state.downloadFolder" :favorite-saved="currentWallpaperSaved" :favorite-busy="state.wallpaperBusy" :has-wallpaper="Boolean(state.settings.currentBackground)" @favorite="dashboard.favoriteWallpaper" @close="state.settingsOpen=false" @interval-change="dashboard.setBackgroundInterval" @refresh="dashboard.changeBackground(true)" @brightness-change="(value)=>dashboard.setAppearance('brightness',value)" @card-opacity-change="(value)=>dashboard.setAppearance('cardOpacity',value)" @choose-folder="dashboard.chooseWallpaperFolder" @reset-folder="dashboard.resetWallpaperFolder" /></Transition>
  <WallpaperAlbum v-if="state.albumOpen" :wallpapers="state.wallpapers" :busy="state.wallpaperBusy" @close="state.albumOpen=false" @download="dashboard.downloadFavorite" @download-all="dashboard.downloadFavorites" @remove="dashboard.removeFavoriteWallpaper" />
  <div class="toast" :class="{ visible: state.toast }">{{ state.toast }}</div>
</template>
