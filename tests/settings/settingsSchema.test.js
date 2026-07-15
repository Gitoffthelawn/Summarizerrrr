import { describe, expect, it } from 'vitest'
import { migrateLegacyGeminiAdvanced } from '@/lib/config/settingsSchema.js'

describe('migrateLegacyGeminiAdvanced - thinking level migration', () => {
  it('migrates geminiThinkingLevel "minimal" to summarize.reasoningLevel "off"', () => {
    const rawSettings = {
      geminiThinkingLevel: 'minimal',
      summarize: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
      },
    }

    const migrated = migrateLegacyGeminiAdvanced(rawSettings)

    expect(migrated.summarize.reasoningLevel).toBe('off')
    expect(migrated.geminiThinkingLevel).toBeUndefined()
  })

  it('migrates geminiThinkingLevel "medium" to summarize.reasoningLevel "medium"', () => {
    const rawSettings = {
      geminiThinkingLevel: 'medium',
      summarize: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
      },
    }

    const migrated = migrateLegacyGeminiAdvanced(rawSettings)

    expect(migrated.summarize.reasoningLevel).toBe('medium')
    expect(migrated.geminiThinkingLevel).toBeUndefined()
  })

  it('migrates geminiThinkingLevel "high" to summarize.reasoningLevel "medium"', () => {
    const rawSettings = {
      geminiThinkingLevel: 'high',
      summarize: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
      },
    }

    const migrated = migrateLegacyGeminiAdvanced(rawSettings)

    expect(migrated.summarize.reasoningLevel).toBe('medium')
    expect(migrated.geminiThinkingLevel).toBeUndefined()
  })

  it('migrates legacy geminiAdvancedThinkingLevel if geminiThinkingLevel is not set', () => {
    const rawSettings = {
      geminiAdvancedThinkingLevel: 'high',
      summarize: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
      },
    }

    const migrated = migrateLegacyGeminiAdvanced(rawSettings)

    expect(migrated.summarize.reasoningLevel).toBe('medium')
    expect(migrated.geminiAdvancedThinkingLevel).toBeUndefined()
    expect(migrated.geminiThinkingLevel).toBeUndefined()
  })

  it('handles missing summarize block gracefully', () => {
    const rawSettings = {
      geminiThinkingLevel: 'minimal',
    }

    const migrated = migrateLegacyGeminiAdvanced(rawSettings)

    expect(migrated.summarize).toBeDefined()
    expect(migrated.summarize.reasoningLevel).toBe('off')
    expect(migrated.geminiThinkingLevel).toBeUndefined()
  })
})
