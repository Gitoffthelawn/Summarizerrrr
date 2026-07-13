import { registerModelCapability } from '@/lib/chat/providerCapabilities.js'

const PROVIDER_CONFIG = {
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    requiresApiKey: true,
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/models',
    publicUrl: 'https://api.cerebras.ai/public/v1/models',
    requiresApiKey: false,
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
 * different keys: Groq → `context_window`, OpenRouter → `context_length`.
 * Silently ignores models that don't carry it.
 *
 * @param {string} providerId
 * @param {{data?: Array<object>}} body
 */
function registerCapabilitiesFromBody(providerId, body) {
  if (!Array.isArray(body?.data)) return
  for (const model of body.data) {
    const id = typeof model?.id === 'string' ? model.id.trim() : ''
    if (!id) continue
    const contextWindowTokens = Number(model.context_window ?? model.context_length)
    if (!Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) continue
    registerModelCapability(providerId, id, { contextWindowTokens })
  }
}

function normalizeModels(providerId, body) {
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
    const body = await requestModels(config.url, cleanApiKey, fetchFn)
    registerCapabilitiesFromBody(providerId, body)
    const models = normalizeModels(providerId, body)
    return models.length ? models : FALLBACK_PROVIDER_MODELS[providerId]
  } catch (error) {
    if (!config.publicUrl) throw error

    const body = await requestModels(config.publicUrl, '', fetchFn)
    registerCapabilitiesFromBody(providerId, body)
    const models = normalizeModels(providerId, body)
    return models.length ? models : FALLBACK_PROVIDER_MODELS[providerId]
  }
}

