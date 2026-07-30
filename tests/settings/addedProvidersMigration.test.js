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
  addOpenAICompatibleProfile,
  updateOpenAICompatibleProfile,
  removeOpenAICompatibleProfile,
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

describe('OpenAI Compatible Profiles Settings Store Integration', () => {
  beforeEach(async () => {
    mockStorage.value = {}
    await forceReloadSettings()
  })

  it('migration: migrates legacy flat fields to openai-compatible-legacy', () => {
    const raw = {
      openaiCompatibleApiKey: 'sk-legacy-key',
      openaiCompatibleBaseUrl: 'https://api.legacy.com',
      selectedOpenAICompatibleModel: 'legacy-model-1',
      addedProviders: ['gemini', 'openaiCompatible'],
    }
    const result = normalizeStoredSettings(raw)
    expect(result.openaiCompatibleProfiles).toBeDefined()
    expect(result.openaiCompatibleProfiles.length).toBe(1)

    const legacyProfile = result.openaiCompatibleProfiles[0]
    expect(legacyProfile.id).toBe('openai-compatible-legacy')
    expect(legacyProfile.name).toBe('OpenAI Compatible')
    expect(legacyProfile.apiKey).toBe('sk-legacy-key')
    expect(legacyProfile.baseUrl).toBe('https://api.legacy.com')
    expect(legacyProfile.defaultModel).toBe('legacy-model-1')
  })

  it('migration: does not recreate legacy profile if openaiCompatibleProfiles is explicitly empty', () => {
    const raw = {
      openaiCompatibleProfiles: [],
      openaiCompatibleApiKey: 'sk-legacy-key',
      openaiCompatibleBaseUrl: 'https://api.legacy.com',
      selectedOpenAICompatibleModel: 'legacy-model-1',
      addedProviders: ['gemini', 'openaiCompatible'],
    }
    const result = normalizeStoredSettings(raw)
    expect(result.openaiCompatibleProfiles).toEqual([])
  })

  it('CRUD: addOpenAICompatibleProfile adds a profile', async () => {
    expect(settings.openaiCompatibleProfiles).toEqual([])

    const id = await addOpenAICompatibleProfile({
      name: 'Custom Together',
      baseUrl: 'https://api.together.xyz',
      apiKey: 'sk-together',
      defaultModel: 'together-model',
    })

    expect(id).toMatch(/^openai-compatible-/)
    expect(settings.openaiCompatibleProfiles.length).toBe(1)

    const p = settings.openaiCompatibleProfiles[0]
    expect(p.id).toBe(id)
    expect(p.name).toBe('Custom Together')
    expect(p.baseUrl).toBe('https://api.together.xyz')
    expect(p.apiKey).toBe('sk-together')
    expect(p.defaultModel).toBe('together-model')
  })

  it('CRUD: updateOpenAICompatibleProfile updates fields and mirror settings if selected by Summarize', async () => {
    const id = await addOpenAICompatibleProfile({
      name: 'My Profile',
      baseUrl: 'https://api.my.com',
      apiKey: 'sk-my',
      defaultModel: 'my-model',
    })

    // Update it
    await updateOpenAICompatibleProfile(id, {
      name: 'My Updated Profile',
      baseUrl: 'https://api.my-updated.com',
    })

    const p = settings.openaiCompatibleProfiles[0]
    expect(p.name).toBe('My Updated Profile')
    expect(p.baseUrl).toBe('https://api.my-updated.com')
    expect(p.apiKey).toBe('sk-my') // preserved

    // Now test mirroring: select it for summarize
    settings.summarize = {
      provider: id,
      model: 'some-selected-model',
    }
    // Update again and see if mirror is updated
    await updateOpenAICompatibleProfile(id, {
      apiKey: 'sk-my-new-key',
    })

    expect(settings.openaiCompatibleApiKey).toBe('sk-my-new-key')
    expect(settings.openaiCompatibleBaseUrl).toBe('https://api.my-updated.com')
    expect(settings.selectedOpenAICompatibleModel).toBe('some-selected-model')
  })

  it('CRUD: removeOpenAICompatibleProfile removes profile and repairs references', async () => {
    const id = await addOpenAICompatibleProfile({
      name: 'To Delete',
      baseUrl: 'https://api.delete.com',
      apiKey: 'sk-delete',
      defaultModel: 'del-model',
    })

    // Set references
    settings.addedProviders = ['gemini', 'groq']
    settings.groqApiKey = 'groq-key'
    settings.summarize = {
      provider: id,
      model: 'del-model',
    }
    settings.chat = {
      provider: id,
      model: 'del-model',
      defaultReasoningLevel: 'provider-default',
      quickModels: [{ provider: id, model: 'del-model', label: 'Quick' }],
    }
    settings.tools.deepDive.customProvider = id
    settings.tools.deepDive.customModel = 'del-model'

    // Remove it
    await removeOpenAICompatibleProfile(id)

    expect(settings.openaiCompatibleProfiles).toEqual([])

    // summarize and chat should fallback to first added provider (groq in this case since groq is added/configured)
    expect(settings.summarize.provider).toBe('groq')
    expect(settings.chat.provider).toBe('groq')
    expect(settings.tools.deepDive.customProvider).toBe('groq')
    expect(settings.chat.quickModels).toEqual([])
  })

  it('CRUD: removing legacy profile clears flat compatibility fields', async () => {
    // Legacy profile created via migration
    mockStorage.value = {
      openaiCompatibleApiKey: 'sk-legacy-key',
      openaiCompatibleBaseUrl: 'https://api.legacy.com',
      selectedOpenAICompatibleModel: 'legacy-model-1',
      addedProviders: ['gemini', 'openaiCompatible'],
    }
    await forceReloadSettings()

    expect(settings.openaiCompatibleProfiles.length).toBe(1)
    expect(settings.openaiCompatibleProfiles[0].id).toBe('openai-compatible-legacy')

    await removeOpenAICompatibleProfile('openai-compatible-legacy')

    expect(settings.openaiCompatibleProfiles).toEqual([])
    expect(settings.openaiCompatibleApiKey).toBe('')
    expect(settings.openaiCompatibleBaseUrl).toBe('')
    expect(settings.selectedOpenAICompatibleModel).toBe('')
  })
})
