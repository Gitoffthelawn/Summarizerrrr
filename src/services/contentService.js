// @ts-nocheck
import { browser } from 'wxt/browser'
import { handleError } from '../lib/error/simpleErrorHandler.js'

const YOUTUBE_MATCH_PATTERN = /youtube\.com\/(watch|live)/i
const COURSE_MATCH_PATTERN =
  /(udemy\.com\/course\/.*\/learn\/|coursera\.org\/learn\/.*\/lecture\/|coursera\.org\/learn\/.*\/supplement\/)/i

/**
 * Send message with retry mechanism
 * REDUCED RETRIES: Now only 1 retry (down from 3) to avoid long waits
 * With auto-fallback for Gemini, we don't need many retries
 * @param {number} tabId - Tab ID to send message to
 * @param {object} message - Message object to send
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Delay between retries in ms
 * @returns {Promise<any>} Response from content script
 */
async function sendMessageWithRetry(
  tabId,
  message,
  maxRetries = 1,
  retryDelay = 500
) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[contentService] Sending message (attempt ${attempt}/${maxRetries}):`,
        message.action
      )

      const response = await browser.tabs.sendMessage(tabId, message)

      if (response?.success) {
        console.log(
          `[contentService] Message successful on attempt ${attempt}:`,
          message.action
        )
        return response
      } else if (response?.error) {
        lastError = new Error(response.error)
        console.log(
          `[contentService] Message failed on attempt ${attempt}:`,
          response.error
        )
      }
    } catch (error) {
      lastError = error
      console.log(
        `[contentService] Message error on attempt ${attempt}:`,
        error.message
      )

      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        console.log(
          `[contentService] Waiting ${retryDelay}ms before retry ${
            attempt + 1
          }...`
        )
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        // Increase delay for next retry (exponential backoff)
        retryDelay *= 1.5
      }
    }
  }

  // All retries failed
  throw lastError || new Error('Failed to communicate with content script')
}

/**
 * Lấy nội dung trang web bằng semantic extraction. Defuddle (cùng engine với
 * Obsidian Web Clipper) là nguồn chính; Accessibility Tree và DOM đầy đủ chỉ
 * là fallback để không làm mất nội dung trên các trang cấu trúc bất thường.
 * @param {number} tabId
 * @returns {Promise<string>}
 */
async function getSemanticWebpageContent(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['semantic-extractor.js'],
    })
    const semanticResults = await browser.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.__SUMMARIZERRRR_EXTRACT_SEMANTIC_CONTENT__?.(),
    })
    const semanticText = semanticResults[0]?.result?.content || ''
    if (semanticText.length >= 50) return semanticText
    console.warn(
      '[contentService] Defuddle returned insufficient content; trying lightweight semantic fallback'
    )
  } catch (error) {
    console.warn('[contentService] Defuddle extraction failed:', error)
  }

  try {
    // Inject accessibility tree script
    // File này nằm trong public/, WXT sẽ copy nó vào root của extension output
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['accessibility-tree.js'],
    })

    // Keep the lightweight extractor as a dependency-free fallback.
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () =>
        typeof window.__getPageContent === 'function'
          ? window.__getPageContent()
          : '',
    })

    const accessibilityText = results[0]?.result || ''
    if (accessibilityText.length >= 50) return accessibilityText

    console.warn(
      '[contentService] Semantic extractors returned insufficient content; falling back to full DOM text'
    )
    const fallbackResult = await browser.scripting.executeScript({
      target: { tabId },
      func: () =>
        document.body?.innerText?.trim() ||
        document.body?.textContent?.trim() ||
        '',
    })
    return fallbackResult[0]?.result || accessibilityText
  } catch (error) {
    console.error('[contentService] Semantic fallback extraction error:', error)
    // Fallback cuối cùng nếu cả hai script injection đều fail.
    const fallbackResult = await browser.scripting.executeScript({
      target: { tabId },
      func: () =>
        document.body?.innerText?.trim() ||
        document.body?.textContent?.trim() ||
        '',
    })
    return fallbackResult[0]?.result || ''
  }
}

/**
 * Lấy nội dung từ tab hiện tại.
 * Tự động xác định là trang YouTube, khóa học hay trang web thường dựa trên URL.
 * @param {'transcript' | 'timestampedTranscript' | 'webpageText'} contentType Loại nội dung cần lấy.
 * @param {string} [preferredLang='en'] Ngôn ngữ ưu tiên cho transcript.
 * @returns {Promise<{ type: 'youtube' | 'course' | 'webpage', content: string }>}
 * Object chứa loại trang và nội dung. Throws a structured error on failure.
 */
export async function getPageContent(
  contentType = 'webpageText',
  preferredLang = 'en'
) {
  const options = typeof contentType === 'object'
    ? contentType
    : { contentType, preferredLang }
  const requestedContentType = options.contentType || 'webpageText'
  const requestedLanguage = options.preferredLang || 'en'

  try {
    // Explicit target capture must never silently fall back to the active tab.
    const tab = options.tabId
      ? await browser.tabs.get(options.tabId)
      : (await browser.tabs.query({ active: true, currentWindow: true }))[0]
    if (!tab || !tab.id || !tab.url) {
      throw new Error('Could not get active tab information.')
    }

    const isYouTubeVideo = YOUTUBE_MATCH_PATTERN.test(tab.url)
    const isCourseVideo = COURSE_MATCH_PATTERN.test(tab.url)
    let actualPageType = 'webpage'
    if (isYouTubeVideo) actualPageType = 'youtube'
    else if (isCourseVideo) actualPageType = 'course'

    console.log(
      `[contentService] Processing tab ${tab.id} (${tab.url}) as ${actualPageType} for ${requestedContentType}`
    )

    if (requestedContentType === 'webpageText') {
      const pageText = await getSemanticWebpageContent(tab.id)

      if (pageText && pageText.length >= 50) {
        return { type: actualPageType, content: pageText }
      }

      throw new Error(
        'Failed to retrieve sufficient text content from the webpage.'
      )
    }

    if (
      isYouTubeVideo &&
      (requestedContentType === 'transcript' || requestedContentType === 'timestampedTranscript')
    ) {
      // Always use timestamped transcript for better AI understanding and accuracy
      const action = 'fetchTranscriptWithTimestamp'

      try {
        const response = await sendMessageWithRetry(
          tab.id,
          { action, lang: requestedLanguage },
          3,
          500
        )

        if (response?.success && response.transcript) {
          return { type: 'youtube', content: response.transcript }
        }
        throw new Error(
          response?.error ||
            `Failed to get ${requestedContentType} from YouTube content script.`
        )
      } catch (error) {
        console.error('[contentService] YouTube transcript error:', error)
        throw new Error(
          `Failed to get transcript from YouTube. Please try refreshing the page.`
        )
      }
    }

    if (isCourseVideo && requestedContentType === 'transcript') {
      try {
        const response = await sendMessageWithRetry(
          tab.id,
          { action: 'fetchCourseContent', lang: requestedLanguage },
          3,
          500
        )

        if (response?.success && (response.content || response.transcript)) {
          return {
            type: 'course',
            content: response.content || response.transcript,
          }
        }
        throw new Error(
          response?.error ||
            `Failed to get ${requestedContentType} from Course content script.`
        )
      } catch (error) {
        console.error('[contentService] Course content error:', error)
        throw new Error(
          `Failed to get course content. Please try refreshing the page.`
        )
      }
    }

    // Handle cases where transcript is requested on a non-video page
    if (
      !isYouTubeVideo &&
      !isCourseVideo &&
      (requestedContentType === 'transcript' || requestedContentType === 'timestampedTranscript')
    ) {
      const error = new Error(
        `Cannot get ${requestedContentType} from a non-video page.`
      )
      throw error
    }

    throw new Error('Unhandled case in getPageContent logic.')
  } catch (error) {
    console.error('[contentService] Error:', error)
    // Use simple error handler
    const handledError = handleError(error, {
      source: 'contentService',
      contentType: requestedContentType,
      preferredLang: requestedLanguage,
    })
    throw handledError
  }
}
