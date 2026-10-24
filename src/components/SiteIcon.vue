<script setup>
import { computed, ref, watch } from 'vue'
import { browserFaviconUrl } from '../utils/browserMetadata'

const props = defineProps({ card: { type: Object, required: true }, size: { type: Number, default: 48 } })
const index = ref(0)
const candidates = computed(() => {
  const cached = browserFaviconUrl(props.card.url, 64)
  const explicit = /^(https?:|data:image\/|chrome-extension:)/i.test(props.card.iconUrl || '') ? props.card.iconUrl : ''
  let originIcon = ''
  try { originIcon = new URL('/favicon.ico', props.card.url).href } catch { /* Invalid URL has no icon. */ }
  return [...new Set([cached, explicit, originIcon].filter(Boolean))]
})
const source = computed(() => candidates.value[index.value] || '')
const letter = computed(() => String(props.card.title || '?').trim().charAt(0).toUpperCase())
watch(() => [props.card.url, props.card.iconUrl], () => { index.value = 0 })
</script>

<template>
  <span class="site-icon" :style="{ width: `${size}px`, height: `${size}px`, flexBasis: `${size}px` }">
    <img v-if="source" class="site-icon-img" :src="source" :width="size" :height="size" alt="" draggable="false" referrerpolicy="no-referrer" @error="index++" />
    <span v-else class="letter-icon">{{ letter }}</span>
  </span>
</template>

<style scoped>
.site-icon { display: inline-grid; place-items: center; flex-shrink: 0; overflow: hidden; border-radius: 11px; background: rgba(255,255,255,.09); }
.site-icon-img { display: block; width: 100%; height: 100%; object-fit: contain; padding: 6px; }
.letter-icon { color: white; font-size: 23px; font-weight: 700; }
</style>
