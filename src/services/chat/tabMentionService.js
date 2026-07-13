import { browser } from 'wxt/browser'
import { checkPermission, requestPermission } from '@/services/firefoxPermissionService.js'
import { detectContentType } from '@/lib/utils/contentTypeDetector.js'
import { SOURCE_KINDS } from './sourceResolution.js'

export const MAX_TAB_ATTACHMENTS = 3
const deniedTabIds = new Set()

/** @type {RegExp} YouTube watch page pattern */
const YOUTUBE_WATCH_RE = /youtube\.com\/watch/i

export function unsupportedTabReason(url) {
  if (!/^https?:/i.test(url || '')) return 'Browser, extension, store, and local pages cannot be attached.'
  if (/\.pdf(?:$|[?#])/i.test(url) || /\/pdf(?:$|[?#])/i.test(url)) return 'PDF and viewer pages cannot be attached.'
  return null
}

/**
 * Check if a URL is a YouTube watch page.
 * @param {string} url
 * @returns {boolean}
 */
function isYouTubeWatch(url) {
  return YOUTUBE_WATCH_RE.test(url || '')
}

function safeHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function decorateTab(tab) {
  return { ...tab, hostname: safeHostname(tab.url), disabledReason: unsupportedTabReason(tab.url) }
}

export function createTabMentionService({ browserApi = browser, isFirefox = () => /firefox/i.test(navigator.userAgent), check = checkPermission, request = requestPermission } = {}) {
  return {
    async listTabs(query = '') {
      const tabs = await browserApi.tabs.query({ currentWindow: true })
      const needle = query.toLowerCase().trim()
      return tabs
        .map(decorateTab)
        .filter((tab) => !needle || `${tab.title} ${tab.hostname}`.toLowerCase().includes(needle))
    },

    /**
     * Return mention sources: all open tabs plus a synthetic **Comments** entry
     * for every open YouTube watch tab (using that tab's real title). The user
     * can add comments for any video directly — no need to attach the tab first.
     *
     * Tab entries have no `kind` (auto-resolved at capture time). Comment entries
     * carry `kind: 'youtubeComments'` and `isCommentEntry: true`.
     *
     * @param {string} [query]
     * @param {{ attachments?: Array<{tabId: number, sourceKind?: string}> }} [opts]
     * @returns {Promise<Array<{id: number|string, title: string, url: string, hostname: string, disabledReason: string|null, kind?: string, isCommentEntry?: boolean, label?: string}>>}
     */
    async listMentionSources(query = '', { attachments = [] } = {}) {
      const allTabs = (await browserApi.tabs.query({ currentWindow: true })).map(decorateTab)
      const needle = query.toLowerCase().trim()

      const tabs = allTabs.filter(
        (tab) => !needle || `${tab.title} ${tab.hostname}`.toLowerCase().includes(needle)
      )

      // One Comments entry per open YouTube watch tab, with its real title.
      const commentEntries = []
      for (const tab of allTabs) {
        if (tab.id == null || !isYouTubeWatch(tab.url)) continue
        const title = tab.title || 'YouTube video'
        const label = `Comments · ${title}`
        if (needle && !label.toLowerCase().includes(needle) && !tab.hostname.toLowerCase().includes(needle)) continue

        // Skip if comments are already attached for this tab
        const alreadyAttached = attachments.some(
          (att) => att.tabId === tab.id && att.sourceKind === SOURCE_KINDS.youtubeComments
        )

        commentEntries.push({
          id: `comments-${tab.id}`,
          tabId: tab.id,
          title,
          url: tab.url,
          hostname: tab.hostname,
          label,
          disabledReason: alreadyAttached ? 'Comments already attached for this video.' : null,
          kind: SOURCE_KINDS.youtubeComments,
          isCommentEntry: true,
        })
      }

      // Comments entries go at the end of the list
      return [...tabs, ...commentEntries]
    },

    async select(tab) {
      const reason = unsupportedTabReason(tab.url)
      if (reason) throw new Error(reason)
      // Comment entries carry a synthetic string `id` (`comments-<n>`); key the
      // denied set by the real numeric tab id so it matches the tab entry.
      const tabId = tab.tabId ?? tab.id
      if (isFirefox() && !await check(tab.url)) {
        if (deniedTabIds.has(tabId) || !await request(tab.url)) {
          deniedTabIds.add(tabId)
          throw new Error(`Permission to read ${tab.title || tab.hostname} was denied. Your draft was kept.`)
        }
      }
      return { tabId, url: tab.url, title: tab.title || tab.hostname, hostname: tab.hostname, sourceKind: tab.kind || undefined }
    },
  }
}

export const tabMentionService = createTabMentionService()
