import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock browserDetection
vi.mock('@/lib/utils/browserDetection.js', () => ({
  getBrowserCompatibility: () => ({
    supportsAdvancedStreaming: true,
    streamingOptions: { useSmoothing: true },
  }),
}))

// Mock aiSdkAdapter functions
const mockGenerateContent = vi.fn()
const mockGenerateContentStream = vi.fn()
const mockGenerateContentStreamEnhanced = vi.fn()

vi.mock('@/lib/api/aiSdkAdapter.js', () => ({
  generateContent: (...args) => mockGenerateContent(...args),
  generateContentStream: (...args) => mockGenerateContentStream(...args),
  generateContentStreamEnhanced: (...args) => mockGenerateContentStreamEnhanced(...args),
}))

// Mock settingsStore settings using vi.hoisted to prevent hoisting issues
const mockSettings = vi.hoisted(() => ({
  isAdvancedMode: true,
  summarize: {
    provider: 'deepseek',
    model: 'deepseek-chat',
  },
  chat: {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
  },
  deepseekApiKey: 'test-deepseek-key',
  geminiApiKey: 'test-gemini-key',
  selectedProvider: 'deepseek',
}))

vi.mock('@/stores/settingsStore.svelte.js', () => ({
  settings: mockSettings,
  loadSettings: vi.fn().mockResolvedValue(true),
}))

// Import the API modules we want to test
import {
  summarizeContent,
  summarizeContentStream,
  enhancePrompt,
  summarizeChapters,
  summarizeChaptersStream,
  summarizeContentStreamEnhanced,
  providerSupportsStreaming,
} from '@/lib/api/api.js'

describe('Summarize Provider/Model Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings.isAdvancedMode = true
    mockSettings.summarize = {
      provider: 'deepseek',
      model: 'deepseek-chat',
    }
    mockSettings.deepseekApiKey = 'test-deepseek-key'
    mockSettings.geminiApiKey = 'test-gemini-key'
  })

  it('providerSupportsStreaming returns true for groq, cerebras, and lmstudio', () => {
    expect(providerSupportsStreaming('groq')).toBe(true)
    expect(providerSupportsStreaming('cerebras')).toBe(true)
    expect(providerSupportsStreaming('lmstudio')).toBe(true)
  })

  it('summarizeContent resolves from settings.summarize in advanced mode', async () => {
    mockGenerateContent.mockResolvedValue('Summary Result')
    const result = await summarizeContent('content-to-summarize', 'general')

    expect(result).toBe('Summary Result')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    // The first argument to generateContent is the adapter provider id
    expect(mockGenerateContent.mock.calls[0][0]).toBe('deepseek')
    // The second argument has the legacy model field set via resolveAdapterCall
    expect(mockGenerateContent.mock.calls[0][1].selectedDeepseekModel).toBe('deepseek-chat')
  })

  it('summarizeContent forces Gemini Basic in basic mode', async () => {
    mockSettings.isAdvancedMode = false
    mockSettings.selectedGeminiModel = 'gemini-basic-model'
    mockGenerateContent.mockResolvedValue('Basic Result')

    const result = await summarizeContent('content-to-summarize', 'general')

    expect(result).toBe('Basic Result')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent.mock.calls[0][0]).toBe('gemini')
    expect(mockGenerateContent.mock.calls[0][1].selectedGeminiModel).toBe('gemini-basic-model')
    expect(mockGenerateContent.mock.calls[0][1].isAdvancedMode).toBe(false)
  })

  it('summarizeContentStream resolves from settings.summarize in advanced mode', async () => {
    mockGenerateContentStream.mockReturnValue((async function* () { yield 'Chunk 1' })())
    const generator = summarizeContentStream('content-to-summarize', 'general')
    const chunks = []
    for await (const chunk of generator) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Chunk 1'])
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1)
    expect(mockGenerateContentStream.mock.calls[0][0]).toBe('deepseek')
    expect(mockGenerateContentStream.mock.calls[0][1].selectedDeepseekModel).toBe('deepseek-chat')
  })

  it('enhancePrompt resolves from settings.summarize in advanced mode', async () => {
    mockGenerateContent.mockResolvedValue('Enhanced Prompt')
    const result = await enhancePrompt('prompt-to-enhance')

    expect(result).toBe('Enhanced Prompt')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent.mock.calls[0][0]).toBe('deepseek')
    expect(mockGenerateContent.mock.calls[0][1].selectedDeepseekModel).toBe('deepseek-chat')
  })

  it('summarizeChapters resolves from settings.summarize in advanced mode', async () => {
    mockGenerateContent.mockResolvedValue('Chapters Summary')
    const result = await summarizeChapters('timestamped-transcript')

    expect(result).toBe('Chapters Summary')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent.mock.calls[0][0]).toBe('deepseek')
    expect(mockGenerateContent.mock.calls[0][1].selectedDeepseekModel).toBe('deepseek-chat')
  })

  it('summarizeChaptersStream resolves from settings.summarize in advanced mode', async () => {
    mockGenerateContentStream.mockReturnValue((async function* () { yield 'Chunk 1' })())
    const generator = summarizeChaptersStream('timestamped-transcript')
    const chunks = []
    for await (const chunk of generator) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Chunk 1'])
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1)
    expect(mockGenerateContentStream.mock.calls[0][0]).toBe('deepseek')
    expect(mockGenerateContentStream.mock.calls[0][1].selectedDeepseekModel).toBe('deepseek-chat')
  })

  it('summarizeContentStreamEnhanced resolves from settings.summarize in advanced mode', async () => {
    mockGenerateContentStreamEnhanced.mockReturnValue((async function* () { yield { text: 'Chunk 1' } })())
    const generator = summarizeContentStreamEnhanced('content-to-summarize', 'general')
    const chunks = []
    for await (const chunk of generator) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{ text: 'Chunk 1' }])
    expect(mockGenerateContentStreamEnhanced).toHaveBeenCalledTimes(1)
    expect(mockGenerateContentStreamEnhanced.mock.calls[0][0]).toBe('deepseek')
    expect(mockGenerateContentStreamEnhanced.mock.calls[0][1].selectedDeepseekModel).toBe('deepseek-chat')
  })
})
