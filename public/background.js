// Open our actual extension page, rather than Chrome's framed new-tab surface.
// A normal extension URL has no browser-generated new-tab attribution footer.
const pageUrl = chrome.runtime.getURL('index.html')
function openDashboard(tabId, url) {
  if (/^(?:chrome|edge):\/\/(?:newtab|new-tab-page)\/?(?:[?#].*)?$/.test(url || '')) {
    chrome.tabs.update(tabId, { url: pageUrl }).catch(() => {})
  }
}
chrome.tabs.onCreated.addListener((tab) => openDashboard(tab.id, tab.pendingUrl || tab.url))
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) openDashboard(tabId, change.url)
})

// Refresh only this extension's existing pages after an actual version upgrade.
// This prevents previous-version pages from retaining an obsolete save model.
async function refreshUpgradedPages() {
  const version = chrome.runtime.getManifest().version
  const saved = await chrome.storage.local.get('xuye_loaded_version')
  if (saved.xuye_loaded_version === version) return
  await chrome.storage.local.set({ xuye_loaded_version: version })
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (tab.url?.startsWith(pageUrl) && tab.id) await chrome.tabs.reload(tab.id).catch(() => {})
  }
}
refreshUpgradedPages().catch(() => {})
