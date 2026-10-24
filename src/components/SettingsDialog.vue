<script setup>
import { Heart, RefreshCw, X } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { t } from '../utils/i18n'

const props = defineProps({ interval: Number, loading: Boolean, brightness: Number, cardOpacity: Number, downloadFolder: String, favoriteSaved: Boolean, favoriteBusy: Boolean, hasWallpaper: Boolean, language: { type: String, default: 'zh-CN' } })
const emit = defineEmits(['close', 'interval-change', 'refresh', 'favorite', 'brightness-change', 'card-opacity-change', 'choose-folder', 'reset-folder', 'language-change'])
const intervalDraft = ref(props.interval ?? 1)

watch(() => props.interval, (value) => { intervalDraft.value = value ?? 1 })

function saveInterval() {
  const value = Number(intervalDraft.value)
  if (String(intervalDraft.value).trim() && Number.isFinite(value) && value >= 0) {
    emit('interval-change', value)
  } else {
    intervalDraft.value = props.interval ?? 1
  }
}

</script>

<template>
  <div class="dialog-backdrop settings-backdrop" @mousedown.self="emit('close')">
    <section class="dialog settings-dialog" :style="{ '--glass': `rgba(13,24,46,${Number(cardOpacity ?? 56)/100})` }">
      <header><h2>{{ t('设置') }}</h2><button type="button" class="icon-button" :aria-label="t('关闭设置')" @click="emit('close')"><X :size="18" /></button></header>
      <label>{{ t('语言') }}
        <select :value="language" @change="emit('language-change', $event.target.value)"><option value="zh-CN">{{ t('简体中文') }}</option><option value="en">English</option></select>
      </label>
      <label>{{ t('壁纸切换间隔（分钟）') }}
        <input v-model="intervalDraft" type="number" min="0" step="0.1" @change="saveInterval" @keydown.enter.prevent="saveInterval" />
      </label>
      <div class="wallpaper-refresh-controls">
      <button class="secondary-button wallpaper-refresh" type="button" :disabled="loading || favoriteBusy" @click="emit('refresh')">
        <RefreshCw :size="17" :class="{ spinning: loading }" /> {{ t('立即更换') }}
      </button>
      <button class="secondary-button wallpaper-favorite" type="button" :disabled="loading || favoriteBusy || !hasWallpaper" :aria-label="favoriteSaved ? t('取消收藏当前壁纸') : t('收藏当前壁纸')" :title="favoriteSaved ? t('取消收藏当前壁纸') : t('收藏当前壁纸')" :aria-pressed="favoriteSaved" @click="emit('favorite')"><Heart :size="18" :fill="favoriteSaved ? 'currentColor' : 'none'" /></button>
      </div>
      <label>{{ t('背景亮度 {value}%', { value: brightness }) }}
        <input type="range" min="0" max="80" step="1" :value="brightness" @input="emit('brightness-change', Number($event.target.value))" />
      </label>
      <label>{{ t('卡片不透明度 {value}%', { value: cardOpacity }) }}
        <input type="range" min="20" max="95" step="1" :value="cardOpacity" @input="emit('card-opacity-change', Number($event.target.value))" />
      </label>
      <label>{{ t('壁纸下载文件夹') }}<span class="dialog-note">{{ downloadFolder || t('Chrome 下载目录 / 壁纸收藏') }}</span></label>
      <button class="secondary-button" type="button" @click="emit('choose-folder')">{{ t('选择默认文件夹') }}</button>
      <button v-if="downloadFolder" class="secondary-button" type="button" @click="emit('reset-folder')">{{ t('恢复浏览器下载目录') }}</button>
      <p class="wallpaper-source">{{ t('壁纸来源：Unsplash') }}</p>
    </section>
  </div>
</template>
