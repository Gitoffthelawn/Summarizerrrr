// @ts-nocheck
import { settings } from '@/stores/settingsStore.svelte.js'
import {
  resolveProviderEntry,
  isProviderConfigured,
} from '@/lib/providers/providerRegistry.js'

/**
 * Composable for API key validation logic
 * @returns {Object} API key validation utilities
 */
export function useApiKeyValidation() {
  // Check if current provider needs API key setup
  const needsApiKeySetup = $derived(() => {
    const rawProvider = settings.selectedProvider
    const provider = resolveProviderEntry(rawProvider, settings)
    if (!provider) {
      return false
    }

    // Providers không cần API key (ollama, lmstudio)
    if (provider.requiresKey === false) {
      return false
    }

    // Check xem API key có rỗng không hoặc chưa được cấu hình
    return !isProviderConfigured(rawProvider, settings)
  })

  // Get display name for current provider
  const currentProviderDisplayName = $derived(() => {
    const rawProvider = settings.selectedProvider
    const provider = resolveProviderEntry(rawProvider, settings)
    return provider ? provider.label : rawProvider
  })

  /**
   * Get the API key field name for a given provider
   * @param {string} providerId - The provider ID
   * @returns {string|null} The API key field name or null if not needed
   */
  const getApiKeyField = (providerId) => {
    const provider = resolveProviderEntry(providerId, settings)
    return provider ? provider.apiKeyField : null
  }

  /**
   * Check if a specific provider needs API key
   * @param {string} providerId - The provider ID
   * @returns {boolean} Whether the provider needs an API key
   */
  const providerNeedsApiKey = (providerId) => {
    const provider = resolveProviderEntry(providerId, settings)
    return provider ? provider.requiresKey !== false : true
  }

  return {
    needsApiKeySetup: () => needsApiKeySetup,
    currentProviderDisplayName: () => currentProviderDisplayName,
    getApiKeyField,
    providerNeedsApiKey,
  }
}
