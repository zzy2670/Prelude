<script setup>
import { onMounted, reactive, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { COLUMN_COUNT } from '../utils/layout'

const props = defineProps({ groups: Array, suggestedSlots: Object })
const emit = defineEmits(['close', 'save'])
const defaultGroup = props.groups?.find((group) => !group.fixed) || props.groups?.[0]
const form = reactive({ title: '', url: '', groupId: defaultGroup?.id || '', row: 1, column: 1 })
const openTabs = ref([])
const tabError = ref('')
onMounted(async () => {
  if (!globalThis.chrome?.tabs?.query) return
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true })
    openTabs.value = tabs.filter((tab) => /^https?:\/\//i.test(tab.url || ''))
  } catch {
    tabError.value = '暂时无法读取标签页，请粘贴网址或拖入网页链接。'
  }
})

function chooseTab(event) {
  const tab = openTabs.value.find((item) => String(item.id) === event.target.value)
  if (!tab) return
  form.url = tab.url
  form.title = tab.title || ''
}

function useSuggestedPosition() {
  const slot = Number(props.suggestedSlots?.[form.groupId]) || 0
  form.row = Math.floor(slot / COLUMN_COUNT) + 1
  form.column = (slot % COLUMN_COUNT) + 1
}

function save() {
  const slot = (Math.max(1, Number(form.row) || 1) - 1) * COLUMN_COUNT + Math.max(1, Math.min(COLUMN_COUNT, Number(form.column) || 1)) - 1
  emit('save', { title: form.title, url: form.url, groupId: form.groupId, slot })
}

useSuggestedPosition()
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="emit('close')">
    <form class="dialog" @submit.prevent="save">
      <header><h2>添加卡片</h2><button type="button" class="icon-button" @click="emit('close')"><X :size="18" /></button></header>
      <label v-if="openTabs.length">从已打开标签页添加
        <select @change="chooseTab"><option value="">选择上方已打开的网页</option><option v-for="tab in openTabs" :key="tab.id" :value="tab.id">{{ tab.title || tab.url }}</option></select>
      </label>
      <p v-if="tabError" class="dialog-note">{{ tabError }}</p>
      <label>网址<input v-model="form.url" autofocus type="url" placeholder="https://example.com" required /></label>
      <label>标题<input v-model="form.title" type="text" placeholder="留空则使用网站名称" maxlength="160" /></label>
      <label>分组
        <select v-model="form.groupId" required @change="useSuggestedPosition"><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.title }}</option></select>
      </label>
      <div class="position-fields">
        <label>第几行<input v-model.number="form.row" type="number" min="1" step="1" required /></label>
        <label>第几列<input v-model.number="form.column" type="number" min="1" max="5" step="1" required /></label>
      </div>
      <p class="dialog-note">位置已有卡片时不会自动挪动其他卡片。</p>
      <button class="primary-button" type="submit">添加</button>
    </form>
  </div>
</template>
