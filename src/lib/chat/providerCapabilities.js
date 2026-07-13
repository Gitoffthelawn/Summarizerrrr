/**
 * Model context budgets are intentionally kept separate from prompt assembly.
 * Resolution order (see {@link getProviderCapabilities}):
 *   1. Runtime registry — real limits discovered from a provider's models API.
 *   2. Static table below — providers whose API does NOT expose context length
 *      (OpenAI, DeepSeek, Anthropic) or well-known families.
 *   3. OpenRouter catalog cross-reference — vendor-scoped, fail-safe lookup
 *      from the OpenRouter /models catalog (cloud providers only).
 *   4. Default fallback — most modern chat models are ≥128K, so an unknown
 *      model is assumed to be 128K rather than the old ultra-conservative 16K.
 */
import { lookupCatalogWindow } from './openrouterCatalog.js'
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000
export const DEFAULT_OUTPUT_TOKENS = 4_000

/**
 * Runtime map of `${providerId}:${modelId}` → `{ contextWindowTokens,
 * defaultOutputTokens }`, populated by model discovery when the provider's API
 * carries context length (e.g. Groq `context_window`, OpenRouter
 * `context_length`). Empty until discovery runs; entries are exact, so they take
 * precedence over the static table and the fallback.
 * @type {Map<string, {contextWindowTokens: number, defaultOutputTokens?: number}>}
 */
const discoveredCapabilities = new Map()

/**
 * Record a model's real limits, discovered from a provider's models endpoint.
 * @param {string} providerId
 * @param {string} modelId
 * @param {{contextWindowTokens?: number, defaultOutputTokens?: number}} caps
 */
export function registerModelCapability(providerId, modelId, caps = {}) {
  if (!providerId || !modelId) return
  const contextWindowTokens = Number(caps.contextWindowTokens)
  if (!Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) return
  discoveredCapabilities.set(`${providerId}:${modelId}`, {
    contextWindowTokens,
    ...(Number.isFinite(Number(caps.defaultOutputTokens))
      ? { defaultOutputTokens: Number(caps.defaultOutputTokens) }
      : {}),
  })
}

/** Test/reset hook: forget all discovered capabilities. */
export function clearDiscoveredCapabilities() {
  discoveredCapabilities.clear()
}

/**
 * OpenRouter catalog cross-reference — a plain object keyed
 * `"<vendor>:<normalizedSlug>"` → `contextWindowTokens`, or `null` when not
 * hydrated yet.  Set by Phase 3's hydration / fetch helpers.
 * @type {Record<string, number> | null}
 */
let openrouterCatalog = null

/**
 * Store the OpenRouter catalog so the resolver can use it as layer 3.
 * @param {Record<string, number>} catalogObject
 */
export function setOpenrouterCatalog(catalogObject) {
  if (catalogObject && typeof catalogObject === 'object') {
    openrouterCatalog = catalogObject
  }
}

/** Test/reset hook: clear the OpenRouter catalog. */
export function clearOpenrouterCatalog() {
  openrouterCatalog = null
}

const KNOWN_MODEL_CAPABILITIES = [
  {
    providerId: 'gemini',
    modelPattern: /^gemini-(2\.5|3|3\.1)-/,
    contextWindowTokens: 1_000_000,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
  },
  {
    providerId: 'gemini',
    modelPattern: /^gemma-4-/,
    contextWindowTokens: 128_000,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
  },
  {
    providerId: 'openai',
    modelPattern: /^gpt-5|^o[134]/,
    contextWindowTokens: 128_000,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
  },
  {
    providerId: 'chatgpt',
    modelPattern: /^gpt-5|^o[134]/,
    contextWindowTokens: 128_000,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
  },
  {
    // deepseek-chat / deepseek-reasoner serve a 64K context window (default
    // output 4K, max 8K). Without this entry they fall back to the conservative
    // 16K window and grounding sources get dropped prematurely.
    providerId: 'deepseek',
    modelPattern: /^deepseek-/,
    contextWindowTokens: 64_000,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
  },
]

/**
 * Resolve model limits without coupling the pipeline to a provider SDK.
 * @param {string} providerId
 * @param {string | null | undefined} modelId
 */
export function getProviderCapabilities(providerId, modelId) {
  // 1. Exact limits discovered from the provider's models API win.
  const discovered = typeof modelId === 'string' ? discoveredCapabilities.get(`${providerId}:${modelId}`) : null
  if (discovered) {
    return {
      providerId,
      modelId,
      contextWindowTokens: discovered.contextWindowTokens,
      defaultOutputTokens: discovered.defaultOutputTokens ?? DEFAULT_OUTPUT_TOKENS,
      source: 'discovered',
    }
  }

  // 2. Static table for providers whose API omits context length.
  const knownCapability = KNOWN_MODEL_CAPABILITIES.find(
    (capability) =>
      capability.providerId === providerId &&
      typeof modelId === 'string' &&
      capability.modelPattern.test(modelId)
  )

  if (knownCapability) {
    return {
      providerId,
      modelId,
      contextWindowTokens: knownCapability.contextWindowTokens,
      defaultOutputTokens: knownCapability.defaultOutputTokens,
      source: 'known-model',
    }
  }

  // 3. OpenRouter catalog cross-reference (cloud providers only, fail-safe).
  if (openrouterCatalog && typeof modelId === 'string') {
    const catalogWindow = lookupCatalogWindow(openrouterCatalog, providerId, modelId)
    if (catalogWindow) {
      return {
        providerId,
        modelId,
        contextWindowTokens: catalogWindow,
        defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
        source: 'openrouter-catalog',
      }
    }
  }

  // 4. Modern default (most current chat models are ≥128K).
  return {
    providerId,
    modelId: modelId || null,
    contextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
    source: 'default-fallback',
  }
}
