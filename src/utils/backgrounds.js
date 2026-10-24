const ENDPOINT = 'https://services.bonjourr.fr/backgrounds/bonjourr/images/daylight'

function timeBucket(hour) {
  if (hour < 6 || hour >= 21) return 'night'
  if (hour < 11) return 'morning'
  if (hour < 17) return 'noon'
  return 'evening'
}

export async function fetchBonjourrBackgrounds() {
  const density = Math.max(1, globalThis.devicePixelRatio || 1)
  const width = Math.round(Math.min(3840, (globalThis.screen?.width || 1920) * density))
  const height = Math.round(Math.min(2160, (globalThis.screen?.height || 1080) * density))
  const response = await fetch(`${ENDPOINT}?h=${height}&w=${width}`, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Background request failed: ${response.status}`)
  const payload = await response.json()
  const bucket = timeBucket(new Date().getHours())
  const preferred = Object.entries(payload).find(([key]) => key.endsWith(`-${bucket}`))?.[1]
  const images = Array.isArray(preferred) ? preferred : Object.values(payload).flat()
  return images
    .map((item) => ({
      url: item?.urls?.full || item?.urls?.medium || '',
      preview: item?.urls?.medium || item?.urls?.full || ''
    }))
    .filter((item) => /^https:\/\/images\.unsplash\.com\//i.test(item.url))
}

export function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeout = setTimeout(() => { image.src = ''; reject(new Error('Image loading timed out')) }, 20000)
    image.onload = () => { clearTimeout(timeout); resolve(url) }
    image.onerror = (error) => { clearTimeout(timeout); reject(error) }
    image.referrerPolicy = 'no-referrer'
    image.src = url
  })
}
