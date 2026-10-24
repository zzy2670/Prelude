<script setup>
import { computed, nextTick, ref } from 'vue'
import { Trash2, ExternalLink } from 'lucide-vue-next'
import CardZone from './CardZone.vue'
import { t } from '../utils/i18n'

const props = defineProps({ group: { type: Object, required: true }, dragActive: Boolean })
const emit = defineEmits(['drop-card', 'rename-card', 'remove-card', 'rename-group', 'remove-group', 'toggle-pin', 'delete-row', 'open-group'])
const editing = ref(false)
const draft = ref('')
const input = ref(null)
const actionPress = ref(false)
const displayTitle = computed(() => props.group.fixed ? t('置顶') : props.group.title === '新分组' ? t('新分组') : props.group.title)
let initialDraft = ''

function editTitle() {
  editing.value = true
  draft.value = displayTitle.value
  initialDraft = draft.value
  nextTick(() => input.value?.select())
}

function startGroupDrag(event) {
  if (props.group.fixed || editing.value || actionPress.value || event.target.closest('button,input,.group-delete-region,.group-open-region')) { event.preventDefault(); return }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-qiye-group', JSON.stringify({ id: props.group.id }))
}

function saveTitle() {
  if (!editing.value) return
  editing.value = false
  emit('rename-group', props.group.id, draft.value === initialDraft ? props.group.title : draft.value)
}

function cancelTitle() {
  draft.value = props.group.title
  editing.value = false
}
</script>

<template>
  <section class="group-section" :data-group-id="group.id">
    <header class="group-header" :class="{ 'can-drag-group': !group.fixed }" :draggable="!group.fixed && !editing" @pointerdown.capture="actionPress = Boolean($event.target.closest('button,input,.group-delete-region,.group-open-region'))" @pointerup.capture="actionPress = false" @pointercancel="actionPress = false" @dragstart="startGroupDrag">
      <input v-if="editing && !group.fixed" ref="input" v-model="draft" class="group-title-input" maxlength="80" @keydown.enter.prevent="saveTitle" @keydown.escape.prevent="cancelTitle" @blur="saveTitle" />
      <h2 v-else class="group-title" :class="{ fixed: group.fixed }" :title="group.fixed ? '' : t('双击修改分组名称')" @dblclick="!group.fixed && editTitle()">{{ displayTitle }}</h2>
      <div v-if="!group.fixed" class="group-delete-region" @click.stop><button class="group-delete" type="button" :title="t('删除分组')" :aria-label="t('删除分组')" @click.stop="emit('remove-group')"><Trash2 :size="16" /></button></div>
      <div class="group-open-region" @click.stop><button class="group-open-all" type="button" :aria-label="t('一键打开')" @click.stop="emit('open-group',group.id)"><ExternalLink :size="16" />{{ t('一键打开') }}</button></div>
    </header>
    <CardZone
      :group-id="group.id"
      :cards="group.cards"
      :minimum-rows="1"
      :drag-active="dragActive"
      @delete-row="(...args) => emit('delete-row', ...args)"
      @drop-card="emit('drop-card', $event)"
      @rename="(...args) => emit('rename-card', ...args)"
      @remove="(id) => emit('remove-card', id)"
      @toggle-pin="(id) => emit('toggle-pin', id)"
    />
  </section>
</template>
