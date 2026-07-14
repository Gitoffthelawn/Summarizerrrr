import { describe, it, expect } from 'vitest'
import { VALID_SETTING_KEYS } from '@/lib/config/settingsSchema.js'
import { PROVIDER_CONFIG } from '@/lib/api/providerModelService.js'
import {
  PROVIDER_LIST,
  getProvider,
  normalizeProviderId,
  getApiKey,
  isProviderConfigured,
  listConfiguredProviders,
  getLegacyModel,
  getDefaultModel,
  getModelSource,
  resolveAdapterCall,
} from '@/lib/providers/providerRegistry.js'
import { resolveFeatureModel } from '@/lib/providers/featureModelResolver.js'

describe('Provider Registry', () => {
  it('every entry has fields that exist in VALID_SETTING_KEYS', () => {
    for (const entry of PROVIDER_LIST) {
      if (entry.apiKeyField) {
        expect(VALID_SETTING_KEYS).toContain(entry.apiKeyField)
      }
      if (entry.additionalKeysField) {
        expect(VALID_SETTING_KEYS).toContain(entry.additionalKeysField)
      }
      if (entry.baseUrlField) {
        expect(VALID_SETTING_KEYS).toContain(entry.baseUrlField)
      }
      if (entry.endpointField) {
        expect(VALID_SETTING_KEYS).toContain(entry.endpointField)
      }
      if (entry.legacyModelField) {
        expect(VALID_SETTING_KEYS).toContain(entry.legacyModelField)
      }
    }
  })

  it('every entry has a valid modelSource, and discoveryId exists in PROVIDER_CONFIG when discovery', () => {
    const validModelSources = ['discovery', 'static', 'freeText']
    for (const entry of PROVIDER_LIST) {
      expect(validModelSources).toContain(entry.modelSource)
      if (entry.modelSource === 'discovery') {
        expect(entry.discoveryId).toBeDefined()
        expect(PROVIDER_CONFIG[entry.discoveryId]).toBeDefined()
      } else {
        expect(entry.discoveryId).toBeNull()
      }
    }
  })

  it('resolveAdapterCall returns correct adapter ID and overlay settings', () => {
    const settings = {
      isAdvancedMode: false,
      selectedGeminiModel: 'some-model',
    }
    const result = resolveAdapterCall('gemini', 'my-gemini-model', settings)
    expect(result.providerId).toBe('gemini')
    expect(result.settings.selectedGeminiModel).toBe('my-gemini-model')
  })

  it('normalizeProviderId maps legacy openai to chatgpt, geminiAdvanced to gemini, and unknown to gemini', () => {
    expect(normalizeProviderId('openai')).toBe('chatgpt')
    expect(normalizeProviderId('geminiAdvanced')).toBe('gemini')
    expect(normalizeProviderId('gemini')).toBe('gemini')
    expect(normalizeProviderId('groq')).toBe('groq')
    expect(normalizeProviderId('invalid')).toBe('gemini')
    expect(normalizeProviderId(null)).toBe('gemini')
  })
})

describe('Feature Model Resolver', () => {
  it('forces Gemini Basic in basic mode', () => {
    const settings = {
      isAdvancedMode: false,
      selectedGeminiModel: 'basic-model',
    }
    const result = resolveFeatureModel('summarize', settings)
    expect(result.providerId).toBe('gemini')
    expect(result.modelId).toBe('basic-model')
    expect(result.adapterProviderId).toBe('gemini')
    expect(result.settingsOverlay).toEqual({})
  })

  it('falls back to legacy derivation if summarize block is missing', () => {
    const settings = {
      isAdvancedMode: true,
      selectedProvider: 'groq',
      selectedGroqModel: 'groq-model',
      groqApiKey: 'some-key',
    }
    const result = resolveFeatureModel('summarize', settings)
    expect(result.providerId).toBe('groq')
    expect(result.modelId).toBe('groq-model')
  })

  it('uses summarize/chat block if present and configured', () => {
    const settings = {
      isAdvancedMode: true,
      summarize: {
        provider: 'deepseek',
        model: 'deepseek-chat',
      },
      deepseekApiKey: 'ds-key',
    }
    const result = resolveFeatureModel('summarize', settings)
    expect(result.providerId).toBe('deepseek')
    expect(result.modelId).toBe('deepseek-chat')
  })

  it('falls back to Gemini Basic if chosen provider is not configured but gemini has a key', () => {
    const settings = {
      isAdvancedMode: true,
      summarize: {
        provider: 'deepseek',
        model: 'deepseek-chat',
      },
      deepseekApiKey: '', // unconfigured
      geminiApiKey: 'gemini-key',
      selectedGeminiModel: 'gemini-basic-model',
    }
    const result = resolveFeatureModel('summarize', settings)
    expect(result.providerId).toBe('gemini')
    expect(result.modelId).toBe('gemini-basic-model')
  })
})
