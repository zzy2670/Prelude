<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { Pin, PinOff, X } from 'lucide-vue-next'
import SiteIcon from './SiteIcon.vue'
import { t } from '../utils/i18n'

const props = defineProps({ card: { type: Object, required: true }, pinned: Boolean })
const emit = defineEmits(['rename', 'remove', 'toggle-pin'])
const editing = ref(false)
const draft = ref('')
const input = ref(null)
const justDragged = ref(false)
const actionPress = ref(false)
let openTimer = 0
onBeforeUnmount(() => clearTimeout(openTimer))

function beginEdit() {
  clearTimeout(openTimer)
  editing.value = true
  draft.value = props.card.title
  nextTick(() => input.value?.select())
}

function saveEdit() {
  if (!editing.value) return
  editing.value = false
  emit('rename', draft.value)
}

function cancelEdit() {
  draft.value = props.card.title
  editing.value = false
}

function startDrag(event) {
  clearTimeout(openTimer)
  if (editing.value || actionPress.value || event.target.closest('.card-action-region')) {
    event.preventDefault()
    return
  }
  justDragged.value = true
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-lucuro-card', JSON.stringify({ id: props.card.id }))
  event.dataTransfer.setData('text/plain', props.card.url)
}

function endDrag() {
  window.setTimeout(() => { justDragged.value = false }, 120)
}

function activateCard() {
  window.location.assign(props.card.url)
}

function openCard(event) {
  if (editing.value || justDragged.value || event.button !== 0 || event.target.closest('.card-action-region')) return
  clearTimeout(openTimer)
  if (event.target.closest('.card-title')) openTimer = window.setTimeout(activateCard, 600)
  else activateCard()
}

function openInBackground(event) {
  if (event.button !== 1 || event.target.closest('button, input, .card-action-region')) return
  event.preventDefault()
  clearTimeout(openTimer)
  if (editing.value || justDragged.value) return
  if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url: props.card.url, active: false }).catch(() => {})
}

function preventMiddleScroll(event) {
  if (event.button === 1) event.preventDefault()
}
</script>

<template>
  <article
    class="card"
    :data-card-id="card.id"
    :data-dragging="justDragged ? 'true' : null"
    draggable="true"
    :aria-label="card.title"
    @pointerdown.capture="actionPress = Boolean($event.target.closest('.card-action-region'))"
    @pointerup.capture="actionPress = false"
    @pointercancel="actionPress = false"
    @dragstart="startDrag"
    @dragend="endDrag"
    @click="openCard"
    @auxclick="openInBackground"
    @mousedown="preventMiddleScroll"
  >
    <SiteIcon :card="card" :size="48" />
    <input
      v-if="editing"
      ref="input"
      v-model="draft"
      class="card-title-input"
      maxlength="160"
      @click.stop
      @dblclick.stop
      @keydown.enter.prevent="saveEdit"
      @keydown.escape.prevent="cancelEdit"
      @blur="saveEdit"
    />
    <h3 v-else class="card-title" :title="t('双击修改标题')" @dblclick.stop="beginEdit">
      {{ card.title }}
    </h3>
    <div class="card-action-region card-delete-region" draggable="false" @click.stop @auxclick.stop @dragstart.stop.prevent>
      <button class="card-delete" type="button" :title="t('删除卡片')" :aria-label="t('删除卡片')" @click.stop="emit('remove')">
        <X :size="14" />
      </button>
    </div>
    <div class="card-action-region card-pin-region" draggable="false" @click.stop @auxclick.stop @dragstart.stop.prevent>
    <button
      class="card-pin"
      :class="{ pinned }"
      type="button"
      :title="pinned ? t('取消置顶') : t('置顶操作')"
      :aria-label="pinned ? t('取消置顶') : t('置顶操作')"
      :aria-pressed="pinned ? 'true' : 'false'"
      @pointerdown.stop
      @click.stop="emit('toggle-pin')"
    >
      <PinOff v-if="pinned" :size="16" />
      <Pin v-else :size="16" />
    </button>
    </div>
  </article>
</template>
