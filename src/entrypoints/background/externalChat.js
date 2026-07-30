// @ts-nocheck
/**
 * Handing a summary prompt off to an *external* chat site (Gemini, ChatGPT,
 * Perplexity, Grok) by opening a tab and driving its content script.
 *
 * Everything here exists because those pages are slow and hostile to
 * automation: Cloudflare interstitials, SPA hydration delays, and content
 * scripts that register their listener well after `tab.status === 'complete'`.
 * Hence the readiness polling and the retry wrappers.
 *
 * Seam (c) of `docs/refactor/03-god-files.md`.
 */
import { browser } from 'wxt/browser'
import { aiConfig } from '@/lib/config/aiConfig.js'
import {
  generateAISummaryPrompt,
  generateYouTubeAISummaryPrompt,
} from '@/lib/prompts/templates/aiSummary.js'
import { loadSettingsWithReadiness } from './settingsBootstrap.js'

/**
 * Waits for chat provider tab to be fully loaded and content script ready
 * Handles Cloudflare checks, slow networks, and SPA delays
 * @param {number} tabId - Tab ID
 * @param {string} provider - Provider ID (grok, gemini, chatgpt, perplexity)
 * @param {number} maxWaitTime - Maximum wait time in ms
 * @returns {Promise<boolean>} True if ready
 */
export async function waitForChatTabReady(tabId, provider, maxWaitTime = 10000) {
  const startTime = Date.now()
  const checkInterval = 500

  console.log(`[Background] Waiting for ${provider} tab to be ready...`)

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const tab = await browser.tabs.get(tabId)

      // Check if tab is complete and not on challenge/error pages
      const isNotBlocked =
        !tab.url.includes('challenges.cloudflare.com') &&
        !tab.url.includes('error') &&
        !tab.url.includes('blocked')

      if (tab.status === 'complete' && isNotBlocked) {
        // Try to ping content script
        try {
          await browser.tabs.sendMessage(tabId, { type: 'PING' })
          const elapsed = Date.now() - startTime
          console.log(`[Background] ${provider} tab ready after ${elapsed}ms`)
          return true
        } catch (pingError) {
          console.log(
            `[Background] ${provider} content script not ready, retrying...`
          )
        }
      }
    } catch (error) {
      console.warn(`[Background] Error checking ${provider} tab status:`, error)
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval))
  }

  console.warn(
    `[Background] ${provider} tab ready timeout after ${maxWaitTime}ms`
  )
  return false
}

/**
 * Sends message to chat provider tab with retry mechanism
 * @param {number} tabId - Tab ID
 * @param {Object} message - Message object
 * @param {string} provider - Provider ID (for logging)
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} retryDelay - Delay between retries in ms
 * @returns {Promise<boolean>} True if sent successfully
 */
export async function sendChatMessageWithRetry(
  tabId,
  message,
  provider,
  maxRetries = 3,
  retryDelay = 1000
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await browser.tabs.sendMessage(tabId, message)
      console.log(
        `[Background] Message sent to ${provider} on attempt ${i + 1}`
      )
      return true
    } catch (error) {
      console.warn(
        `[Background] ${provider} message send attempt ${i + 1} failed:`,
        error.message
      )
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }
  }
  return false
}

/**
 * Gets the appropriate message type for each chat provider
 * @param {string} provider - Provider ID
 * @returns {string} Message type for content script
 */
export function getProviderMessageType(provider) {
  const messageTypeMap = {
    gemini: 'FILL_GEMINI_FORM',
    chatgpt: 'FILL_CHATGPT_FORM',
    perplexity: 'FILL_PERPLEXITY_FORM',
    grok: 'FILL_GROK_FORM',
  }
  return messageTypeMap[provider] || 'FILL_GEMINI_FORM'
}

/**
 * Validates if the AI service is supported
 * @param {string} service - The AI service name
 * @returns {boolean} True if service is supported
 */
function validateService(service) {
  return aiConfig[service] !== undefined
}

/**
 * Creates a new tab for the specified AI service
 * @param {string} service - The AI service name
 * @param {Object} config - The service configuration
 * @returns {Promise<Object>} The created tab object
 */
async function createAITab(service, config) {
  console.log(`[Background] Creating ${service} tab`)
  const tab = await browser.tabs.create({
    url: config.url,
    active: true,
  })
  console.log(`[Background] ${service} tab created: ${tab.id}`)
  return tab
}

/**
 * Builds the prompt for AI summarization
 * @param {string} transcript - The transcript to summarize
 * @param {string} summaryLang - The language for summary
 * @param {string} sourceUrl - Optional URL of the source content
 * @returns {string} The formatted prompt
 */
function buildPrompt(transcript, summaryLang, sourceUrl = '') {
  return generateAISummaryPrompt(transcript, summaryLang, sourceUrl)
}

/**
 * Sends content to a tab with retry mechanism
 * @param {number} tabId - The ID of the tab
 * @param {string} messageType - The message type to send
 * @param {string} content - The content to send
 * @param {number} retries - Current retry count
 * @param {number} maxRetries - Maximum retry attempts
 * @param {string} service - The AI service name (for logging)
 * @param {Function} sendResponse - The response callback function
 * @returns {Promise<void>}
 */
async function sendContentToTab(
  tabId,
  messageType,
  content,
  retries,
  maxRetries,
  service,
  sendResponse
) {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: messageType,
      content: content,
    })

    console.log(`[Background] Transcript sent to ${service} successfully`)
    sendResponse({ success: true, tabId: tabId })
  } catch (error) {
    if (retries < maxRetries) {
      retries++
      console.log(`[Background] ${service} retry ${retries}/${maxRetries}`)
      setTimeout(
        () =>
          sendContentToTab(
            tabId,
            messageType,
            content,
            retries,
            maxRetries,
            service,
            sendResponse
          ),
        1000
      )
    } else {
      console.error(
        `[Background] ${service} content script not ready after max retries`
      )
      sendResponse({
        success: false,
        error: `${service} content script not ready`,
      })
    }
  }
}

/**
 * Opens an external chat site and pastes a summary prompt built from a transcript.
 * @param {string} service - The AI service name
 * @param {string} transcript - The transcript to summarize
 * @param {Function} sendResponse - The response callback function
 * @param {string} sourceUrl - Optional URL of the source content
 */
export async function handleAISummarization(
  service,
  transcript,
  sendResponse,
  sourceUrl = ''
) {
  try {
    console.log(`[Background] Processing ${service} summarization request`)

    // Validate service
    if (!validateService(service)) {
      throw new Error(`Unsupported AI service: ${service}`)
    }

    const config = aiConfig[service]

    // Load settings to get summary language
    const settings = await loadSettingsWithReadiness()
    const summaryLang = settings?.summaryLang || 'English'

    // Create AI service tab
    const tab = await createAITab(service, config)

    // Build prompt with optional source URL
    const prompt = buildPrompt(transcript, summaryLang, sourceUrl)
    console.log(`[Background] ${service} prompt length:`, prompt.length)

    // Send content to tab with retry mechanism
    setTimeout(() => {
      sendContentToTab(
        tab.id,
        config.messageType,
        prompt,
        0,
        15,
        service,
        sendResponse
      )
    }, 2000)
  } catch (error) {
    console.error(`[Background] Error processing ${service} request:`, error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * Handle Gemini summarization using YouTube URL directly (when no transcript is available)
 * Gemini can process YouTube videos directly through the URL
 * @param {string} youtubeUrl - The YouTube video URL
 * @param {Function} sendResponse - The response callback function
 */
export async function handleGeminiWithYouTubeURL(youtubeUrl, sendResponse) {
  try {
    console.log('[Background] Processing Gemini with YouTube URL:', youtubeUrl)

    const config = aiConfig['gemini']
    if (!config) {
      throw new Error('Gemini configuration not found')
    }

    // Load settings to get summary language
    const settings = await loadSettingsWithReadiness()
    const summaryLang = settings?.summaryLang || 'English'

    // Create Gemini tab
    const tab = await createAITab('gemini', config)

    // Build prompt with YouTube URL
    const prompt = generateYouTubeAISummaryPrompt(youtubeUrl, summaryLang)
    console.log('[Background] Gemini YouTube URL prompt length:', prompt.length)

    // Send content to tab with retry mechanism
    setTimeout(() => {
      sendContentToTab(
        tab.id,
        config.messageType,
        prompt,
        0,
        15,
        'gemini',
        sendResponse
      )
    }, 2000)
  } catch (error) {
    console.error('[Background] Error processing Gemini with YouTube URL:', error)
    sendResponse({ success: false, error: error.message })
  }
}
