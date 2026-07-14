import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock getAISDKModel
const mockGetAISDKModel = vi.fn()
vi.mock('@/lib/api/aiSdkAdapter.js', () => ({
  getAISDKModel: (...args) => mockGetAISDKModel(...args),
}))

// Mock settingsStore settings using vi.hoisted
const mockSettings = vi.hoisted(() => ({
  geminiApiKey: 'test-gemini-key',
  tools: {
    deepDive: {
      enabled: true,
      useGeminiBasic: false,
      customProvider: 'openai-compatible-profile-1',
      customModel: 'model-1-overridden',
    }
  },
  openaiCompatibleProfiles: [
    {
      id: 'openai-compatible-profile-1',
      name: 'Profile 1',
      baseUrl: 'https://api.profile-1.com/v1',
      apiKey: 'key-1',
      defaultModel: 'model-1',
    }
  ]
}))

vi.mock('@/stores/settingsStore.svelte.js', () => ({
  settings: mockSettings,
}))

import {
  resolveToolProvider,
  getToolAIModel,
  buildModelSettings,
  hasValidToolProvider,
} from '@/services/tools/toolProviderService.js'

describe('toolProviderService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings.geminiApiKey = 'test-gemini-key'
    mockSettings.tools = {
      deepDive: {
        enabled: true,
        useGeminiBasic: false,
        customProvider: 'openai-compatible-profile-1',
        customModel: 'model-1-overridden',
      }
    }
    mockSettings.openaiCompatibleProfiles = [
      {
        id: 'openai-compatible-profile-1',
        name: 'Profile 1',
        baseUrl: 'https://api.profile-1.com/v1',
        apiKey: 'key-1',
        defaultModel: 'model-1',
      }
    ]
  })

  it('resolves tool provider using dynamic profile successfully', () => {
    const resolved = resolveToolProvider('deepDive')
    expect(resolved).toEqual({
      provider: 'openai-compatible-profile-1',
      model: 'model-1-overridden',
    })
  })

  it('correctly builds model settings for dynamic profiles', () => {
    const providerConfig = {
      provider: 'openai-compatible-profile-1',
      model: 'model-1-overridden',
      isAdvancedMode: false,
    }
    const modelSettings = buildModelSettings(providerConfig, mockSettings)
    expect(modelSettings.selectedProvider).toBe('openai-compatible-profile-1')
  })

  it('resolves dynamic profiles to static adapter in getToolAIModel', () => {
    mockGetAISDKModel.mockReturnValue({ mockModel: true })
    const model = getToolAIModel('deepDive')
    
    expect(mockGetAISDKModel).toHaveBeenCalledTimes(1)
    // The first argument should be the static adapter ID
    expect(mockGetAISDKModel.mock.calls[0][0]).toBe('openaiCompatible')
    // The second argument should contain the overlaid profile settings
    const configSettings = mockGetAISDKModel.mock.calls[0][1]
    expect(configSettings.openaiCompatibleApiKey).toBe('key-1')
    expect(configSettings.openaiCompatibleBaseUrl).toBe('https://api.profile-1.com/v1')
    expect(configSettings.selectedOpenAICompatibleModel).toBe('model-1-overridden')
  })

  it('falls back to Gemini or configured summary provider when custom provider lacks key', () => {
    // Make profile-1 key empty
    mockSettings.openaiCompatibleProfiles[0].apiKey = ''
    mockSettings.summarize = {
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
    }

    const resolved = resolveToolProvider('deepDive')
    expect(resolved).toEqual({
      provider: 'gemini',
      model: 'gemini-3-flash-preview',
      isAdvancedMode: false,
    })
  })
})
