import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createGoogleGenerativeAI: vi.fn(),
  createOllamaProxyModel: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
  requiresApiProxy: vi.fn(),
  getBrowserCompatibility: vi.fn(),
  shouldEnableAutoFallback: vi.fn(),
  shouldEnableApiKeyRetry: vi.fn(),
  getCurrentGeminiModel: vi.fn(),
  getNextFallbackModel: vi.fn(),
  isOverloadError: vi.fn(),
  updateModelStatus: vi.fn(),
}))

vi.mock('ai', () => ({
  generateText: mocks.generateText,
  streamText: mocks.streamText,
  wrapLanguageModel: vi.fn(({ model }) => model),
  extractReasoningMiddleware: vi.fn(),
}))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mocks.createGoogleGenerativeAI,
}))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn() }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn() }))
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: vi.fn() }))
vi.mock('@openrouter/ai-sdk-provider', () => ({ createOpenRouter: vi.fn() }))
vi.mock('@ai-sdk/groq', () => ({ createGroq: vi.fn() }))
vi.mock('@ai-sdk/cerebras', () => ({ createCerebras: vi.fn() }))
vi.mock('ai-sdk-ollama', () => ({ createOllama: vi.fn() }))
vi.mock('@/lib/api/ollamaProxyModel.js', () => ({
  createOllamaProxyModel: mocks.createOllamaProxyModel,
}))
vi.mock('@/lib/utils/contextDetection.js', () => ({
  requiresApiProxy: mocks.requiresApiProxy,
}))
vi.mock('@/lib/utils/browserDetection.js', () => ({
  getBrowserCompatibility: mocks.getBrowserCompatibility,
}))
vi.mock('@/lib/utils/geminiAutoFallback.js', () => ({
  isOverloadError: mocks.isOverloadError,
  isQuotaError: vi.fn(),
  getNextFallbackModel: mocks.getNextFallbackModel,
  getNextAdvancedFallbackModel: vi.fn(),
  shouldEnableAutoFallback: mocks.shouldEnableAutoFallback,
  shouldEnableApiKeyRetry: mocks.shouldEnableApiKeyRetry,
  getCurrentGeminiModel: mocks.getCurrentGeminiModel,
}))
vi.mock('@/stores/summaryStore.svelte.js', () => ({
  updateModelStatus: mocks.updateModelStatus,
}))
vi.mock('@/lib/utils/toastUtils.js', () => ({ showModelFallbackToast: vi.fn() }))


import {
  generateContent,
  generateContentRequest,
  generateContentStreamEnhancedRequest,
  generateContentStreamRequest,
} from '@/lib/api/aiSdkAdapter.js'

const settings = {
  geminiApiKey: 'test-key',
  selectedGeminiModel: 'gemini-test',
}
const directModel = { modelId: 'gemini-test' }

function textStream(chunks) {
  return (async function* () {
    yield* chunks
  })()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createGoogleGenerativeAI.mockReturnValue(() => directModel)
  mocks.generateText.mockResolvedValue({ text: 'complete response' })
  mocks.streamText.mockImplementation(() =>
    Promise.resolve({ textStream: textStream(['one', 'two']) })
  )
  mocks.requiresApiProxy.mockReturnValue(false)
  mocks.getBrowserCompatibility.mockReturnValue({
    isFirefoxMobile: false,
    streamingOptions: { useSmoothing: false },
  })
  mocks.shouldEnableAutoFallback.mockReturnValue(false)
  mocks.shouldEnableApiKeyRetry.mockReturnValue(false)
  mocks.getCurrentGeminiModel.mockReturnValue('gemini-test')
  mocks.getNextFallbackModel.mockReturnValue(null)
  mocks.isOverloadError.mockReturnValue(false)
})

describe('AI SDK generation requests', () => {
  it('keeps positional prompt requests compatible with the previous AI SDK configuration', async () => {
    await expect(generateContent('gemini', settings, 'System', 'Prompt')).resolves.toBe(
      'complete response'
    )

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: directModel,
        instructions: 'System',
        prompt: 'Prompt',
        maxOutputTokens: 4000,
      })
    )
    expect(mocks.generateText.mock.calls[0][0].messages).toBeUndefined()
  })

  it('preserves message role order and content for direct requests', async () => {
    const messages = [
      { role: 'user', content: 'What is this page about?' },
      { role: 'assistant', content: 'It is about testing.' },
      { role: 'user', content: 'Give a shorter answer.' },
    ]

    await generateContentRequest({
      providerId: 'gemini',
      settings,
      system: 'System',
      messages,
    })

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ messages, instructions: 'System' })
    )
    expect(mocks.generateText.mock.calls[0][0].prompt).toBeUndefined()
  })

  it('rejects mixed prompt and messages input before creating a provider call', async () => {
    await expect(
      generateContentRequest({
        providerId: 'gemini',
        settings,
        prompt: 'legacy input',
        messages: [{ role: 'user', content: 'chat input' }],
      })
    ).rejects.toThrow('exactly one')

    expect(mocks.createGoogleGenerativeAI).not.toHaveBeenCalled()
    expect(mocks.generateText).not.toHaveBeenCalled()
  })

  it('rebuilds the fallback model without losing messages', async () => {
    const messages = [{ role: 'user', content: 'Keep this turn during retry.' }]
    mocks.shouldEnableAutoFallback.mockReturnValue(true)
    mocks.getCurrentGeminiModel.mockReturnValue('gemini-primary')
    mocks.getNextFallbackModel.mockReturnValue('gemini-fallback')
    mocks.isOverloadError.mockReturnValue(true)
    mocks.generateText
      .mockRejectedValueOnce(new Error('overloaded'))
      .mockResolvedValueOnce({ text: 'fallback response' })

    await expect(
      generateContentRequest({ providerId: 'gemini', settings, messages })
    ).resolves.toBe('fallback response')

    expect(mocks.createGoogleGenerativeAI).toHaveBeenCalledTimes(2)
    expect(mocks.generateText.mock.calls).toHaveLength(2)
    expect(mocks.generateText.mock.calls[0][0].messages).toEqual(messages)
    expect(mocks.generateText.mock.calls[1][0].messages).toEqual(messages)
  })

  it('passes abort signals through direct and proxy request paths', async () => {
    const controller = new AbortController()
    await generateContentRequest({
      providerId: 'gemini',
      settings,
      prompt: 'direct request',
      abortSignal: controller.signal,
    })
    expect(mocks.generateText.mock.calls[0][0].abortSignal).toBe(controller.signal)

    const proxyModel = {
      generateText: vi.fn().mockResolvedValue({ text: 'proxy response' }),
    }
    mocks.requiresApiProxy.mockReturnValue(true)
    mocks.createOllamaProxyModel.mockReturnValue(proxyModel)

    await generateContentRequest({
      providerId: 'ollama',
      settings: { selectedOllamaModel: 'local-model' },
      messages: [{ role: 'user', content: 'proxy request' }],
      abortSignal: controller.signal,
    })
    expect(proxyModel.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'proxy request' }],
        abortSignal: controller.signal,
      })
    )
  })

  it('streams direct chunks and enhanced messages with one completion record', async () => {
    await expect(
      Array.fromAsync(
        generateContentStreamRequest({
          providerId: 'gemini',
          settings,
          messages: [{ role: 'user', content: 'stream me' }],
        })
      )
    ).resolves.toEqual(['one', 'two'])

    const enhanced = await Array.fromAsync(
      generateContentStreamEnhancedRequest({
        providerId: 'gemini',
        settings,
        messages: [{ role: 'user', content: 'enhance me' }],
      })
    )
    expect(enhanced).toEqual([
      { chunk: 'one', fullText: 'one', isComplete: false },
      { chunk: 'two', fullText: 'onetwo', isComplete: false },
      { chunk: '', fullText: 'onetwo', isComplete: true, usage: null },
    ])
    expect(mocks.streamText.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'enhance me' },
    ])
  })

  it('uses the one-chunk proxy stream contract', async () => {
    const proxyModel = {
      streamText: vi.fn().mockResolvedValue({ textStream: textStream(['complete proxy text']) }),
    }
    mocks.requiresApiProxy.mockReturnValue(true)
    mocks.createOllamaProxyModel.mockReturnValue(proxyModel)

    const chunks = await Array.fromAsync(
      generateContentStreamRequest({
        providerId: 'ollama',
        settings: { selectedOllamaModel: 'local-model' },
        messages: [{ role: 'user', content: 'stream through proxy' }],
      })
    )

    expect(chunks).toEqual(['complete proxy text'])
    expect(proxyModel.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'stream through proxy' }],
      })
    )
  })

  it('annotates Firefox mobile flush errors from enhanced streams', async () => {
    const flushError = new Error('flush failed')
    mocks.getBrowserCompatibility.mockReturnValue({
      isFirefoxMobile: true,
      streamingOptions: { useSmoothing: false },
    })
    mocks.streamText.mockRejectedValue(flushError)

    await expect(
      Array.fromAsync(
        generateContentStreamEnhancedRequest({
          providerId: 'gemini',
          settings,
          messages: [{ role: 'user', content: 'trigger flush error' }],
        })
      )
    ).rejects.toMatchObject({ isFirefoxMobileStreamingError: true })
  })

  it('forwards explicit reasoning to generateText', async () => {
    await generateContentRequest({
      providerId: 'gemini',
      settings,
      prompt: 'chat with reasoning',
      reasoning: 'medium',
    })

    const call = mocks.generateText.mock.calls[0][0]
    expect(call.reasoning).toBe('medium')
  })

  it('forwards explicit reasoning through streaming path', async () => {
    await Array.fromAsync(
      generateContentStreamRequest({
        providerId: 'gemini',
        settings,
        messages: [{ role: 'user', content: 'stream with reasoning' }],
        reasoning: 'high',
      })
    )

    const call = mocks.streamText.mock.calls[0][0]
    expect(call.reasoning).toBe('high')
  })

  it('surfaces reasoning-coercion warnings in the enhanced stream completion event', async () => {
    mocks.streamText.mockImplementation(() =>
      Promise.resolve({
        textStream: textStream(['response text']),
        usage: Promise.resolve({ promptTokens: 10, completionTokens: 20 }),
        warnings: Promise.resolve([
          {
            type: 'unsupported-setting',
            setting: 'reasoning',
            message: 'High reasoning is not supported by this model; the provider used Medium.',
          },
        ]),
      })
    )

    const events = await Array.fromAsync(
      generateContentStreamEnhancedRequest({
        providerId: 'gemini',
        settings,
        messages: [{ role: 'user', content: 'test warnings' }],
        reasoning: 'high',
      })
    )

    const completion = events.find((e) => e.isComplete)
    expect(completion).toBeDefined()
    expect(completion.reasoningWarnings).toBeDefined()
    expect(completion.reasoningWarnings).toHaveLength(1)
    expect(completion.reasoningWarnings[0]).toContain('High reasoning is not supported')
  })

  it('does not include non-reasoning warnings in reasoningWarnings', async () => {
    mocks.streamText.mockImplementation(() =>
      Promise.resolve({
        textStream: textStream(['response']),
        usage: Promise.resolve({ promptTokens: 5, completionTokens: 10 }),
        warnings: Promise.resolve([
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            message: 'Temperature is not supported.',
          },
        ]),
      })
    )

    const events = await Array.fromAsync(
      generateContentStreamEnhancedRequest({
        providerId: 'gemini',
        settings,
        messages: [{ role: 'user', content: 'test non-reasoning warning' }],
      })
    )

    const completion = events.find((e) => e.isComplete)
    expect(completion).toBeDefined()
    expect(completion.reasoningWarnings).toBeUndefined()
  })
})
