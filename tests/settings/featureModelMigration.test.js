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
  updateSettings,
  updateFeatureSettings,
  settings,
  forceReloadSettings,
} from '@/stores/settingsStore.svelte.js'

describe('Feature Model Migration & Normalization', () => {
  beforeEach(async () => {
    // Reset mock storage value
    mockStorage.value = {}
    // Force settings store reload to clear cached promise and reset to defaults
    await forceReloadSettings()
  })

  it('fresh install (no stored settings) -> blocks equal defaults', () => {
    const result = normalizeStoredSettings({})
    expect(result.summarize).toEqual({
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
    })
    expect(result.chat).toEqual({
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      defaultReasoningLevel: 'provider-default',
      quickModels: [],
    })
  })

  it('legacy Advanced user with deepseek -> both blocks seeded to deepseek', () => {
    const legacy = {
      isAdvancedMode: true,
      selectedProvider: 'deepseek',
      selectedDeepseekModel: 'deepseek-chat',
    }
    const result = normalizeStoredSettings(legacy)
    expect(result.summarize).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    })
    expect(result.chat).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      defaultReasoningLevel: 'provider-default',
      quickModels: [],
    })
  })

  it('legacy Basic user -> both blocks gemini + selectedGeminiModel', () => {
    const legacy = {
      isAdvancedMode: false,
      selectedProvider: 'deepseek',
      selectedGeminiModel: 'gemini-custom-basic',
    }
    const result = normalizeStoredSettings(legacy)
    expect(result.summarize).toEqual({
      provider: 'gemini',
      model: 'gemini-custom-basic',
    })
    expect(result.chat).toEqual({
      provider: 'gemini',
      model: 'gemini-custom-basic',
      defaultReasoningLevel: 'provider-default',
      quickModels: [],
    })
  })

  it('legacy Advanced Gemini user -> blocks use gemini (unified)', () => {
    const legacy = {
      isAdvancedMode: true,
      selectedProvider: 'gemini',
      selectedGeminiAdvancedModel: 'gemini-custom-advanced',
    }
    const result = normalizeStoredSettings(legacy)
    // Migration converts selectedGeminiAdvancedModel -> selectedGeminiModel
    // migrateFeatureModelSettings derives provider = 'gemini' (not geminiAdvanced)
    expect(result.summarize).toEqual({
      provider: 'gemini',
      model: 'gemini-custom-advanced',
    })
    expect(result.chat).toEqual({
      provider: 'gemini',
      model: 'gemini-custom-advanced',
      defaultReasoningLevel: 'provider-default',
      quickModels: [],
    })
  })

  it('re-seed after old-client wipe (retains legacy keys, summarize/chat stripped)', () => {
    const wiped = {
      isAdvancedMode: true,
      selectedProvider: 'groq',
      selectedGroqModel: 'groq-custom-model',
    }
    const result = normalizeStoredSettings(wiped)
    expect(result.summarize).toEqual({
      provider: 'groq',
      model: 'groq-custom-model',
    })
    expect(result.chat).toEqual({
      provider: 'groq',
      model: 'groq-custom-model',
      defaultReasoningLevel: 'provider-default',
      quickModels: [],
    })
  })

  it('migration does not overwrite an existing block (idempotency)', () => {
    const existing = {
      isAdvancedMode: true,
      selectedProvider: 'gemini',
      summarize: {
        provider: 'groq',
        model: 'groq-model',
      },
      chat: {
        provider: 'groq',
        model: 'groq-model',
        defaultReasoningLevel: 'provider-default',
        quickModels: [],
      },
    }
    const result = normalizeStoredSettings(existing)
    expect(result.summarize.provider).toBe('groq')
    expect(result.summarize.model).toBe('groq-model')
    expect(result.chat.provider).toBe('groq')
    expect(result.chat.model).toBe('groq-model')
  })

  it('fresh install + old-client cloud payload -> blocks reflect deepseek payload', async () => {
    // 1. Initial local load sees no stored settings -> defaults loaded
    mockStorage.value = {}
    await forceReloadSettings()
    expect(settings.summarize.provider).toBe('gemini')

    // 2. Incoming cloud payload with legacy deepseek settings and no blocks
    const cloudPayload = {
      isAdvancedMode: true,
      selectedProvider: 'deepseek',
      selectedDeepseekModel: 'deepseek-chat',
    }
    // Simulate updateSettingsFromCloud (calls updateSettings(..., { isFullIngress: true }))
    const normalized = normalizeStoredSettings(cloudPayload)
    await updateSettings(normalized, { isFullIngress: true })

    expect(settings.summarize).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      reasoningLevel: 'off',
    })
    expect(settings.chat).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      defaultReasoningLevel: 'provider-default',
      quickModels: [],
    })
  })

  it('updateFeatureSettings preserves other fields in the feature block', async () => {
    // Initialize
    mockStorage.value = {
      summarize: { provider: 'gemini', model: 'gemini-3-flash-preview' },
      chat: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        defaultReasoningLevel: 'provider-default',
        quickModels: [],
      },
    }
    await forceReloadSettings()

    // Update chat quickModels only
    const newQuickModels = [{ provider: 'groq', model: 'groq-model' }]
    await updateFeatureSettings('chat', { quickModels: newQuickModels })

    expect(settings.chat.quickModels).toEqual(newQuickModels)
    expect(settings.chat.provider).toBe('gemini')
    expect(settings.chat.model).toBe('gemini-3-flash-preview')
    expect(settings.chat.defaultReasoningLevel).toBe('provider-default')
  })

  it('preserves the legacy provider when geminiThinkingLevel forces a summarize block', () => {
    // Regression: migrateLegacyGeminiAdvanced synthesises `summarize` to carry the
    // migrated reasoning level. That must not be mistaken for a user-authored block,
    // or the legacy provider/model derivation is skipped and the provider silently
    // resets to Gemini.
    const legacy = {
      isAdvancedMode: true,
      selectedProvider: 'deepseek',
      selectedDeepseekModel: 'deepseek-chat',
      geminiThinkingLevel: 'high',
    }
    const result = normalizeStoredSettings(legacy)
    expect(result.summarize.provider).toBe('deepseek')
    expect(result.summarize.model).toBe('deepseek-v4-flash')
    // and the migrated level survives the derivation
    expect(result.summarize.reasoningLevel).toBe('medium')
  })

  it('migrates every persisted DeepSeek legacy alias to V4 Flash', () => {
    const result = normalizeStoredSettings({
      selectedDeepseekModel: 'deepseek-reasoner',
      summarize: { provider: 'deepseek', model: 'deepseek-chat' },
      chat: {
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        quickModels: [
          { provider: 'deepseek', model: 'deepseek-chat' },
          { provider: 'groq', model: 'deepseek-chat' },
        ],
      },
      tools: {
        deepDive: {
          customProvider: 'deepseek',
          customModel: 'deepseek-reasoner',
        },
      },
    })

    expect(result.selectedDeepseekModel).toBe('deepseek-v4-flash')
    expect(result.summarize.model).toBe('deepseek-v4-flash')
    expect(result.chat.model).toBe('deepseek-v4-flash')
    expect(result.chat.quickModels).toEqual([
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      { provider: 'groq', model: 'deepseek-chat' },
    ])
    expect(result.tools.deepDive.customModel).toBe('deepseek-v4-flash')
  })
})
