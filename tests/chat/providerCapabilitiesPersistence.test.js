import { afterEach, describe, expect, it } from 'vitest'
import {
  clearDiscoveredCapabilities,
  getDiscoveredCapabilitiesSnapshot,
  getProviderCapabilities,
  mergeDiscoveredCapabilities,
  registerModelCapability,
} from '../../src/lib/chat/providerCapabilities.js'

afterEach(() => {
  clearDiscoveredCapabilities()
})

describe('discovered-capability persistence helpers', () => {
  it('snapshots the runtime registry as a JSON-serializable object', () => {
    registerModelCapability('groq', 'llama-3.3-70b-versatile', {
      contextWindowTokens: 131072,
    })
    registerModelCapability('gemini', 'gemini-2.5-pro', {
      contextWindowTokens: 1_000_000,
      defaultOutputTokens: 8_000,
    })

    const snapshot = getDiscoveredCapabilitiesSnapshot()
    expect(snapshot).toEqual({
      'groq:llama-3.3-70b-versatile': { contextWindowTokens: 131072 },
      'gemini:gemini-2.5-pro': {
        contextWindowTokens: 1_000_000,
        defaultOutputTokens: 8_000,
      },
    })
    // Must round-trip through JSON for storage.
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('merges persisted entries into an empty registry (hydration)', () => {
    mergeDiscoveredCapabilities({
      'groq:llama-3.3-70b-versatile': { contextWindowTokens: 131072 },
      'deepseek:deepseek-v4-flash': {
        contextWindowTokens: 1_000_000,
        defaultOutputTokens: 4_000,
      },
    })

    expect(
      getProviderCapabilities('groq', 'llama-3.3-70b-versatile'),
    ).toMatchObject({ contextWindowTokens: 131072, source: 'discovered' })
    expect(getProviderCapabilities('deepseek', 'deepseek-v4-flash')).toMatchObject(
      { contextWindowTokens: 1_000_000, source: 'discovered' },
    )
  })

  it('never lets a stale cache clobber a live discovery', () => {
    registerModelCapability('groq', 'model-x', { contextWindowTokens: 200_000 })
    mergeDiscoveredCapabilities({
      'groq:model-x': { contextWindowTokens: 8_192 },
    })

    expect(getProviderCapabilities('groq', 'model-x').contextWindowTokens).toBe(
      200_000,
    )
  })

  it('ignores malformed or non-positive entries when merging', () => {
    mergeDiscoveredCapabilities({
      'groq:bad-a': { contextWindowTokens: 0 },
      'groq:bad-b': { contextWindowTokens: -1 },
      'groq:bad-c': { contextWindowTokens: 'nope' },
      'groq:bad-d': {},
    })

    for (const id of ['bad-a', 'bad-b', 'bad-c', 'bad-d']) {
      // Falls through to the modern default rather than a discovered value.
      expect(getProviderCapabilities('groq', id).source).toBe('default-fallback')
    }
    expect(getDiscoveredCapabilitiesSnapshot()).toEqual({})
  })

  it('tolerates a non-object argument', () => {
    expect(() => mergeDiscoveredCapabilities(null)).not.toThrow()
    expect(() => mergeDiscoveredCapabilities(undefined)).not.toThrow()
    expect(getDiscoveredCapabilitiesSnapshot()).toEqual({})
  })
})
