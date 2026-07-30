// @ts-nocheck
/**
 * Opening extension pages and URLs, plus the two messages that just relay
 * something to the side panel.
 *
 * Every handler here except `RESUME_CONVERSATION` returns `undefined` — they
 * never call `sendResponse`, so the channel must close immediately or the
 * sender's promise never settles. See the contract note in `../messageRouter.js`.
 */
import { browser } from 'wxt/browser'
import { describeTab } from '../tabInfo.js'

/**
 * @param {{getSidePanelPort: () => any,
 *          setPendingConversationResume: (conversationId: string) => void}} deps
 */
export function createNavigationHandlers({
  getSidePanelPort,
  setPendingConversationResume,
}) {
  return {
    RESUME_CONVERSATION: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          if (!message.conversationId) throw new Error('A conversation ID is required')
          const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
          // Keep this message in the existing side-panel port path so an
          // archive page never needs to import chat state directly.
          const sidePanelPort = getSidePanelPort()
          if (sidePanelPort) sidePanelPort.postMessage({ action: 'resumeConversation', conversationId: message.conversationId })
          else setPendingConversationResume(message.conversationId)
          if (activeTab?.id && globalThis.chrome?.sidePanel?.open) await globalThis.chrome.sidePanel.open({ tabId: activeTab.id })
          sendResponse({ success: true })
        } catch (error) {
          sendResponse({ success: false, error: error.message })
        }
      })()
      return true
    },

    OPEN_ARCHIVE: () => {
      browser.tabs.create({
        url: browser.runtime.getURL('archive.html'),
        active: true,
      })
    },

    OPEN_SETTINGS: (message) => {
      const url = message.tab
        ? browser.runtime.getURL(`settings.html?tab=${message.tab}`)
        : browser.runtime.getURL('settings.html')
      browser.tabs.create({
        url,
        active: true,
      })
    },

    // Open external URL from content script
    OPEN_URL: (message) => {
      browser.tabs.create({
        url: message.url,
        active: true,
      })
    },

    courseContentFetched: (message) => {
      const sidePanelPort = getSidePanelPort()
      if (sidePanelPort)
        sidePanelPort.postMessage({
          action: 'courseContentAvailable',
          ...message,
        })
    },

    requestCurrentTabInfo: () => {
      ;(async () => {
        try {
          const [activeTab] = await browser.tabs.query({
            active: true,
            currentWindow: true,
          })
          if (!activeTab) return
          const info = describeTab(activeTab, 'currentTabInfo')
          const sidePanelPort = getSidePanelPort()
          if (sidePanelPort) sidePanelPort.postMessage(info)
          else browser.runtime.sendMessage(info).catch(() => {})
        } catch (e) {}
      })()
    },
  }
}
