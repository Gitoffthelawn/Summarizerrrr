/**
 * Token pricing, kept as a config table keyed by model id so adding a model is a
 * data edit and never a code edit.
 *
 * Rates are **USD per 1M tokens**, matching how providers publish them.
 *
 * `cachedInput` is the discounted rate for the part of a turn's input that was
 * served from cache — typically 0.1–0.25x the full input rate. It is a rate for a
 * *slice of* input, not a separate token stream (see the cache-is-inside-input
 * note in `usageMetrics.js`).
 *
 * The table is intentionally near-empty: inventing rates would produce
 * confident-looking wrong bills. A model with no entry reports `null` and the UI
 * shows no cost, while a `:free` model resolves to zero rates through the exact
 * same path — so switching to a paid model is only ever "plug the numbers in".
 */

/** @typedef {{input: number, cachedInput: number, output: number}} ModelRates */

const FREE_RATES = { input: 0, cachedInput: 0, output: 0 }

/**
 * USD per 1M tokens, by exact model id.
 * @type {Record<string, ModelRates>}
 */
export const MODEL_PRICING = {
  // Add paid models here, e.g.:
  // 'openai/gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
}

/**
 * Rates for a model, or null when unknown.
 *
 * Any id ending in `:free` is zero-rated by rule rather than by table entry —
 * OpenRouter mints these per model and listing them all would go stale.
 *
 * @param {string|null|undefined} modelId
 * @returns {ModelRates|null}
 */
export function getModelRates(modelId) {
  if (typeof modelId !== 'string' || !modelId) return null
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId]
  if (modelId.endsWith(':free')) return FREE_RATES
  return null
}

/**
 * Cost of a session's cumulative usage, in USD, or null when the model has no
 * known rates.
 *
 * Takes the price-tier split from `sessionCumulative` — `uncached` and `cached`
 * are the two halves of input, so charging both does not double count.
 *
 * @param {{uncached: number, cached: number, output: number}} totals
 * @param {string|null|undefined} modelId
 * @returns {number|null}
 */
export function estimateCost(totals, modelId) {
  const rates = getModelRates(modelId)
  if (!rates || !totals) return null
  const perToken = (tokens, rate) => ((tokens || 0) / 1_000_000) * rate
  return (
    perToken(totals.uncached, rates.input) +
    perToken(totals.cached, rates.cachedInput) +
    perToken(totals.output, rates.output)
  )
}
