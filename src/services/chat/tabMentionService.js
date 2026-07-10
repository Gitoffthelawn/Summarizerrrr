import { browser } from 'wxt/browser'
import { checkPermission, requestPermission } from '@/services/firefoxPermissionService.js'

export const MAX_TAB_ATTACHMENTS = 3
const deniedTabIds = new Set()

export function unsupportedTabReason(url) {
  if (!/^https?:/i.test(url || '')) return 'Browser, extension, store, and local pages cannot be attached.'
  if (/\.pdf(?:$|[?#])/i.test(url) || /\/pdf(?:$|[?#])/i.test(url)) return 'PDF and viewer pages cannot be attached.'
  return null
}

export function createTabMentionService({ browserApi = browser, isFirefox = () => /firefox/i.test(navigator.userAgent), check = checkPermission, request = requestPermission } = {}) {
  return {
    async listTabs(query = '') {
      const tabs = await browserApi.tabs.query({ currentWindow: true })
      const needle = query.toLowerCase().trim()
      return tabs
        .map((tab) => ({ ...tab, hostname: (() => { try { return new URL(tab.url).hostname } catch { return '' } })(), disabledReason: unsupportedTabReason(tab.url) }))
        .filter((tab) => !needle || `${tab.title} ${tab.hostname}`.toLowerCase().includes(needle))
    },
    async select(tab) {
      const reason = unsupportedTabReason(tab.url)
      if (reason) throw new Error(reason)
      if (isFirefox() && !await check(tab.url)) {
        if (deniedTabIds.has(tab.id) || !await request(tab.url)) {
          deniedTabIds.add(tab.id)
          throw new Error(`Permission to read ${tab.title || tab.hostname} was denied. Your draft was kept.`)
        }
      }
      return { tabId: tab.id, url: tab.url, title: tab.title || tab.hostname, hostname: tab.hostname }
    },
  }
}

export const tabMentionService = createTabMentionService()
