// @ts-nocheck
import { settings } from '@/stores/settingsStore.svelte.js'
import { getAISDKModel } from '@/lib/api/aiSdkAdapter.js'
import { resolveFeatureModel } from '@/lib/providers/featureModelResolver.js'
import {
  getProvider,
  normalizeProviderId,
  isProviderConfigured,
  getApiKey,
  resolveAdapterCall,
} from '@/lib/providers/providerRegistry.js'

/**
 * Resolves the effective provider configuration for a tool
 * @param {string} toolName - Name of the tool (e.g., 'deepDive')
 * @returns {Object} Resolved provider config
 * @throws {Error} If no valid provider is configured
 */
export function resolveToolProvider(toolName) {
  // Validate tool exists
  const toolConfig = settings.tools?.[toolName]

  if (!toolConfig) {
    throw new Error(`Tool "${toolName}" not found in settings`)
  }

  // Check if tool is enabled
  if (!toolConfig.enabled) {
    throw new Error(
      `Tool "${toolName}" is disabled. Please enable it in Settings > Tools.`
    )
  }

  // ✅ CASE 1: Use Gemini Basic (with smart fallback)
  if (toolConfig.useGeminiBasic) {
    const geminiApiKey = settings.geminiApiKey?.trim()

    // If Gemini Basic API key exists, use it
    if (geminiApiKey) {
      console.log('[toolProviderService] Using Gemini Basic')
      return {
        provider: 'gemini',
        model: 'gemma-4-26b-a4b-it',
      }
    }

    // ✅ SMART FALLBACK: Use current summary provider
    console.warn(
      '[toolProviderService] Gemini Basic API key not found, falling back to summary provider'
    )
    return getFallbackProvider('Gemini Basic')
  }

  // ✅ CASE 2: Use custom provider (with smart fallback)
  const { customProvider, customModel } = toolConfig

  // Validate provider
  if (!customProvider || typeof customProvider !== 'string') {
    throw new Error('Custom provider is not configured')
  }

  // Get and validate API key
  const providerKey = getProviderApiKey(customProvider)

  // ✅ If custom provider has API key, use it
  if (providerKey && (typeof providerKey !== 'string' || providerKey.trim())) {
    // Validate model name
    if (
      !customModel ||
      typeof customModel !== 'string' ||
      !customModel.trim()
    ) {
      throw new Error(
        `Model name for "${customProvider}" is invalid or missing`
      )
    }

    console.log(
      `[toolProviderService] Using custom provider: ${customProvider}`
    )
    return {
      provider: customProvider,
      model: customModel.trim(),
    }
  }

  // ✅ SMART FALLBACK: Use current summary provider
  console.warn(
    `[toolProviderService] Custom provider "${customProvider}" has no API key, falling back to summary provider`
  )
  return getFallbackProvider(customProvider)
}

/**
 * Gets API key for a specific provider
 * @param {string} providerId - Provider ID
 * @returns {string|null} API key or null if not found
 */
function getProviderApiKey(providerId) {
  const normalizedId = normalizeProviderId(providerId)
  const provider = getProvider(normalizedId)
  if (!provider) return null

  if (provider.requiresKey === false) {
    return 'local'
  }

  const key = getApiKey(provider.id, settings)
  if (typeof key === 'string' && key.trim()) {
    return key
  }
  return null
}

/**
 * Gets fallback to summary provider
 * @param {string} attemptedProvider - Provider that was attempted but failed
 * @returns {Object} Provider config
 * @throws {Error} If no valid provider available
 */
function getFallbackProvider(attemptedProvider) {
  const { providerId, modelId, settingsOverlay } = resolveFeatureModel('summarize', settings)
  const isAdvancedMode = !!settingsOverlay?.isAdvancedMode

  const providerKey = getProviderApiKey(providerId)

  if (!providerKey) {
    throw new Error(
      `No valid AI provider configured. Please add an API key for "${providerId}" or "${attemptedProvider}" in Settings > Summary.`
    )
  }

  console.log(
    `[toolProviderService] ✅ Using fallback provider: ${providerId} (${modelId})${
      isAdvancedMode ? ' [Advanced]' : ''
    }`
  )

  return {
    provider: providerId,
    model: modelId,
    isAdvancedMode, // ✅ Pass advanced mode flag
  }
}

/**
 * Creates an AI SDK model instance for a tool
 * @param {string} toolName - Name of the tool
 * @returns {Object} AI SDK model instance
 */
export function getToolAIModel(toolName) {
  const providerConfig = resolveToolProvider(toolName)

  // Build clean settings object chỉ với những gì cần thiết
  const modelSettings = buildModelSettings(providerConfig, settings)

  const resolved = resolveAdapterCall(providerConfig.provider, providerConfig.model, modelSettings)

  return getAISDKModel(resolved.providerId, resolved.settings)
}

/**
 * Helper function để build model-specific settings
 * @param {Object} providerConfig - Provider configuration
 * @param {Object} globalSettings - Global settings
 * @returns {Object} Model settings
 */
export function buildModelSettings(providerConfig, globalSettings) {
  const { provider, model, isAdvancedMode } = providerConfig

  // ✅ Convert Svelte proxy to plain object để tránh performance issues
  const plainSettings = JSON.parse(JSON.stringify(globalSettings))

  const normalizedId = normalizeProviderId(provider)
  const p = getProvider(normalizedId)
  const modelKey = p ? p.legacyModelField : 'selectedGeminiModel'

  // ✅ Dùng lại toàn bộ global settings, chỉ override những gì cần thiết
  return {
    ...plainSettings,
    selectedProvider: provider,
    [modelKey]: model,
    // ✅ UPDATED: Preserve isAdvancedMode from fallback detection
    isAdvancedMode: isAdvancedMode !== undefined ? isAdvancedMode : false,
  }
}

/**
 * Checks if a tool has a valid provider configured
 * @param {string} toolName - Name of the tool
 * @returns {boolean} True if valid provider exists
 */
export function hasValidToolProvider(toolName) {
  try {
    resolveToolProvider(toolName)
    return true
  } catch {
    return false
  }
}
