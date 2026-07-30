import { describe, expect, it } from 'vitest'
import {
  contextSnapshot,
  ctxGrowthPerTurn,
  lastTurn,
  normalizeMessageUsage,
  sessionCumulative,
  toTurns,
  turnsRemaining,
} from '../../src/lib/chat/usageMetrics.js'
import { MODEL_PRICING, estimateCost, getModelRates } from '../../src/lib/chat/usagePricing.js'

const MODEL = 'inclusionai/ling-3.0-flash:free'
const WINDOW = 262_100

/**
 * Real usage from two consecutive turns on the model above. Turn 1 reported no
 * cache figure at all, turn 2 served most of its prompt from cache.
 */
const REAL_TURNS = [
  { ts: 1, model: MODEL, input: 16_132, output: 2_701, cache: 0 },
  { ts: 2, model: MODEL, input: 19_144, output: 2_129, cache: 16_384 },
]

describe('the two metrics, on real provider data', () => {
  it('ctx is the last turn alone', () => {
    // NOT a sum: turn 2's input already contains turn 1's exchange.
    expect(contextSnapshot(lastTurn(REAL_TURNS), WINDOW).ctx).toBe(21_273)
  })

  it('cumulative splits input by price tier and they sum back to input', () => {
    const session = sessionCumulative(REAL_TURNS)
    expect(session.uncached).toBe(18_892) // 16132 + (19144 - 16384)
    expect(session.cached).toBe(16_384)
    expect(session.output).toBe(4_830)
    expect(session.requests).toBe(2)
    // The split is a partition of input, never an addition to it.
    expect(session.uncached + session.cached).toBe(session.input)
    expect(session.input).toBe(35_276)
  })

  it('cache hit rate is measured against input, because cache is inside it', () => {
    const { cacheHitRate } = contextSnapshot(lastTurn(REAL_TURNS), WINDOW)
    expect(cacheHitRate).toBeCloseTo(0.856, 3)
  })

  it('never adds cache to input anywhere', () => {
    // The regression this guards: 19144 + 2129 + 16384 = 37657, the wrong number
    // that appears the moment cache is treated as an extra bucket.
    const { ctx } = contextSnapshot(lastTurn(REAL_TURNS), WINDOW)
    expect(ctx).not.toBe(37_657)
    expect(sessionCumulative(REAL_TURNS).input).not.toBe(35_276 + 16_384)
  })

  it('reports occupancy as a fraction of the window', () => {
    const { ctxPercent } = contextSnapshot(lastTurn(REAL_TURNS), WINDOW)
    expect(ctxPercent).toBeCloseTo(21_273 / 262_100, 6)
    expect(Math.round(ctxPercent * 100)).toBe(8)
  })
})

describe('toTurns', () => {
  it('keeps raw per-request numbers from persisted messages', () => {
    const messages = [
      { role: 'user' },
      {
        role: 'assistant',
        createdAt: '2026-07-30T10:00:00.000Z',
        modelId: MODEL,
        usage: { promptTokens: 16_132, completionTokens: 2_701 },
      },
      {
        role: 'assistant',
        createdAt: '2026-07-30T10:01:00.000Z',
        modelId: MODEL,
        usage: { inputTokens: 19_144, outputTokens: 2_129, cachedInputTokens: 16_384 },
      },
    ]
    expect(toTurns(messages)).toEqual([
      { ts: Date.parse('2026-07-30T10:00:00.000Z'), model: MODEL, input: 16_132, output: 2_701, cache: 0 },
      { ts: Date.parse('2026-07-30T10:01:00.000Z'), model: MODEL, input: 19_144, output: 2_129, cache: 16_384 },
    ])
  })

  it('defaults a missing cache figure to 0 rather than dropping the turn', () => {
    const turns = toTurns([{ usage: { promptTokens: 100, completionTokens: 20 } }])
    expect(turns[0].cache).toBe(0)
  })

  it('skips messages with no usage and tolerates a missing timestamp', () => {
    expect(toTurns([{}, { usage: null }, { role: 'user' }])).toEqual([])
    expect(toTurns([{ usage: { promptTokens: 5 } }])[0].ts).toBeNull()
    expect(toTurns(null)).toEqual([])
  })
})

describe('normalizeMessageUsage', () => {
  it('reads either SDK key style', () => {
    expect(normalizeMessageUsage({ promptTokens: 100, completionTokens: 20 })).toEqual({
      input: 100,
      output: 20,
      cached: null,
    })
    expect(normalizeMessageUsage({ inputTokens: 100, outputTokens: 20 })).toEqual({
      input: 100,
      output: 20,
      cached: null,
    })
  })

  it('returns null for missing, empty, or zero-only records', () => {
    expect(normalizeMessageUsage(null)).toBeNull()
    expect(normalizeMessageUsage({})).toBeNull()
    expect(normalizeMessageUsage({ promptTokens: 0, completionTokens: 0 })).toBeNull()
  })
})

describe('sessionCumulative edge cases', () => {
  it('is all zeros for an empty session', () => {
    expect(sessionCumulative([])).toEqual({
      requests: 0,
      input: 0,
      uncached: 0,
      cached: 0,
      output: 0,
    })
    expect(sessionCumulative(null).requests).toBe(0)
  })

  it('clamps a cache figure that exceeds input instead of going negative', () => {
    // A malformed record must not understate the bill via a negative uncached.
    const session = sessionCumulative([{ input: 100, output: 10, cache: 500 }])
    expect(session.uncached).toBe(0)
    expect(session.cached).toBe(100)
  })

  it('counts abandoned regenerations — those requests were billed too', () => {
    const withRetry = [...REAL_TURNS, { input: 19_144, output: 1_500, cache: 16_384 }]
    expect(sessionCumulative(withRetry).requests).toBe(3)
    expect(sessionCumulative(withRetry).output).toBe(6_330)
  })
})

describe('contextSnapshot without data', () => {
  it('returns a zero snapshot when there is no turn yet', () => {
    expect(contextSnapshot(null, WINDOW)).toEqual({
      ctx: 0,
      ctxPercent: null,
      cacheHitRate: null,
    })
  })

  it('leaves the percentage null when the window is unknown', () => {
    expect(contextSnapshot(REAL_TURNS[1], null).ctxPercent).toBeNull()
    expect(contextSnapshot(REAL_TURNS[1], 0).ctxPercent).toBeNull()
  })

  it('leaves the hit rate null when the turn sent no input', () => {
    expect(contextSnapshot({ input: 0, output: 50, cache: 0 }, WINDOW).cacheHitRate).toBeNull()
  })
})

describe('room-left estimate', () => {
  it('measures growth end-to-end across the session', () => {
    // 18,833 → 21,273 over one step.
    expect(ctxGrowthPerTurn(REAL_TURNS)).toBe(2_440)
  })

  it('cannot estimate from a single turn', () => {
    expect(ctxGrowthPerTurn([REAL_TURNS[0]])).toBeNull()
    expect(ctxGrowthPerTurn([])).toBeNull()
  })

  it('returns null when occupancy is not growing', () => {
    // Editing a message can shrink the prompt; no sensible projection exists.
    expect(ctxGrowthPerTurn([REAL_TURNS[1], REAL_TURNS[0]])).toBeNull()
  })

  it('converts growth into turns left, and null without a rate', () => {
    expect(turnsRemaining(21_273, WINDOW, 2_440)).toBe(98)
    expect(turnsRemaining(21_273, WINDOW, null)).toBeNull()
    expect(turnsRemaining(21_273, null, 2_440)).toBeNull()
  })

  it('floors at zero rather than reporting negative room', () => {
    expect(turnsRemaining(300_000, WINDOW, 2_440)).toBe(0)
  })
})

describe('pricing', () => {
  it('zero-rates any :free model by rule, through the normal path', () => {
    expect(getModelRates(MODEL)).toEqual({ input: 0, cachedInput: 0, output: 0 })
    expect(estimateCost(sessionCumulative(REAL_TURNS), MODEL)).toBe(0)
  })

  it('reports no cost for a model with no configured rates', () => {
    expect(getModelRates('some/unpriced-model')).toBeNull()
    expect(estimateCost(sessionCumulative(REAL_TURNS), 'some/unpriced-model')).toBeNull()
    expect(estimateCost(sessionCumulative(REAL_TURNS), null)).toBeNull()
  })

  it('bills cached input at its own rate, not the full one', () => {
    // Same code path as the free model: only the table entry differs.
    const rates = { input: 1, cachedInput: 0.1, output: 10 }
    const totals = sessionCumulative(REAL_TURNS)
    const expected =
      (18_892 / 1e6) * rates.input + (16_384 / 1e6) * rates.cachedInput + (4_830 / 1e6) * rates.output
    MODEL_PRICING['test/paid-model'] = rates
    expect(estimateCost(totals, 'test/paid-model')).toBeCloseTo(expected, 10)
    delete MODEL_PRICING['test/paid-model']
  })
})
