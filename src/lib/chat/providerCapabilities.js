/**
 * Model context budgets are intentionally kept separate from prompt assembly.
 * Entries below only cover models the current repository explicitly offers;
 * custom and unknown models use the conservative fallback.
 */
export const CONSERVATIVE_CONTEXT_WINDOW_TOKENS = 16_384
export const DEFAULT_OUTPUT_TOKENS = 4_000

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
]

/**
 * Resolve model limits without coupling the pipeline to a provider SDK.
 * @param {string} providerId
 * @param {string | null | undefined} modelId
 */
export function getProviderCapabilities(providerId, modelId) {
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

  return {
    providerId,
    modelId: modelId || null,
    contextWindowTokens: CONSERVATIVE_CONTEXT_WINDOW_TOKENS,
    defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
    source: 'conservative-fallback',
  }
}
