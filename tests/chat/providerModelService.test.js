import { describe, expect, it, vi } from 'vitest'
import {
  FALLBACK_PROVIDER_MODELS,
  fetchProviderModels,
} from '../../src/lib/api/providerModelService.js'
import {
  getProviderCapabilities,
  clearDiscoveredCapabilities,
} from '../../src/lib/chat/providerCapabilities.js'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('provider model discovery', () => {
  it('uses static Groq models until an API key is available', async () => {
    const fetchFn = vi.fn()

    await expect(fetchProviderModels('groq', '', fetchFn)).resolves.toEqual(
      FALLBACK_PROVIDER_MODELS.groq,
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('loads and filters Groq chat models', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'whisper-large-v3', active: true },
          { id: 'llama-3.3-70b-versatile', active: true },
          { id: 'meta-llama/llama-guard-4-12b', active: true },
          { id: 'disabled-model', active: false },
          { id: 'openai/gpt-oss-120b', active: true },
        ],
      }),
    )

    await expect(fetchProviderModels('groq', 'secret', fetchFn)).resolves.toEqual([
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
    ])
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
      }),
    )
  })

  it('loads DeepSeek models dynamically when an API key is available', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'deepseek-reasoner' },
          { id: 'deepseek-chat' },
          { id: 'deepseek-chat' },
        ],
      }),
    )

    await expect(fetchProviderModels('deepseek', 'secret', fetchFn)).resolves.toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
    ])
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.deepseek.com/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
      }),
    )
  })

  it('uses fallback DeepSeek models until an API key is available', async () => {
    const fetchFn = vi.fn()

    await expect(fetchProviderModels('deepseek', '', fetchFn)).resolves.toEqual(
      FALLBACK_PROVIDER_MODELS.deepseek,
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('loads every page of generative Gemini models dynamically', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              name: 'models/gemini-2.5-pro-001',
              baseModelId: 'gemini-2.5-pro',
              inputTokenLimit: 1_000_000,
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/text-embedding-004',
              supportedGenerationMethods: ['embedContent'],
            },
          ],
          nextPageToken: 'next page',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          models: [
            {
              name: 'models/gemini-2.5-flash',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-2.5-pro-002',
              baseModelId: 'gemini-2.5-pro',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      )

    await expect(
      fetchProviderModels('geminiAdvanced', 'secret', fetchFn),
    ).resolves.toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://generativelanguage.googleapis.com/v1beta/models?key=secret&pageSize=1000',
      { method: 'GET' },
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://generativelanguage.googleapis.com/v1beta/models?key=secret&pageSize=1000&pageToken=next+page',
      { method: 'GET' },
    )
    expect(getProviderCapabilities('gemini', 'gemini-2.5-pro')).toMatchObject({
      contextWindowTokens: 1_000_000,
      source: 'discovered',
    })
    clearDiscoveredCapabilities()
  })

  it('uses fallback Gemini models until an API key is available', async () => {
    const fetchFn = vi.fn()

    expect(FALLBACK_PROVIDER_MODELS.geminiAdvanced).toEqual([
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ])
    await expect(fetchProviderModels('geminiAdvanced', '', fetchFn)).resolves.toEqual(
      FALLBACK_PROVIDER_MODELS.geminiAdvanced,
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('registers each Groq model\'s context_window into the capability registry', async () => {
    clearDiscoveredCapabilities()
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'llama-3.3-70b-versatile', active: true, context_window: 131072 },
          { id: 'openai/gpt-oss-120b', active: true, context_window: 131072 },
          { id: 'legacy-model', active: true, context_window: 8192 },
        ],
      }),
    )

    await fetchProviderModels('groq', 'secret', fetchFn)

    expect(getProviderCapabilities('groq', 'llama-3.3-70b-versatile')).toMatchObject({
      contextWindowTokens: 131072,
      source: 'discovered',
    })
    // Discovered small windows guard against over-estimating the 128K default.
    expect(getProviderCapabilities('groq', 'legacy-model').contextWindowTokens).toBe(8192)
    clearDiscoveredCapabilities()
  })

  it('falls back to the public Cerebras catalog when authenticated loading fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: 'zai-glm-4.7' }, { id: 'gpt-oss-120b' }] }),
      )

    await expect(
      fetchProviderModels('cerebras', 'expired-key', fetchFn),
    ).resolves.toEqual(['gpt-oss-120b', 'zai-glm-4.7'])
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://api.cerebras.ai/public/v1/models',
      expect.objectContaining({ headers: undefined }),
    )
  })
})
