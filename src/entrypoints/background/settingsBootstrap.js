// @ts-nocheck
/**
 * Settings bootstrap for the background service worker.
 *
 * NOTE: this is still the background's *private* reimplementation of settings
 * loading — it bypasses `settingsStore` on two of its three strategies. Sharing
 * it with the store is seam (f) in `docs/refactor/03-god-files.md` and is
 * deliberately NOT done here; this module only relocates the existing code so
 * `externalChat.js` can import it instead of receiving it as an injected dep.
 */
import { browser } from 'wxt/browser'
import { loadSettings } from '@/stores/settingsStore.svelte.js'

/**
 * Checks if browser storage is ready and accessible
 * @returns {Promise<boolean>} True if storage is ready
 */
export async function isStorageReady() {
  try {
    // Try to write and read a test value to verify storage is working
    const testKey = '__storage_readiness_test__'
    const testValue = Date.now().toString()
    await browser.storage.local.set({ [testKey]: testValue })
    const result = await browser.storage.local.get(testKey)
    await browser.storage.local.remove(testKey)
    return result[testKey] === testValue
  } catch (error) {
    console.warn('[Background] Storage readiness check failed:', error)
    return false
  }
}

/**
 * Load settings directly from browser.storage with multiple key patterns
 * @returns {Promise<Object|null>} Settings object or null if failed
 */
export async function loadSettingsDirectly() {
  try {
    // Try multiple possible storage keys based on discovered patterns
    const possibleKeys = [
      'settings',
      'local:settings',
      'wxt:settings',
      'local_settings',
    ]

    for (const key of possibleKeys) {
      const result = await browser.storage.local.get(key)
      const storedSettings = result[key]

      if (
        storedSettings &&
        typeof storedSettings === 'object' &&
        Object.keys(storedSettings).length > 0
      ) {
        return storedSettings
      }
    }

    return null
  } catch (error) {
    console.error('[Background] Error loading settings directly:', error)
    return null
  }
}

/**
 * Initialize default settings if none exist
 * @returns {Promise<Object>} Default settings object
 */
export async function initializeDefaultSettings() {
  const defaultSettings = {
    iconClickAction: 'floating', // Use floating as default for this fix
    selectedProvider: 'gemini',
    hasCompletedOnboarding: false,
    // Add other essential defaults as needed
  }

  try {
    // Try to save default settings to storage
    await browser.storage.local.set({ 'local:settings': defaultSettings })
    console.log(
      '[Background] Initialized default settings:',
      defaultSettings.iconClickAction
    )
    return defaultSettings
  } catch (error) {
    console.error('[Background] Failed to initialize default settings:', error)
    return defaultSettings // Return anyway, don't persist but use in memory
  }
}

/**
 * Enhanced settings loading with multiple fallback strategies
 * @returns {Promise<Object|null>} Settings object or null if failed
 */
export async function loadSettingsWithReadiness() {
  try {
    // Strategy 1: Check if storage is ready and try WXT storage
    if (await isStorageReady()) {
      try {
        const settings = await loadSettings()
        if (
          settings &&
          typeof settings === 'object' &&
          settings.iconClickAction
        ) {
          return settings
        }
      } catch (error) {
        console.warn('[Background] WXT storage failed, trying direct access')
      }
    }

    // Strategy 2: Direct browser.storage access as backup
    const directSettings = await loadSettingsDirectly()
    if (directSettings && directSettings.iconClickAction) {
      return directSettings
    }

    // Strategy 3: Initialize default settings as last resort
    const defaultSettings = await initializeDefaultSettings()
    if (defaultSettings && defaultSettings.iconClickAction) {
      return defaultSettings
    }

    console.warn('[Background] All settings loading strategies failed')
    return null
  } catch (error) {
    console.error('[Background] Error in loadSettingsWithReadiness:', error)
    return null
  }
}
