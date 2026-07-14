import { registerModelCapability } from '@/lib/chat/providerCapabilities.js'

export const PROVIDER_CONFIG = {
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    requiresApiKey: true,
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/models',
    publicUrl: 'https://api.cerebras.ai/public/v1/models',
    requiresApiKey: false,
  },
  deepseek: {
    url: 'https://api.deepseek.com/models',
    requiresApiKey: true,
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    requiresApiKey: true,
    usesApiKeyQueryParam: true,
    capabilityProviderId: 'gemini',
  },
}

export const FALLBACK_PROVIDER_MODELS = {
  groq: [
    'groq/compound',
    'groq/compound-mini',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'qwen/qwen3-32b',
  ],
  cerebras: ['gpt-oss-120b', 'zai-glm-4.7'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  gemini: [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  chatgpt: [
    'gpt-5-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'o1',
    'o1-mini',
    'o3-mini',
  ],
  openrouter: [
    'deepseek/deepseek-r1-0528:free',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'anthropic/claude-3.5-sonnet',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat',
  ],
}

function isGroqChatModel(model) {
  const id = model.id?.toLowerCase() || ''

  return (
    model.active !== false &&
    !id.includes('whisper') &&
    !id.includes('tts') &&
    !id.includes('guard') &&
    !id.includes('moderation')
  )
}

/**
 * Capture per-model context length from a provider's `/models` response and
 * feed it into the shared capability registry. Providers expose it under
 * different keys: Groq → `context_window`, OpenRouter → `context_length`,
 * Gemini → `inputTokenLimit`.
 * Silently ignores models that don't carry it.
 *
 * @param {string} providerId
 * @param {{data?: Array<object>, models?: Array<object>}} body
 */
function registerCapabilitiesFromBody(providerId, body) {
  const models = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : []

  for (const model of models) {
    const id = typeof model?.id === 'string'
      ? model.id.trim()
      : typeof model?.baseModelId === 'string'
        ? model.baseModelId.trim()
        : ''
    if (!id) continue
    const contextWindowTokens = Number(
      model.context_window ?? model.context_length ?? model.inputTokenLimit,
    )
    if (!Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) continue
    registerModelCapability(providerId, id, { contextWindowTokens })
  }
}

function normalizeModels(providerId, body) {
  if (providerId === 'gemini') {
    if (!Array.isArray(body?.models)) {
      throw new Error("Invalid API response: missing 'models' array")
    }

    return body.models
      .filter((model) =>
        model?.supportedGenerationMethods?.includes('generateContent'),
      )
      .map(
        (model) =>
          model.baseModelId?.trim() || model.name?.replace(/^models\//, '').trim(),
      )
      .filter(Boolean)
      .filter((id, index, models) => models.indexOf(id) === index)
      .sort((a, b) => a.localeCompare(b))
  }

  if (!Array.isArray(body?.data)) {
    throw new Error("Invalid API response: missing 'data' array")
  }

  return body.data
    .filter((model) => providerId !== 'groq' || isGroqChatModel(model))
    .filter((model) => typeof model?.id === 'string' && model.id.trim())
    .map((model) => model.id.trim())
    .filter((id, index, models) => models.indexOf(id) === index)
    .sort((a, b) => a.localeCompare(b))
}

async function requestModels(url, apiKey, fetchFn) {
  const response = await fetchFn(url, {
    method: 'GET',
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  })

  if (!response.ok) {
    throw new Error(`Could not load models (HTTP ${response.status})`)
  }

  return response.json()
}

async function requestPaginatedModels(config, apiKey, fetchFn) {
  let nextPageToken = ''
  let models = []

  do {
    const params = new URLSearchParams({ key: apiKey, pageSize: '1000' })
    if (nextPageToken) params.set('pageToken', nextPageToken)

    const response = await fetchFn(`${config.url}?${params}`, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`Could not load models (HTTP ${response.status})`)
    }

    const body = await response.json()
    if (!Array.isArray(body?.models)) {
      throw new Error("Invalid API response: missing 'models' array")
    }

    models = [...models, ...body.models]
    nextPageToken = body.nextPageToken || ''
  } while (nextPageToken)

  return { models }
}

export async function fetchProviderModels(
  providerId,
  apiKey,
  fetchFn = fetch,
) {
  const config = PROVIDER_CONFIG[providerId]
  if (!config) throw new Error(`Unsupported model provider: ${providerId}`)

  const cleanApiKey = apiKey?.trim() || ''
  if (config.requiresApiKey && !cleanApiKey) {
    return FALLBACK_PROVIDER_MODELS[providerId]
  }

  try {
    const body = config.usesApiKeyQueryParam
      ? await requestPaginatedModels(config, cleanApiKey, fetchFn)
      : await requestModels(config.url, cleanApiKey, fetchFn)
    registerCapabilitiesFromBody(config.capabilityProviderId || providerId, body)
    const models = normalizeModels(providerId, body)
    return models.length ? models : FALLBACK_PROVIDER_MODELS[providerId]
  } catch (error) {
    if (!config.publicUrl) throw error

    const body = await requestModels(config.publicUrl, '', fetchFn)
    registerCapabilitiesFromBody(config.capabilityProviderId || providerId, body)
    const models = normalizeModels(providerId, body)
    return models.length ? models : FALLBACK_PROVIDER_MODELS[providerId]
  }
}
