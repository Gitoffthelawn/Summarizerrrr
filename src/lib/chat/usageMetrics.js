/**
 * Token accounting for chat. Two metrics that look alike and mean opposite
 * things, so they are derived by separate functions and displayed under separate
 * headings:
 *
 * - **Context snapshot** ({@link contextSnapshot}) — how full the window is.
 *   Taken from the LAST turn only. A turn's `input` is the whole conversation
 *   re-sent, so it already contains every earlier message; summing turns would
 *   count the same text once per turn and produce a figure larger than the
 *   window it claims to measure.
 * - **Session cumulative** ({@link sessionCumulative}) — what was actually spent.
 *   Here summing IS correct: every turn re-sent the history and was billed for
 *   it again. Real money.
 *
 * ## Provider convention: cache is INSIDE input
 *
 * For OpenRouter (and OpenAI-style usage generally) `input` already includes the
 * cache-read tokens; `cache` is a *subset* of it, flagging which part was billed
 * at the discounted rate. This differs from Anthropic's native API, where
 * `input_tokens` excludes the cache fields.
 *
 * Verified against real turns on inclusionai/ling-3.0-flash:
 *   turn 1  input 16,132  output 2,701
 *   turn 2  input 19,144  output 2,129  cache 16,384
 *   window shows 21.3K  →  19,144 + 2,129 = 21,273 ✓
 *   (adding cache would give ~37.6K, which is wrong)
 *
 * So: NEVER write `input + cache`. That is double counting. The only place cache
 * is added to anything is when splitting one turn's input by price tier —
 * `uncached = input - cache` and `cached = cache`, which sum back to `input`.
 *
 * Persisted `message.usage` records carry both AI SDK v4
 * (`promptTokens`/`completionTokens`) and v5 (`inputTokens`/`outputTokens`) key
 * styles — `normalizeUsage` in `lib/api/aiSdkAdapter.js` writes both.
 */

/**
 * One API request. Raw provider numbers only — nothing pre-aggregated, so both
 * metrics stay derivable and a bug in one can't corrupt the other.
 * @typedef {{ts: number|null, model: string|null, input: number, output: number, cache: number}} Turn
 */

function positive(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Collapse a provider usage record to canonical field names, tolerating either
 * SDK key style. Returns null when the record carries no usable figure.
 * @param {object|null|undefined} usage
 * @returns {{input: number|null, output: number|null, cached: number|null}|null}
 */
export function normalizeMessageUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const input = positive(usage.promptTokens ?? usage.inputTokens)
  const output = positive(usage.completionTokens ?? usage.outputTokens)
  const cached = positive(usage.cachedInputTokens)
  if (input == null && output == null) return null
  return { input, output, cached }
}

/**
 * Persisted messages → one {@link Turn} per API request that reported usage.
 *
 * Pass every message in the conversation (`listMessagesByConversation`, which
 * orders by `sequence`), not just the active path: an abandoned regeneration was
 * still a request that was still billed.
 *
 * @param {Array<{usage?: object|null, createdAt?: string, modelId?: string|null}>|null|undefined} messages
 * @returns {Turn[]}
 */
export function toTurns(messages) {
  const turns = []
  for (const message of messages || []) {
    const usage = normalizeMessageUsage(message?.usage)
    if (!usage) continue
    const ts = message.createdAt ? Date.parse(message.createdAt) : NaN
    turns.push({
      ts: Number.isNaN(ts) ? null : ts,
      model: message.modelId ?? null,
      input: usage.input || 0,
      output: usage.output || 0,
      cache: usage.cached || 0,
    })
  }
  return turns
}

/**
 * The newest turn, or null. Walks from the end so an aborted or errored tail
 * message without usage falls through to the last turn that has real numbers.
 * @param {Turn[]|null|undefined} turns
 * @returns {Turn|null}
 */
export function lastTurn(turns) {
  const list = turns || []
  return list.length ? list[list.length - 1] : null
}

/**
 * Context occupancy — a snapshot of the last turn, never a sum.
 *
 * `cacheHitRate` is measured against that turn's input because cache is a subset
 * of input (see the module note): the share of the prompt that was served from
 * cache.
 *
 * @param {Turn|null|undefined} turn
 * @param {number|null|undefined} contextLimit model's context window in tokens
 * @returns {{ctx: number, ctxPercent: number|null, cacheHitRate: number|null}}
 */
export function contextSnapshot(turn, contextLimit) {
  if (!turn) return { ctx: 0, ctxPercent: null, cacheHitRate: null }
  const ctx = turn.input + turn.output
  const limit = positive(contextLimit)
  return {
    ctx,
    ctxPercent: limit ? ctx / limit : null,
    cacheHitRate: cacheShare(turn.cache, turn.input),
  }
}

/**
 * Cache as a fraction of the input it is part of — the only correct denominator,
 * since cache is a slice of input rather than a sibling of it. Null when there is
 * no input to take a share of.
 *
 * One function for both the per-turn and the session rate so the denominator can
 * never drift apart between them.
 *
 * @param {number|null|undefined} cached
 * @param {number|null|undefined} input
 * @returns {number|null}
 */
export function cacheShare(cached, input) {
  const total = positive(input)
  if (!total) return null
  return Math.min(cached || 0, total) / total
}

/**
 * Session spend — summed across every turn.
 *
 * Input is split by price tier rather than reported as one number, because the
 * two halves cost different amounts: `uncached` bills at the full rate, `cached`
 * at the provider's discount (~0.1–0.25x). They sum back to `input`, so nothing
 * is double counted.
 *
 * @param {Turn[]|null|undefined} turns
 * @returns {{requests: number, input: number, uncached: number, cached: number, output: number}}
 */
export function sessionCumulative(turns) {
  const totals = { requests: 0, input: 0, uncached: 0, cached: 0, output: 0 }
  for (const turn of turns || []) {
    // `cache` can only ever be part of `input`; clamp so a malformed record
    // cannot push `uncached` negative and understate the bill.
    const cached = Math.min(turn.cache || 0, turn.input || 0)
    totals.requests += 1
    totals.input += turn.input || 0
    totals.uncached += (turn.input || 0) - cached
    totals.cached += cached
    totals.output += turn.output || 0
  }
  return totals
}

/**
 * Average growth of context occupancy per turn, or null when there is not enough
 * history to say. Measured end-to-end rather than as a mean of per-turn deltas
 * so one outlier turn does not dominate.
 * @param {Turn[]|null|undefined} turns
 * @returns {number|null}
 */
export function ctxGrowthPerTurn(turns) {
  const list = turns || []
  if (list.length < 2) return null
  const first = list[0].input + list[0].output
  const last = list[list.length - 1].input + list[list.length - 1].output
  const growth = (last - first) / (list.length - 1)
  return growth > 0 ? growth : null
}

/**
 * Roughly how many more turns fit before the window is full, or null when the
 * growth rate is unknown. Feeds the "start a new chat" hint, so it is an
 * estimate and labelled as one.
 * @param {number} ctx current occupancy
 * @param {number|null|undefined} contextLimit
 * @param {number|null|undefined} growthPerTurn
 * @returns {number|null}
 */
export function turnsRemaining(ctx, contextLimit, growthPerTurn) {
  const limit = positive(contextLimit)
  const growth = positive(growthPerTurn)
  if (!limit || !growth) return null
  return Math.max(0, Math.floor((limit - ctx) / growth))
}
