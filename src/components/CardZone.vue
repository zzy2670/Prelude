<script setup>
import { computed, ref, watch } from 'vue'
import CardTile from './CardTile.vue'
import { Trash2 } from 'lucide-vue-next'
import { acceptsDrop, cardDropTarget, COLUMN_COUNT, insideDropWidth, insertionSlots, parseDropData, rowsForCards } from '../utils/layout'
import { t } from '../utils/i18n'

const props = defineProps({
  groupId: { type: String, required: true },
  cards: { type: Array, required: true },
  minimumRows: { type: Number, default: 1 },
  dragActive: Boolean
})
const emit = defineEmits(['drop-card', 'rename', 'remove', 'toggle-pin', 'delete-row'])
const board = ref(null)
const hoverSlot = ref(null)
const hoverMode = ref('replace')
const dragSourceId = ref('')
const pendingDrop = ref(false)
const pendingShifts = ref(new Map())
function clearHover() { hoverSlot.value = null; hoverMode.value = 'replace'; dragSourceId.value = '' }
watch(() => props.dragActive, (value) => { if (!value && !pendingDrop.value) clearHover() })
const shifts = computed(() => pendingDrop.value ? pendingShifts.value : hoverMode.value === 'insert' && hoverSlot.value !== null
  ? insertionSlots(props.cards, hoverSlot.value, dragSourceId.value) : new Map())

const rowCount = computed(() => {
  const base = rowsForCards(props.cards, props.groupId, props.minimumRows)
  const hoverRows = hoverSlot.value === null ? 0 : Math.floor(hoverSlot.value / COLUMN_COUNT) + 1
  const shiftedRows = Math.floor(Math.max(-1, ...shifts.value.values()) / COLUMN_COUNT) + 1
  return Math.max(base, hoverRows, shiftedRows)
})

function cardStyle(card) {
  const slot = shifts.value.get(card.id) ?? card.slot
  return {
    gridColumn: String((slot % COLUMN_COUNT) + 1),
    gridRow: String(Math.floor(slot / COLUMN_COUNT) + 1),
    opacity: hoverMode.value === 'insert' && card.id === dragSourceId.value ? 0 : undefined
  }
}

function locate(event) {
  if (!board.value) return { slot: 0, mode: 'replace' }
  return cardDropTarget(board.value.getBoundingClientRect(), event.clientX, event.clientY)
}

function dragOver(event) {
  if (pendingDrop.value) { event.preventDefault(); return }
  if (!insideDropWidth(board.value?.getBoundingClientRect(), event.clientX)) return
  if (!acceptsDrop(event.dataTransfer)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = Array.from(event.dataTransfer.types).includes('application/x-lucuro-card') ? 'move' : 'copy'
  const target = locate(event)
  hoverSlot.value = target.slot
  hoverMode.value = target.mode
  dragSourceId.value = Array.from(event.dataTransfer.types).includes('application/x-lucuro-card')
    ? document.querySelector('.card[data-dragging="true"]')?.dataset.cardId || '' : ''
}

function drop(event) {
  if (pendingDrop.value) { event.preventDefault(); return }
  if (!insideDropWidth(board.value?.getBoundingClientRect(), event.clientX)) return
  const payload = parseDropData(event.dataTransfer)
  if (!payload) return
  event.preventDefault()
  const { slot, mode } = locate(event)
  hoverSlot.value = slot
  hoverMode.value = mode
  dragSourceId.value = payload.kind === 'internal' ? payload.id : ''
  pendingShifts.value = mode === 'insert' ? insertionSlots(props.cards, slot, dragSourceId.value) : new Map()
  pendingDrop.value = true
  const onSettled = () => { pendingDrop.value = false; pendingShifts.value = new Map(); clearHover() }
  emit('drop-card', { payload, groupId: props.groupId, slot, mode, onSettled, columnPitch: (board.value.getBoundingClientRect().width + 16) / COLUMN_COUNT })
}

function dragLeave(event) {
  if (pendingDrop.value) return
  const target = event.relatedTarget || document.elementFromPoint(event.clientX, event.clientY)
  if (!board.value?.contains(target)) clearHover()
}

const openSlots = computed(() => {
  const occupied = new Set(props.cards.map((card) => card.slot))
  const lastRowFull = Array.from({ length: COLUMN_COUNT }, (_, column) => (rowCount.value - 1) * COLUMN_COUNT + column).every((slot) => occupied.has(slot))
  const rows = rowCount.value + (lastRowFull && props.dragActive ? 1 : 0)
  return Array.from({ length: rows * COLUMN_COUNT }, (_, slot) => slot).filter((slot) => !occupied.has(slot))
})
</script>

<template>
  <div
    ref="board"
    class="card-zone"
    :style="{ '--zone-rows': dragActive ? Math.max(rowCount, Math.ceil((Math.max(-1, ...openSlots) + 1) / COLUMN_COUNT)) : rowCount }"
    @dragover="dragOver"
    @dragleave="dragLeave"
    @drop="drop"
  >
    <div v-for="row in rowCount" :key="`row-delete-${row}`" class="row-delete-region" :style="{ top: `${(row - 1) * 112}px` }" @dragover.stop @click.stop>
      <button class="row-delete" type="button" :aria-label="t('删除第 {row} 行', { row })" :title="t('删除当前行')" @click.stop="emit('delete-row', groupId, row - 1)"><Trash2 :size="17" /></button>
    </div>
    <TransitionGroup name="card-shift">
    <CardTile
      v-for="card in cards"
      :key="card.id"
      :card="card"
      :pinned="groupId === 'pinned'"
      :style="cardStyle(card)"
      @rename="(title) => emit('rename', card.id, title)"
      @remove="emit('remove', card.id)"
      @toggle-pin="emit('toggle-pin', card.id)"
    />
    </TransitionGroup>
  </div>
</template>
