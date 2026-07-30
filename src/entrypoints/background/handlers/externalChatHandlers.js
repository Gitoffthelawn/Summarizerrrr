// @ts-nocheck
/**
 * The five "summarize on <external site>" handoffs plus Deep Dive, all thin
 * wrappers over `../externalChat.js`.
 */
import { browser } from 'wxt/browser'
import {
  handleAISummarization,
  handleGeminiWithYouTubeURL,
  waitForChatTabReady,
  sendChatMessageWithRetry,
  getProviderMessageType,
} from '../externalChat.js'

export function createExternalChatHandlers() {
  return {
    SUMMARIZE_ON_GEMINI: (message, sender, sendResponse) => {
      handleAISummarization('gemini', message.transcript, sendResponse, message.sourceUrl)
      return true
    },

    SUMMARIZE_ON_GEMINI_WITH_URL: (message, sender, sendResponse) => {
      handleGeminiWithYouTubeURL(message.youtubeUrl, sendResponse)
      return true
    },

    SUMMARIZE_ON_CHATGPT: (message, sender, sendResponse) => {
      handleAISummarization('chatgpt', message.transcript, sendResponse, message.sourceUrl)
      return true
    },

    SUMMARIZE_ON_PERPLEXITY: (message, sender, sendResponse) => {
      handleAISummarization('perplexity', message.transcript, sendResponse, message.sourceUrl)
      return true
    },

    SUMMARIZE_ON_GROK: (message, sender, sendResponse) => {
      handleAISummarization('grok', message.transcript, sendResponse, message.sourceUrl)
      return true
    },

    // Deep Dive Tool message handler
    OPEN_DEEP_DIVE_CHAT: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          console.log('[Background] Opening Deep Dive chat:', message.provider)

          // Validate message
          if (!message.provider || !message.url || !message.prompt) {
            throw new Error('Invalid message: missing provider, url, or prompt')
          }

          // Create new tab with chat provider
          const tab = await browser.tabs.create({
            url: message.url,
            active: true,
          })

          console.log(
            `[Background] Created tab ${tab.id} for ${message.provider}`
          )

          // ✅ UNIFIED: Wait for tab to be fully ready (all providers)
          const isReady = await waitForChatTabReady(
            tab.id,
            message.provider,
            10000
          )

          if (!isReady) {
            throw new Error(
              `${message.provider} page failed to load. Please check your connection.`
            )
          }

          // ✅ UNIFIED: Send message with retry (all providers)
          const messageType = getProviderMessageType(message.provider)
          const sent = await sendChatMessageWithRetry(
            tab.id,
            {
              type: messageType,
              content: message.prompt,
            },
            message.provider,
            3,
            1000
          )

          if (sent) {
            console.log(
              `[Background] Sent prompt to ${message.provider} content script`
            )
            sendResponse({ success: true, tabId: tab.id })
          } else {
            throw new Error(
              `Failed to send message to ${message.provider} after retries`
            )
          }
        } catch (error) {
          console.error('[Background] Error opening Deep Dive chat:', error)
          sendResponse({ success: false, error: error.message })
        }
      })()
      return true
    },
  }
}
