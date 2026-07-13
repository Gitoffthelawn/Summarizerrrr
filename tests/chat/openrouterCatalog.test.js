import { describe, expect, it } from 'vitest'
import {
  normalizeModelSlug,
  buildCatalog,
  lookupCatalogWindow,
  PROVIDER_VENDOR_MAP,
} from '../../src/lib/chat/openrouterCatalog.js'

// ---------------------------------------------------------------------------
// normalizeModelSlug
// ---------------------------------------------------------------------------

describe('normalizeModelSlug', () => {
  it.each([
    // [input, expected]
    ['openai/gpt-4o', 'gpt-4o'],
    ['gpt-4o', 'gpt-4o'],
    ['anthropic/claude-3.5-sonnet', 'claude-3-5-sonnet'],
    ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet'],
    ['google/gemini-2.5-pro', 'gemini-2-5-pro'],
    ['gemini-2.5-pro', 'gemini-2-5-pro'],
    ['deepseek/deepseek-chat', 'deepseek-chat'],
    ['deepseek-chat', 'deepseek-chat'],
    // trailing -latest
    ['openai/gpt-4o-latest', 'gpt-4o'],
    // underscores → hyphens
    ['openai/gpt_4_turbo', 'gpt-4-turbo'],
    // uppercase → lowercase
    ['OpenAI/GPT-4o', 'gpt-4o'],
  ])('normalizeModelSlug(%j) → %j', (input, expected) => {
    expect(normalizeModelSlug(input)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// buildCatalog
// ---------------------------------------------------------------------------

describe('buildCatalog', () => {
  const fixtureBody = {
    data: [
      { id: 'openai/gpt-4o', context_length: 128000 },
      { id: 'deepseek/deepseek-chat', context_length: 64000 },
      { id: 'google/gemini-2.5-pro', context_length: 1000000 },
      { id: 'anthropic/claude-3.5-sonnet', context_length: 200000 },
      // Malformed rows — should be skipped:
      { id: 'no-vendor-prefix', context_length: 32000 }, // no `/`
      { id: 'openai/missing-ctx' }, // no context_length
      { id: 'openai/zero-ctx', context_length: 0 }, // zero
      { id: 'openai/negative', context_length: -1 }, // negative
      { id: null, context_length: 100000 }, // null id
      { id: 123, context_length: 100000 }, // non-string id
    ],
  }

  it('maps vendor:normalizedSlug → contextWindowTokens for valid entries', () => {
    const catalog = buildCatalog(fixtureBody)

    expect(catalog['openai:gpt-4o']).toBe(128000)
    expect(catalog['deepseek:deepseek-chat']).toBe(64000)
    expect(catalog['google:gemini-2-5-pro']).toBe(1000000)
    expect(catalog['anthropic:claude-3-5-sonnet']).toBe(200000)
  })

  it('skips entries without a vendor slash', () => {
    const catalog = buildCatalog(fixtureBody)
    // "no-vendor-prefix" has no `/`, so it shouldn't appear under any key.
    const values = Object.values(catalog)
    expect(values).not.toContain(32000)
  })

  it('skips entries with missing, zero, or negative context_length', () => {
    const catalog = buildCatalog(fixtureBody)
    expect(catalog['openai:missing-ctx']).toBeUndefined()
    expect(catalog['openai:zero-ctx']).toBeUndefined()
    expect(catalog['openai:negative']).toBeUndefined()
  })

  it('first entry wins on duplicate normalized keys', () => {
    const catalog = buildCatalog({
      data: [
        { id: 'openai/gpt-4o', context_length: 128000 },
        { id: 'openai/gpt-4o', context_length: 99999 }, // duplicate
      ],
    })
    expect(catalog['openai:gpt-4o']).toBe(128000)
  })

  it('returns empty object for missing or invalid body', () => {
    expect(buildCatalog(null)).toEqual({})
    expect(buildCatalog({})).toEqual({})
    expect(buildCatalog({ data: 'not-an-array' })).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// lookupCatalogWindow
// ---------------------------------------------------------------------------

describe('lookupCatalogWindow', () => {
  const catalog = {
    'openai:gpt-4o': 128000,
    'deepseek:deepseek-chat': 64000,
    'google:gemini-2-5-pro': 1000000,
    'anthropic:claude-3-5-sonnet': 200000,
  }

  it('returns context window for a mapped provider', () => {
    expect(lookupCatalogWindow(catalog, 'chatgpt', 'gpt-4o')).toBe(128000)
    expect(lookupCatalogWindow(catalog, 'openai', 'gpt-4o')).toBe(128000)
    expect(lookupCatalogWindow(catalog, 'deepseek', 'deepseek-chat')).toBe(64000)
    expect(lookupCatalogWindow(catalog, 'gemini', 'gemini-2.5-pro')).toBe(1000000)
  })

  it('returns null for providers NOT in the vendor map (local excluded)', () => {
    expect(lookupCatalogWindow(catalog, 'ollama', 'gpt-4o')).toBeNull()
    expect(lookupCatalogWindow(catalog, 'lmstudio', 'gpt-4o')).toBeNull()
    expect(lookupCatalogWindow(catalog, 'openaiCompatible', 'gpt-4o')).toBeNull()
    expect(lookupCatalogWindow(catalog, 'groq', 'gpt-4o')).toBeNull()
    expect(lookupCatalogWindow(catalog, 'cerebras', 'gpt-4o')).toBeNull()
  })

  it('returns null for a model not in the catalog', () => {
    expect(lookupCatalogWindow(catalog, 'deepseek', 'totally-made-up')).toBeNull()
  })

  it('returns null for null/undefined catalog', () => {
    expect(lookupCatalogWindow(null, 'chatgpt', 'gpt-4o')).toBeNull()
    expect(lookupCatalogWindow(undefined, 'chatgpt', 'gpt-4o')).toBeNull()
  })

  it('returns null for empty/missing modelId', () => {
    expect(lookupCatalogWindow(catalog, 'chatgpt', '')).toBeNull()
    expect(lookupCatalogWindow(catalog, 'chatgpt', null)).toBeNull()
    expect(lookupCatalogWindow(catalog, 'chatgpt', undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// PROVIDER_VENDOR_MAP — sanity check
// ---------------------------------------------------------------------------

describe('PROVIDER_VENDOR_MAP', () => {
  it('maps only the intended cloud providers', () => {
    expect(PROVIDER_VENDOR_MAP).toEqual({
      chatgpt: 'openai',
      openai: 'openai',
      deepseek: 'deepseek',
      gemini: 'google',
      anthropic: 'anthropic',
    })
  })

  it('does NOT include local or self-discovering providers', () => {
    expect(PROVIDER_VENDOR_MAP).not.toHaveProperty('ollama')
    expect(PROVIDER_VENDOR_MAP).not.toHaveProperty('lmstudio')
    expect(PROVIDER_VENDOR_MAP).not.toHaveProperty('openaiCompatible')
    expect(PROVIDER_VENDOR_MAP).not.toHaveProperty('groq')
    expect(PROVIDER_VENDOR_MAP).not.toHaveProperty('cerebras')
    expect(PROVIDER_VENDOR_MAP).not.toHaveProperty('openrouter')
  })
})
