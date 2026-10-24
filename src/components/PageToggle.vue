<script setup>
import { Eye, EyeOff } from 'lucide-vue-next'
import { t } from '../utils/i18n'
defineProps({ alternate: Boolean, busy: Boolean, appearance: Object, demo: Boolean })
const emit = defineEmits(['toggle'])
</script>

<template>
  <button class="page-toggle" :class="{ 'demo-visible': demo }" type="button" :style="appearance" :disabled="busy" :aria-pressed="alternate" :aria-label="alternate ? t('返回原页面') : t('隐藏页面')" :title="alternate ? t('返回原页面') : t('隐藏页面')" @click="emit('toggle')" @dragover.prevent @drop.prevent.stop>
    <Eye v-if="alternate" :size="16" /><EyeOff v-else :size="16" />
    <span>{{ alternate ? t('返回原页面') : t('隐藏页面') }}</span>
  </button>
</template>

<style scoped>
.page-toggle { position: fixed; right: 0; bottom: 0; z-index: 60; width: 128px; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 8px; border: 1px solid rgba(255,255,255,.16); border-radius: 12px 0 0 0; background: var(--glass); color: var(--text); box-shadow: 0 13px 35px rgba(0,0,0,.18); backdrop-filter: blur(18px); font-size: 14px; cursor: pointer; opacity: 0; transition: opacity 120ms ease; }
.page-toggle:hover, .page-toggle:focus-visible, .page-toggle.demo-visible { opacity: 1; }
.page-toggle:disabled { cursor: wait; }
.page-toggle { z-index: 130; }
</style>
