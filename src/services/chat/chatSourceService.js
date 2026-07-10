import { browser } from 'wxt/browser'
import { getPageContent } from '@/services/contentService.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'

function normalizeUrl(url) {
  try {
    const normalized = new URL(url)
    normalized.hash = ''
    return normalized.toString()
  } catch {
    return String(url || '')
  }
}

function stableContentHash(content) {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`
}

function sourceTypeFor(pageType) {
  return pageType === 'youtube' ? 'youtube' : pageType === 'course' ? 'course' : 'webpage'
}

function condenseContent(content) {
  const limit = 12_000
  if (content.length <= limit) return content
  return `${content.slice(0, limit)}\n\n[Source snapshot condensed; remaining content omitted.]`
}

/**
 * Captures immutable active-tab snapshots and caches them for the runtime
 * session. The cache only avoids repeated extraction; persistence remains the
 * source of truth and deduplicates by normalized URL plus content hash.
 */
export function createChatSourceService({
  browserApi = browser,
  getPageContentFn = getPageContent,
  repository = conversationRepository,
} = {}) {
  const sourceIdsByTab = new Map()

  async function getActiveTab() {
    const [tab] = await browserApi.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) throw new Error('Could not identify the active tab.')
    return tab
  }

  return {
    getActiveTab,

    async getCachedActiveSource() {
      const tab = await getActiveTab()
      const cached = sourceIdsByTab.get(tab.id)
      if (!cached || cached.normalizedUrl !== normalizeUrl(tab.url)) return null
      const source = await repository.getSourceById(cached.sourceId)
      return source ? { source, tab } : null
    },

    async captureActiveSource() {
      const cached = await this.getCachedActiveSource()
      if (cached) return cached

      const tab = await getActiveTab()
      const extracted = await getPageContentFn({ tabId: tab.id, url: tab.url, contentType: 'webpageText', preferredLang: 'en' })
      const content = String(extracted?.content || '').trim()
      if (!content) throw new Error('The active tab did not provide readable content.')

      const normalizedUrl = normalizeUrl(tab.url)
      const source = await repository.putSourceSnapshot({
        normalizedUrl,
        url: tab.url,
        title: tab.title || normalizedUrl,
        sourceType: sourceTypeFor(extracted?.type),
        contentHash: stableContentHash(content),
        rawContent: content,
        condensedContent: condenseContent(content),
        condensationVersion: 1,
        condensationLanguage: 'en',
        originalLength: content.length,
        tabIdHint: tab.id,
      })

      sourceIdsByTab.set(tab.id, { sourceId: source.id, normalizedUrl })
      return { source, tab }
    },

    async captureTabSource(attachment) {
      const tab = await browserApi.tabs.get(attachment.tabId)
      if (!tab?.url) throw new Error(`The selected tab “${attachment.title || attachment.tabId}” was closed.`)
      if (attachment.url && normalizeUrl(tab.url) !== normalizeUrl(attachment.url)) {
        throw new Error(`The selected tab “${attachment.title || tab.title}” navigated before capture. Select it again.`)
      }
      const cached = sourceIdsByTab.get(tab.id)
      if (cached?.normalizedUrl === normalizeUrl(tab.url)) {
        const source = await repository.getSourceById(cached.sourceId)
        if (source) return { source, tab }
      }
      const extracted = await getPageContentFn({ tabId: tab.id, url: tab.url, contentType: 'webpageText', preferredLang: 'en' })
      const after = await browserApi.tabs.get(tab.id)
      if (!after?.url || normalizeUrl(after.url) !== normalizeUrl(tab.url)) {
        throw new Error(`The selected tab “${attachment.title || tab.title}” changed during capture. Select it again.`)
      }
      const content = String(extracted?.content || '').trim()
      if (!content) throw new Error(`The selected tab “${attachment.title || tab.title}” has no readable content.`)
      const normalizedUrl = normalizeUrl(tab.url)
      const source = await repository.putSourceSnapshot({
        normalizedUrl, url: tab.url, title: tab.title || normalizedUrl,
        sourceType: sourceTypeFor(extracted?.type), contentHash: stableContentHash(content), rawContent: content,
        // @tab context is always condensed before model assembly. This preserves
        // provenance while keeping attachments lower-priority than the active page.
        condensedContent: condenseContent(content), condensationVersion: 1, condensationLanguage: 'en',
        originalLength: content.length, tabIdHint: tab.id,
      })
      sourceIdsByTab.set(tab.id, { sourceId: source.id, normalizedUrl })
      return { source, tab }
    },

    forgetTab(tabId) {
      sourceIdsByTab.delete(tabId)
    },
  }
}

export const chatSourceService = createChatSourceService()
