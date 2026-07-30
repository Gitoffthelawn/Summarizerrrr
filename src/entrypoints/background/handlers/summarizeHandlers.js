// @ts-nocheck
/**
 * Messages that acquire content or kick off a summary: Quick Summary in a
 * background tab, YouTube comment fetching, transcript relay, and the
 * selected-text summary the content script asks for.
 */
import { browser } from 'wxt/browser'
import { get } from 'svelte/store'
import { settingsStorage } from '@/services/wxtStorageService.js'
import {
  summaryState,
  summarizeSelectedText,
} from '@/stores/summaryStore.svelte.js'

export function createSummarizeHandlers() {
  return {
    // Quick Summary - Open YouTube video in background tab
    QUICK_SUMMARY_OPEN_TAB: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          console.log('[Background] QUICK_SUMMARY_OPEN_TAB received:', message)
          const { videoId } = message
          console.log('[Background] videoId extracted:', videoId)

          // Get Quick Summary autoplay setting
          const currentSettings = await settingsStorage.getValue()
          const autoplayMode = currentSettings?.quickSummaryAutoplay || 'pause'
          console.log('[Background] Quick Summary autoplay mode:', autoplayMode)

          // Don't use qs=1 param - YouTube strips it
          // Instead, we'll send a message to the tab after it loads
          const url = `https://www.youtube.com/watch?v=${videoId}`
          console.log('[Background] Opening URL:', url)

          // Open tab in background (active: false = no focus switch)
          const tab = await browser.tabs.create({
            url,
            active: false
          })

          console.log(`[Background] Quick Summary tab opened: ${tab.id}`)

          // Wait for tab to load, then send message to trigger summarization
          const sendQuickSummaryTrigger = async (tabId, retries = 5) => {
            for (let i = 0; i < retries; i++) {
              try {
                // Wait between attempts (2s, 3s, 4s...)
                const delay = 2000 + (i * 1000)
                await new Promise(r => setTimeout(r, delay))

                const response = await browser.tabs.sendMessage(tabId, {
                  type: 'QUICK_SUMMARY_TRIGGER',
                  videoId,
                  autoplayMode // Send autoplay mode to content script
                })

                if (response?.success) {
                  console.log(`[Background] QUICK_SUMMARY_TRIGGER successful on tab ${tabId}${response.alreadyTriggered ? ' (already triggered)' : ''}`)
                  return
                }

                console.log(`[Background] Retry ${i + 1}/${retries} - content script received but returned failure:`, response?.error)
              } catch (e) {
                // Check if error is "Could not establish connection" (script not injected yet)
                const isNotReady = e.message?.includes('Could not establish connection') ||
                                  e.message?.includes('message port closed')

                if (isNotReady) {
                  console.log(`[Background] Retry ${i + 1}/${retries} - content script not ready yet`)
                } else {
                  console.warn(`[Background] Retry ${i + 1}/${retries} - unexpected error:`, e.message)
                }
              }
            }
            console.error('[Background] Failed to send QUICK_SUMMARY_TRIGGER after retries')
          }

          // Fire and forget - don't block response
          sendQuickSummaryTrigger(tab.id)

          sendResponse({ success: true, tabId: tab.id })
        } catch (error) {
          console.error('[Background] Failed to open Quick Summary tab:', error)
          sendResponse({ success: false, error: error.message })
        }
      })()
      return true
    },

    // YouTube Comments Fetch - Forward to content script in same tab
    fetchYouTubeComments: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          console.log(
            '[Background] Forwarding fetchYouTubeComments to tab:',
            sender.tab?.id
          )

          if (!sender.tab?.id) {
            throw new Error('No tab ID available from sender')
          }

          // Forward message to content script in the same tab
          const response = await browser.tabs.sendMessage(sender.tab.id, {
            action: 'fetchYouTubeComments',
            videoId: message.videoId,
            maxComments: message.maxComments,
          })

          console.log(
            '[Background] Received comments response:',
            response?.success
          )
          sendResponse(response)
        } catch (error) {
          console.error(
            '[Background] Error forwarding fetchYouTubeComments:',
            error
          )
          sendResponse({
            success: false,
            error: error.message || 'Failed to fetch comments',
          })
        }
      })()
      return true
    },

    getTranscript: (message, sender, sendResponse) => {
      // The old chain guarded on `message.tabId` as part of its `if`, so a
      // getTranscript with no tabId fell through to no handler at all. Keep that.
      if (!message.tabId) return
      ;(async () => {
        try {
          const response = await browser.tabs.sendMessage(message.tabId, {
            action: 'fetchTranscript',
            lang: message.lang,
          })
          sendResponse(
            response && response.success
              ? { transcript: response.transcript }
              : { error: response?.error || 'Failed to get transcript.' }
          )
        } catch (err) {
          sendResponse({ success: false, error: err.message })
        }
      })()
      return true
    },

    REQUEST_SUMMARY: (message, sender, sendResponse) => {
      ;(async () => {
        const { type, payload, requestId } = message
        try {
          if (type === 'selectedText') {
            await summarizeSelectedText(payload.text)
            const summary = get(summaryState.selectedTextSummary)
            sendResponse({ action: 'SUMMARY_RESPONSE', summary, requestId })
          } else {
            throw new Error(`Unsupported summary type: ${type}`)
          }
        } catch (error) {
          sendResponse({
            action: 'SUMMARY_ERROR',
            error: error.message,
            requestId,
          })
        }
      })()
      return true
    },
  }
}
