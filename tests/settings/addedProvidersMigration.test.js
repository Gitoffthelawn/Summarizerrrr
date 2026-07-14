import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock wxtStorageService settingStorage using vi.hoisted to prevent hoisting issues
const mockStorage = vi.hoisted(() => ({
  value: {},
  async getValue() {
    return this.value
  },
  async setValue(val) {
    this.value = val
  },
  watch: vi.fn(),
}))

vi.mock('@/services/wxtStorageService.js', () => ({
  settingsStorage: mockStorage,
}))

// Mock cloudSyncService to avoid unhandled browser/storage exceptions in Node environment
vi.mock('@/services/cloudSync/cloudSyncService.svelte.js', () => ({
  triggerSync: vi.fn(),
  saveCustomCredentials: vi.fn(),
}))

// Import dependencies after mocking
import {
  normalizeStoredSettings,
  settings,
  forceReloadSettings,
  addProvider,
  removeProvider,
} from '@/stores/settingsStore.svelte.js'

describe('addedProviders migration', () => {
  beforeEach(async () => {
    mockStorage.value = {}
    await forceReloadSettings()
  })

  it('fresh install → addedProviders === ["gemini"]', () => {
    const result = normalizeStoredSettings({})
    expect(result.addedProviders).toEqual(['gemini'])
  })

  it('legacy settings with deepseekApiKey → addedProviders contains gemini and deepseek', () => {
    const legacy = {
      deepseekApiKey: 'sk-deepseek-123',
      deepseekBaseUrl: 'https://api.deepseek.com/',
    }
    const result = normalizeStoredSettings(legacy)
    expect(result.addedProviders).toContain('gemini')
    expect(result.addedProviders).toContain('deepseek')
    // Gemini always first
    expect(result.addedProviders[0]).toBe('gemini')
  })

  it('legacy settings with groqApiKey + ollamaEndpoint → both present', () => {
    const legacy = {
      groqApiKey: 'gsk_test',
      ollamaEndpoint: 'http://127.0.0.1:11434/',
    }
    const result = normalizeStoredSettings(legacy)
    expect(result.addedProviders).toContain('gemini')
    expect(result.addedProviders).toContain('groq')
    expect(result.addedProviders).toContain('ollama')
  })

  it('running migration twice is idempotent', () => {
    const legacy = {
      deepseekApiKey: 'sk-deepseek-123',
      deepseekBaseUrl: 'https://api.deepseek.com/',
    }
    const first = normalizeStoredSettings(legacy)
    // Run again on the already-migrated result
    const second = normalizeStoredSettings(first)
    expect(second.addedProviders).toEqual(first.addedProviders)
  })

  it('existing addedProviders is not overwritten', () => {
    const existing = {
      addedProviders: ['gemini', 'openrouter'],
      deepseekApiKey: 'sk-deepseek-123', // This has a key but should NOT be auto-added
      deepseekBaseUrl: 'https://api.deepseek.com/',
    }
    const result = normalizeStoredSettings(existing)
    expect(result.addedProviders).toEqual(['gemini', 'openrouter'])
  })
})

describe('addProvider / removeProvider helpers', () => {
  beforeEach(async () => {
    mockStorage.value = {}
    await forceReloadSettings()
  })

  it('addProvider appends a provider, deduplicates', async () => {
    expect(settings.addedProviders).toEqual(['gemini'])

    await addProvider('deepseek')
    expect(settings.addedProviders).toEqual(['gemini', 'deepseek'])

    // Adding again should not duplicate
    await addProvider('deepseek')
    expect(settings.addedProviders).toEqual(['gemini', 'deepseek'])
  })

  it('removeProvider removes a non-gemini provider', async () => {
    await addProvider('groq')
    expect(settings.addedProviders).toContain('groq')

    await removeProvider('groq')
    expect(settings.addedProviders).not.toContain('groq')
    expect(settings.addedProviders).toContain('gemini')
  })

  it('removeProvider refuses to remove gemini', async () => {
    await removeProvider('gemini')
    expect(settings.addedProviders).toContain('gemini')
  })

  it('removeProvider does NOT clear the provider API key (non-destructive)', async () => {
    // Set an API key, add provider, then remove it
    mockStorage.value = {
      groqApiKey: 'gsk_test_key',
      addedProviders: ['gemini', 'groq'],
    }
    await forceReloadSettings()

    await removeProvider('groq')
    expect(settings.addedProviders).not.toContain('groq')
    // API key should still be there
    expect(settings.groqApiKey).toBe('gsk_test_key')
  })
})
