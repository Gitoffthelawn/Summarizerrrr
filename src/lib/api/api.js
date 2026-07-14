// @ts-nocheck
import { settings, loadSettings } from '@/stores/settingsStore.svelte.js'
import { promptBuilders } from '@/lib/prompts/builders/index.js'
import { customActionTemplates } from '@/lib/prompts/index.js'
import { replacePlaceholders } from '@/lib/prompts/utils.js'
import {
  generateContent as aiSdkGenerateContent,
  generateContentStream as aiSdkGenerateContentStream,
  generateContentStreamEnhanced as aiSdkGenerateContentStreamEnhanced,
} from './aiSdkAdapter.js'
import { getBrowserCompatibility } from '@/lib/utils/browserDetection.js'
import { resolveFeatureModel } from '@/lib/providers/featureModelResolver.js'
import {
  getProvider,
  normalizeProviderId,
  isProviderConfigured,
  resolveAdapterCall,
  resolveProviderEntry,
} from '@/lib/providers/providerRegistry.js'

/**
 * Checks if the selected provider supports streaming.
 * AI SDK 5 supports streaming for all providers.
 * @param {string} selectedProviderId - The ID of the selected provider.
 * @returns {boolean} - True if provider supports streaming, false otherwise.
 */
export function providerSupportsStreaming(selectedProviderId) {
  const normalizedId = normalizeProviderId(selectedProviderId)
  const provider = resolveProviderEntry(normalizedId, settings)
  const isProviderSupported = !!provider

  // Check browser compatibility
  const browserCompatibility = getBrowserCompatibility()

  // Return true only if both provider and browser support streaming
  return isProviderSupported && browserCompatibility.supportsAdvancedStreaming
}

/**
 * Resolves the provider and settings for summarization.
 * @param {object} userSettings - The current settings object
 * @returns {{ providerId: string, settings: object }} Resolved adapter provider ID and settings.
 * @throws {Error} If API key is not configured
 */
export function resolveSummarizeProvider(userSettings) {
  const { providerId, modelId } = resolveFeatureModel('summarize', userSettings)

  const provider = resolveProviderEntry(providerId, userSettings)
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`)
  }

  // Special check for additional API keys (like in gemini provider)
  let isConfigured = isProviderConfigured(providerId, userSettings)
  if (!isConfigured && provider.additionalKeysField) {
    const additionalKeys = userSettings[provider.additionalKeysField]
    if (Array.isArray(additionalKeys) && additionalKeys.some((k) => k && k.trim() !== '')) {
      isConfigured = true
    }
  }

  if (!isConfigured) {
    throw new Error(
      `${provider.label} API key is not configured. Click the settings icon on the right to add your API key.`
    )
  }

  return resolveAdapterCall(providerId, modelId, userSettings)
}



/**
 * Summarizes content using the selected AI provider.
 * @param {string} text - Content to summarize (transcript, web page text, or selected text).
 * @param {'youtube' | 'general' | 'selectedText' | 'analyze' | 'explain' | 'debate'} contentType - The type of content being summarized.
 * @returns {Promise<string>} - Promise that resolves with the summary in Markdown format.
 */
export async function summarizeContent(text, contentType, abortSignal = null) {
  // Ensure settings are initialized
  await loadSettings()

  const userSettings = settings
  const { providerId, settings: resolvedSettings } = resolveSummarizeProvider(userSettings)

  let systemInstruction, userPrompt

  const customActionTypes = ['analyze', 'explain', 'debate', 'commentAnalysis']

  // Mapping từ contentType sang settingKey
  const customActionSettingMap = {
    analyze: 'analyze',
    explain: 'explain',
    debate: 'debate',
    commentAnalysis: 'comment',
  }

  if (customActionTypes.includes(contentType)) {
    const settingPrefix = customActionSettingMap[contentType]
    const selectionKey = `${settingPrefix}PromptSelection`
    const customPromptKey = `${settingPrefix}CustomPromptContent`
    const customSystemKey = `${settingPrefix}CustomSystemInstructionContent`

    // Kiểm tra nếu user đã bật custom prompt và có nội dung
    if (
      userSettings[selectionKey] &&
      userSettings[customPromptKey]
    ) {
      // Sử dụng custom prompts từ user settings
      systemInstruction = userSettings[customSystemKey] || ''
      userPrompt = userSettings[customPromptKey]
        .replace(/__CONTENT__/g, text)
        .replace(/__LANG__/g, userSettings.summaryLang)
    } else {
      // Sử dụng default templates
      systemInstruction = customActionTemplates[contentType].systemPrompt

      // First, replace all placeholders except __CONTENT__
      const userPromptWithPlaceholders = replacePlaceholders(
        customActionTemplates[contentType].userPrompt,
        userSettings.summaryLang,
        userSettings.summaryLength,
        userSettings.summaryTone
      )

      // Then, replace content placeholder
      userPrompt = userPromptWithPlaceholders.replace('__CONTENT__', text)
    }
  } else {
    const contentConfig =
      promptBuilders[contentType] || promptBuilders['general'] // Fallback to general

    if (!contentConfig.buildPrompt) {
      throw new Error(
        `Configuration for content type "${contentType}" is incomplete.`
      )
    }

    ;({ systemInstruction, userPrompt } = contentConfig.buildPrompt(
      text,
      userSettings.summaryLang,
      userSettings.summaryLength,
      userSettings.summaryTone
    ))
  }

  try {
    // Use AI SDK adapter for unified content generation
    return await aiSdkGenerateContent(
      providerId,
      resolvedSettings,
      systemInstruction,
      userPrompt,
      { abortSignal }
    )
  } catch (e) {
    console.error(`AI SDK Error for ${selectedProviderId}:`, e)
    throw e
  }
}

export async function* summarizeContentStream(text, contentType, abortSignal = null) {
  // Ensure settings are initialized
  await loadSettings()

  const userSettings = settings
  const { providerId, settings: resolvedSettings } = resolveSummarizeProvider(userSettings)

  // Check browser compatibility for streaming
  const browserCompatibility = getBrowserCompatibility()

  // If browser doesn't support advanced streaming, throw an error to trigger fallback
  if (!browserCompatibility.supportsAdvancedStreaming) {
    throw new Error('Browser does not support advanced streaming features')
  }

  let systemInstruction, userPrompt

  const customActionTypes = ['analyze', 'explain', 'debate', 'commentAnalysis']

  // Mapping từ contentType sang settingKey
  const customActionSettingMap = {
    analyze: 'analyze',
    explain: 'explain',
    debate: 'debate',
    commentAnalysis: 'comment',
  }

  if (customActionTypes.includes(contentType)) {
    const settingPrefix = customActionSettingMap[contentType]
    const selectionKey = `${settingPrefix}PromptSelection`
    const customPromptKey = `${settingPrefix}CustomPromptContent`
    const customSystemKey = `${settingPrefix}CustomSystemInstructionContent`

    console.log(
      `[DEBUG] Processing custom action type in stream: ${contentType}`
    )
    console.log(
      `[DEBUG] Custom prompt enabled: ${userSettings[selectionKey]}`
    )

    // Kiểm tra nếu user đã bật custom prompt và có nội dung
    if (
      userSettings[selectionKey] &&
      userSettings[customPromptKey]
    ) {
      // Sử dụng custom prompts từ user settings
      systemInstruction = userSettings[customSystemKey] || ''
      userPrompt = userSettings[customPromptKey]
        .replace(/__CONTENT__/g, text)
        .replace(/__LANG__/g, userSettings.summaryLang)
      console.log(
        `[DEBUG] Using CUSTOM prompt for ${contentType}:`,
        userPrompt.substring(0, 100) + '...'
      )
    } else {
      // Sử dụng default templates
      systemInstruction = customActionTemplates[contentType].systemPrompt

      // First, replace all placeholders except __CONTENT__
      const userPromptWithPlaceholders = replacePlaceholders(
        customActionTemplates[contentType].userPrompt,
        userSettings.summaryLang,
        userSettings.summaryLength,
        userSettings.summaryTone
      )

      // Then, replace content placeholder
      userPrompt = userPromptWithPlaceholders.replace('__CONTENT__', text)
      console.log(
        `[DEBUG] Using DEFAULT template for ${contentType}:`,
        userPrompt.substring(0, 100) + '...'
      )
    }
  } else {
    const contentConfig =
      promptBuilders[contentType] || promptBuilders['general'] // Fallback to general

    if (!contentConfig.buildPrompt) {
      throw new Error(
        `Configuration for content type "${contentType}" is incomplete.`
      )
    }

    ;({ systemInstruction, userPrompt } = contentConfig.buildPrompt(
      text,
      userSettings.summaryLang,
      userSettings.summaryLength,
      userSettings.summaryTone
    ))
  }

  try {
    // Use AI SDK adapter for unified streaming với smoothing
    const streamGenerator = aiSdkGenerateContentStream(
      providerId,
      resolvedSettings,
      systemInstruction,
      userPrompt,
      {
        useSmoothing: browserCompatibility.streamingOptions.useSmoothing,
        abortSignal
      }
    )

    for await (const chunk of streamGenerator) {
      yield chunk
    }
  } catch (e) {
    console.error(`AI SDK Stream Error for ${selectedProviderId}:`, e)

    // Check if this is an abort error - if so, just return (don't throw)
    if (e.name === 'AbortError' || e.message?.includes('aborted')) {
      console.log('[api] Stream aborted by user')
      return // Exit gracefully without throwing
    }

    // Add Firefox mobile specific error handling
    if (browserCompatibility.isFirefoxMobile && e.message.includes('flush')) {
      e.isFirefoxMobileStreamingError = true
    }

    throw e
  }
}

/**
 * Enhances a system prompt and user prompt using the selected AI provider.
 * @param {string} userPrompt - The user prompt to enhance.
 * @returns {Promise<string>} - Promise that resolves with the enhanced prompts.
 */
export async function enhancePrompt(userPrompt) {
  // Ensure settings are initialized
  await loadSettings()

  const userSettings = settings
  const { providerId, settings: resolvedSettings } = resolveSummarizeProvider(userSettings)

  const contentConfig = promptBuilders['promptEnhance']

  if (!contentConfig.buildPrompt) {
    throw new Error(
      `Configuration for content type "promptEnhance" is incomplete.`
    )
  }

  const { systemInstruction, userPrompt: enhancedPrompt } =
    contentConfig.buildPrompt(userPrompt, userSettings.summaryLang)

  try {
    // Use AI SDK adapter for unified content generation
    return await aiSdkGenerateContent(
      providerId,
      resolvedSettings,
      systemInstruction,
      enhancedPrompt
    )
  } catch (e) {
    console.error(`AI SDK Error for ${selectedProviderId}:`, e)
    throw e
  }
}

/**
 * Summarizes YouTube video content by chapter using the selected AI provider.
 * @param {string} timestampedTranscript - Video transcript with timestamps.
 * @returns {Promise<string>} - Promise that resolves with the chapter summary in Markdown format.
 */
export async function summarizeChapters(timestampedTranscript, abortSignal = null) {
  // Ensure settings are initialized
  await loadSettings()

  const userSettings = settings
  const { providerId, settings: resolvedSettings } = resolveSummarizeProvider(userSettings)

  const chapterConfig = promptBuilders['chapter']

  if (!chapterConfig.buildPrompt) {
    throw new Error(`Configuration for chapter summary is incomplete.`)
  }

  const { systemInstruction, userPrompt } = chapterConfig.buildPrompt(
    timestampedTranscript,
    userSettings.summaryLang,
    userSettings.summaryLength,
    userSettings.summaryTone
  )

  try {
    // Use AI SDK adapter for unified content generation
    return await aiSdkGenerateContent(
      providerId,
      resolvedSettings,
      systemInstruction,
      userPrompt,
      { abortSignal }
    )
  } catch (e) {
    console.error(`AI SDK Error for ${selectedProviderId} (Chapters):`, e)
    throw e
  }
}

export async function* summarizeChaptersStream(timestampedTranscript, abortSignal = null) {
  // Ensure settings are initialized
  await loadSettings()

  const userSettings = settings
  const { providerId, settings: resolvedSettings } = resolveSummarizeProvider(userSettings)

  // Check browser compatibility for streaming
  const browserCompatibility = getBrowserCompatibility()

  // If browser doesn't support advanced streaming, throw an error to trigger fallback
  if (!browserCompatibility.supportsAdvancedStreaming) {
    throw new Error('Browser does not support advanced streaming features')
  }

  const chapterConfig = promptBuilders['chapter']

  if (!chapterConfig.buildPrompt) {
    throw new Error(`Configuration for chapter summary is incomplete.`)
  }

  const { systemInstruction, userPrompt } = chapterConfig.buildPrompt(
    timestampedTranscript,
    userSettings.summaryLang,
    userSettings.summaryLength,
    userSettings.summaryTone
  )

  try {
    // Use AI SDK adapter for unified streaming với smoothing
    const streamGenerator = aiSdkGenerateContentStream(
      providerId,
      resolvedSettings,
      systemInstruction,
      userPrompt,
      {
        useSmoothing: browserCompatibility.streamingOptions.useSmoothing,
        abortSignal
      }
    )

    for await (const chunk of streamGenerator) {
      yield chunk
    }
  } catch (e) {
    console.error(
      `AI SDK Stream Error for ${selectedProviderId} (Chapters):`,
      e
    )

    // Check if this is an abort error - if so, just return (don't throw)
    if (e.name === 'AbortError' || e.message?.includes('aborted')) {
      console.log('[api] Chapter stream aborted by user')
      return // Exit gracefully without throwing
    }

    // Add Firefox mobile specific error handling
    if (browserCompatibility.isFirefoxMobile && e.message.includes('flush')) {
      e.isFirefoxMobileStreamingError = true
    }

    throw e
  }
}

/**
 * Enhanced streaming for content with full text accumulation
 * Useful cho hybrid approach với StreamingMarkdownV2
 */
export async function* summarizeContentStreamEnhanced(text, contentType) {
  // Ensure settings are initialized
  await loadSettings()

  const userSettings = settings
  const { providerId, settings: resolvedSettings } = resolveSummarizeProvider(userSettings)

  // Check browser compatibility for streaming
  const browserCompatibility = getBrowserCompatibility()

  // If browser doesn't support advanced streaming, throw an error to trigger fallback
  if (!browserCompatibility.supportsAdvancedStreaming) {
    throw new Error('Browser does not support advanced streaming features')
  }

  let systemInstruction, userPrompt

  const customActionTypes = ['analyze', 'explain', 'debate', 'commentAnalysis']

  // Mapping từ contentType sang settingKey
  const customActionSettingMap = {
    analyze: 'analyze',
    explain: 'explain',
    debate: 'debate',
    commentAnalysis: 'comment',
  }

  if (customActionTypes.includes(contentType)) {
    const settingPrefix = customActionSettingMap[contentType]
    const selectionKey = `${settingPrefix}PromptSelection`
    const customPromptKey = `${settingPrefix}CustomPromptContent`
    const customSystemKey = `${settingPrefix}CustomSystemInstructionContent`

    console.log(
      `[DEBUG] Processing custom action type in enhanced stream: ${contentType}`
    )
    console.log(
      `[DEBUG] Custom prompt enabled: ${userSettings[selectionKey]}`
    )

    // Kiểm tra nếu user đã bật custom prompt và có nội dung
    if (
      userSettings[selectionKey] &&
      userSettings[customPromptKey]
    ) {
      // Sử dụng custom prompts từ user settings
      systemInstruction = userSettings[customSystemKey] || ''
      userPrompt = userSettings[customPromptKey]
        .replace(/__CONTENT__/g, text)
        .replace(/__LANG__/g, userSettings.summaryLang)
      console.log(
        `[DEBUG] Using CUSTOM prompt for enhanced ${contentType}:`,
        userPrompt.substring(0, 100) + '...'
      )
    } else {
      // Sử dụng default templates
      systemInstruction = customActionTemplates[contentType].systemPrompt

      // First, replace all placeholders except __CONTENT__
      const userPromptWithPlaceholders = replacePlaceholders(
        customActionTemplates[contentType].userPrompt,
        userSettings.summaryLang,
        userSettings.summaryLength,
        userSettings.summaryTone
      )

      // Then, replace content placeholder
      userPrompt = userPromptWithPlaceholders.replace('__CONTENT__', text)
      console.log(
        `[DEBUG] Using DEFAULT template for enhanced ${contentType}:`,
        userPrompt.substring(0, 100) + '...'
      )
    }
  } else {
    const contentConfig =
      promptBuilders[contentType] || promptBuilders['general']

    if (!contentConfig.buildPrompt) {
      throw new Error(
        `Configuration for content type "${contentType}" is incomplete.`
      )
    }

    const { systemInstruction, userPrompt } = contentConfig.buildPrompt(
      text,
      userSettings.summaryLang,
      userSettings.summaryLength,
      userSettings.summaryTone
    )
  }

  try {
    const streamGenerator = aiSdkGenerateContentStreamEnhanced(
      providerId,
      resolvedSettings,
      systemInstruction,
      userPrompt,
      { useSmoothing: browserCompatibility.streamingOptions.useSmoothing }
    )

    for await (const streamData of streamGenerator) {
      yield streamData
    }
  } catch (e) {
    console.error(`AI SDK Enhanced Stream Error for ${selectedProviderId}:`, e)

    // Add Firefox mobile specific error handling
    if (browserCompatibility.isFirefoxMobile && e.message.includes('flush')) {
      e.isFirefoxMobileStreamingError = true
    }

    throw e
  }
}
