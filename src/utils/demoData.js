import { getWallpaperPreview } from './wallpaperLibrary'
import { preloadImage } from './backgrounds'
export const isDemo = typeof location !== 'undefined' && new URL(location.href).searchParams.has('demo')
export const demoTabs = [
  { id: 'demo-chatgpt', index: 0, title: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'demo-youtube', index: 1, title: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'demo-google', index: 2, title: 'Google', url: 'https://www.google.com/' }
]

export async function createDemoSnapshot() {
  const query = new URL(location.href).searchParams
  const english = query.get('demo') === 'en'
  let wallpapers = []
  if (globalThis.chrome?.storage?.local) {
    // Marketing may use the collection, never the user's cards or browser chrome.
    const saved = await chrome.storage.local.get('xuye_dashboard_v4')
    wallpapers = (saved.xuye_dashboard_v4?.wallpapers || []).filter((item) => /^https:\/\/images\.unsplash\.com\//.test(item.url || ''))
      .map((item,index) => ({ ...item, name: `Prelude-wallpaper-${index + 1}.jpg` }))
  }
  const imageIndex = Math.max(0, Number(query.get('wallpaper')) || 0)
  const selectedWallpaper = wallpapers[imageIndex % Math.max(1, wallpapers.length)]
  const wallpaper = selectedWallpaper ? await getWallpaperPreview(selectedWallpaper) : ''
  if (wallpaper) await preloadImage(wallpaper).catch(() => {})
  const pinned = { id: 'pinned', title: '置顶', fixed: true }
  const groups = [pinned]
  const cards = [{ id: 'demo-pinned', groupId: 'pinned', slot: 5, title: 'ChatGPT', titleSource: 'manual', url: 'https://chatgpt.com/' }]
  if (query.get('scene') !== 'wallpapers') {
    const samples = [
      { id: 'ai', title: english ? 'AI workspace' : 'AI 工作台', links: [['ChatGPT','https://chatgpt.com/'],['Gemini','https://gemini.google.com/'],['Claude Code','https://claude.com/product/claude-code']] },
      { id: 'discover', title: english ? 'Explore & watch' : '发现与视频', links: [[english ? 'Zhihu' : '知乎','https://www.zhihu.com/'],[english ? 'Bilibili' : '哔哩哔哩','https://www.bilibili.com/'],['YouTube','https://www.youtube.com/'],['Google','https://www.google.com/']] },
      { id: 'social', title: english ? 'Stay connected' : '社交与灵感', links: [['X','https://x.com/'],['Facebook','https://www.facebook.com/'],['Instagram','https://www.instagram.com/']] }
    ]
    for (const group of samples) {
      groups.push({ id: group.id, title: group.title })
      group.links.forEach(([title,url],slot) => cards.push({ id: `demo-${group.id}-${slot}`, groupId: group.id, slot, title, url, titleSource: 'manual' }))
    }
  }
  return { version: 3, layoutColumns: 6, groups, cards, wallpapers,
    settings: { language: english ? 'en' : 'zh-CN', backgroundIntervalMinutes: 0, rotationTimingVersion: 1, currentBackground: wallpaper, backgroundChangedAt: Date.now(), brightness: 62, cardOpacity: 56, backgroundPool: [] } }
}
