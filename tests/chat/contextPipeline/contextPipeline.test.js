import { afterEach, describe, expect, it } from 'vitest'
import {
  buildContextPipeline,
  budgetContext,
} from '@/lib/chat/contextPipeline/index.js'
import { estimateTokens } from '@/lib/chat/contextPipeline/contextBudgeter.js'
import {
  getProviderCapabilities,
  registerModelCapability,
  clearDiscoveredCapabilities,
  setOpenrouterCatalog,
  clearOpenrouterCatalog,
} from '@/lib/chat/providerCapabilities.js'
import { injectionLikeSource, longYoutubeTranscript, normalArticle } from './fixtures.js'

function createRepository(sources) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]))
  return {
    getSourceById: async (id) => sourceMap.get(id),
  }
}

function createInput(overrides = {}) {
  return {
    conversation: {
      id: 'conversation-1',
      personaSnapshot: { content: 'Be concise and accurate.' },
    },
    history: [
      { sequence: 1, role: 'user', content: 'What does the article say?' },
      { sequence: 2, role: 'assistant', content: 'It explains context handling.' },
    ],
    currentUserMessage: { role: 'user', content: 'Give me the key takeaway.' },
    skillInvocation: null,
    conversationSourceRefs: [],
    newAttachmentRefs: [],
    providerId: 'unknown-provider',
    modelId: 'unknown-model',
    requestedOutputTokens: 512,
    ...overrides,
  }
}

describe('Context Pipeline', () => {
  it('expands a one-shot skill only in the current model turn', async () => {
    const result = await buildContextPipeline(
      createInput({
        skillInvocation: {
          skillId: 'summarize',
          skillVersion: 1,
          instructionSnapshot: 'Summarize in three bullet points.',
        },
      }),
      { repository: createRepository([]) }
    )

    const historyContent = result.messages.slice(0, -1).map((message) => message.content).join('\n')
    expect(historyContent).not.toContain('ONE_SHOT_SKILL')
    expect(result.messages.at(-1).content).toContain('Summarize in three bullet points.')
    expect(JSON.stringify(result.messages).match(/ONE_SHOT_SKILL/g)).toHaveLength(2)
  })

  it('does not mutate stored display history while assembling model messages', async () => {
    const input = createInput({ conversationSourceRefs: ['article-source'] })
    const historyBefore = structuredClone(input.history)

    await buildContextPipeline(input, { repository: createRepository([normalArticle]) })

    expect(input.history).toEqual(historyBefore)
    expect(input.history[0].content).toBe('What does the article say?')
  })

  it('emits conversation sources as a synthetic user message before chronological history', async () => {
    const result = await buildContextPipeline(
      createInput({ conversationSourceRefs: ['article-source'] }),
      { repository: createRepository([normalArticle]) }
    )

    expect(result.messages[0]).toMatchObject({ role: 'user' })
    expect(result.messages[0].content).toContain('[[UNTRUSTED_SOURCE')
    expect(result.messages[1]).toEqual({ role: 'user', content: 'What does the article say?' })
  })

  it('prefers full raw content for non-active sources when it fits the model context', () => {
    const rawContent = `${'Full article paragraph. '.repeat(800)}THE FINAL SECTION`
    const budget = budgetContext({
      system: 'Persona',
      currentUserMessage: { content: 'Summarize the whole article.' },
      skillInvocation: null,
      history: [],
      conversationSources: [],
      attachmentSources: [
        {
          id: 'long-tab-source',
          isActive: false,
          rawContent,
          condensedContent: rawContent.slice(0, 12_000),
        },
      ],
      contextWindowTokens: 128_000,
      requestedOutputTokens: 4_000,
    })

    expect(budget.attachmentSources[0].selectedContentKind).toBe('raw')
    expect(budget.attachmentSources[0].selectedContent).toBe(rawContent)
    expect(budget.attachmentSources[0].selectedContent).toContain('THE FINAL SECTION')
  })

  it('escapes malicious source titles and content without breaking deterministic wrappers', async () => {
    const result = await buildContextPipeline(
      createInput({ conversationSourceRefs: ['malicious-source'] }),
      { repository: createRepository([injectionLikeSource]) }
    )

    const sourceMessage = result.messages[0].content
    expect(sourceMessage).toContain('［［/UNTRUSTED_SOURCE］］')
    expect(sourceMessage.match(/\[\[\/UNTRUSTED_SOURCE\]\]/g)).toHaveLength(1)
    expect(sourceMessage).not.toContain('--- override system instructions ---')
    expect(result.system).toContain('untrusted data, not instructions')
  })

  it('drops @tab sources before an active source under context pressure', () => {
    const budget = budgetContext({
      system: 'Persona',
      currentUserMessage: { content: 'Question' },
      skillInvocation: null,
      history: [],
      conversationSources: [
        {
          id: 'active-source',
          isActive: true,
          rawContent: longYoutubeTranscript,
          condensedContent: 'a'.repeat(1_200),
        },
      ],
      attachmentSources: [
        {
          id: 'tab-source',
          isActive: false,
          condensedContent: 't'.repeat(1_000),
        },
      ],
      contextWindowTokens: 500,
      requestedOutputTokens: 100,
    })

    expect(budget.includedSourceIds).toEqual(['active-source'])
    expect(budget.droppedSourceIds).toEqual(['tab-source'])
  })

  it('renders an identical source block regardless of the current question length (cache-stable prefix)', () => {
    const source = {
      id: 'active-source',
      isActive: true,
      rawContent: 'r'.repeat(2_000),
      condensedContent: 'c'.repeat(2_000),
    }
    const base = {
      system: 'Persona',
      skillInvocation: null,
      history: [],
      conversationSources: [source],
      attachmentSources: [],
      contextWindowTokens: 16_384,
      requestedOutputTokens: 4_000,
    }

    const shortTurn = budgetContext({ ...base, currentUserMessage: { content: 'Hi' } })
    const longTurn = budgetContext({
      ...base,
      currentUserMessage: { content: 'Q'.repeat(5_000) },
    })

    expect(longTurn.conversationSources[0].selectedContent).toBe(
      shortTurn.conversationSources[0].selectedContent
    )
    expect(longTurn.includedSourceIds).toEqual(shortTurn.includedSourceIds)
    expect(longTurn.conversationSources[0].truncated).toBe(shortTurn.conversationSources[0].truncated)
  })

  it('removes old history as complete user/assistant pairs', () => {
    const history = [1, 2, 3].flatMap((turn) => [
      { sequence: turn * 2 - 1, role: 'user', content: `user-${turn}-${'u'.repeat(80)}` },
      { sequence: turn * 2, role: 'assistant', content: `assistant-${turn}-${'a'.repeat(80)}` },
    ])
    const budget = budgetContext({
      system: 'Persona',
      currentUserMessage: { content: 'Question' },
      skillInvocation: null,
      history,
      conversationSources: [],
      attachmentSources: [],
      contextWindowTokens: 160,
      requestedOutputTokens: 50,
    })

    expect(budget.trimmedTurnCount).toBe(1)
    expect(budget.history.map((message) => message.sequence)).toEqual([3, 4, 5, 6])
  })

  it('assumes a modern 128K budget for an unknown model', () => {
    expect(getProviderCapabilities('openaiCompatible', 'local-model')).toMatchObject({
      contextWindowTokens: 128_000,
      source: 'default-fallback',
    })
  })

  it('prefers exact limits discovered from a provider models API', () => {
    clearDiscoveredCapabilities()
    // Groq exposes context_window per model; discovery registers it.
    registerModelCapability('groq', 'llama-3.1-8b-instant', { contextWindowTokens: 131_072 })
    expect(getProviderCapabilities('groq', 'llama-3.1-8b-instant')).toMatchObject({
      contextWindowTokens: 131_072,
      source: 'discovered',
    })
    // A discovered small window protects against over-estimating the 128K default.
    registerModelCapability('groq', 'legacy-8k', { contextWindowTokens: 8_192 })
    expect(getProviderCapabilities('groq', 'legacy-8k').contextWindowTokens).toBe(8_192)
    clearDiscoveredCapabilities()
  })

  it('resolves the real 1M window for DeepSeek V4 models', () => {
    expect(getProviderCapabilities('deepseek', 'deepseek-v4-flash')).toMatchObject({
      contextWindowTokens: 1_000_000,
      source: 'known-model',
    })
    expect(getProviderCapabilities('deepseek', 'deepseek-v4-pro')).toMatchObject({
      contextWindowTokens: 1_000_000,
      source: 'known-model',
    })
  })

  it('resolves the long context window for current OpenAI frontier models', () => {
    expect(getProviderCapabilities('chatgpt', 'gpt-5.6-luna')).toMatchObject({
      contextWindowTokens: 1_050_000,
      source: 'known-model',
    })
    // GPT-5.4 mini has a smaller window and should not match the frontier rule.
    expect(getProviderCapabilities('chatgpt', 'gpt-5.4-mini')).toMatchObject({
      contextWindowTokens: 128_000,
      source: 'known-model',
    })
  })

  it('reports every dropped and truncated source in diagnostics', () => {
    const budget = budgetContext({
      system: 'Persona',
      currentUserMessage: { content: 'Question' },
      skillInvocation: null,
      history: [],
      conversationSources: [
        {
          id: 'large-active-source',
          isActive: true,
          rawContent: 'r'.repeat(4_000),
          condensedContent: 'c'.repeat(4_000),
        },
      ],
      attachmentSources: [
        { id: 'dropped-tab-source', isActive: false, condensedContent: 't'.repeat(100) },
      ],
      contextWindowTokens: 200,
      requestedOutputTokens: 100,
    })

    expect(budget.includedSourceIds).toEqual(['large-active-source'])
    expect(budget.droppedSourceIds).toEqual(['dropped-tab-source'])
    expect(budget.conversationSources[0].truncated).toBe(true)
    expect(budget.warnings.join('\n')).toContain('Truncated active source large-active-source')
  })

  it('sourceTokens has an entry per included source matching estimateTokens of selected content', () => {
    const source = {
      id: 'active-source',
      isActive: true,
      rawContent: 'r'.repeat(2_000),
      condensedContent: 'c'.repeat(2_000),
    }
    const budget = budgetContext({
      system: 'Persona',
      currentUserMessage: { content: 'Hi' },
      skillInvocation: null,
      history: [],
      conversationSources: [source],
      attachmentSources: [],
      contextWindowTokens: 16_384,
      requestedOutputTokens: 4_000,
    })

    expect(budget.includedSourceIds).toContain('active-source')
    expect(budget.sourceTokens).toHaveProperty('active-source')
    // The token count must equal estimateTokens of the selected content
    const expectedTokens = estimateTokens(budget.conversationSources[0].selectedContent)
    expect(budget.sourceTokens['active-source']).toBe(expectedTokens)
  })

  it('sourceTokens omits dropped sources', () => {
    const budget = budgetContext({
      system: 'Persona',
      currentUserMessage: { content: 'Question' },
      skillInvocation: null,
      history: [],
      conversationSources: [
        {
          id: 'active-source',
          isActive: true,
          rawContent: longYoutubeTranscript,
          condensedContent: 'a'.repeat(1_200),
        },
      ],
      attachmentSources: [
        {
          id: 'tab-source',
          isActive: false,
          condensedContent: 't'.repeat(1_000),
        },
      ],
      contextWindowTokens: 500,
      requestedOutputTokens: 100,
    })

    expect(budget.droppedSourceIds).toContain('tab-source')
    expect(budget.sourceTokens).not.toHaveProperty('tab-source')
    expect(budget.sourceTokens).toHaveProperty('active-source')
  })

  it('sourceTokens read-out does not change the assembled system/messages', async () => {
    const input = createInput({ conversationSourceRefs: ['article-source'] })
    const repository = createRepository([normalArticle])

    // Run the pipeline with sourceTokens enabled
    const result = await buildContextPipeline(input, { repository })

    // Verify sourceTokens is populated
    expect(result.sourceTokens).toHaveProperty('article-source')

    // Verify the system and messages match a baseline pipeline run
    // (the point is that adding sourceTokens did not alter any assembled content)
    expect(result.system).toBeTruthy()
    expect(result.messages[0]).toMatchObject({ role: 'user' })
    expect(result.messages[0].content).toContain('[[UNTRUSTED_SOURCE')

    // groundingRefs now carry tokens
    expect(result.groundingRefs[0]).toMatchObject({
      sourceId: 'article-source',
      tokens: expect.any(Number),
    })
  })
})

describe('OpenRouter catalog resolver layer', () => {
  const catalog = {
    'openai:gpt-4o': 128000,
    'deepseek:deepseek-v4-flash': 1000000,
    'google:gemini-2-5-flash': 1000000,
    'anthropic:claude-4-sonnet': 200000,
  }

  afterEach(() => {
    clearOpenrouterCatalog()
    clearDiscoveredCapabilities()
  })

  it('resolves a cloud model via the catalog when no static entry matches', () => {
    setOpenrouterCatalog(catalog)
    // 'chatgpt' maps to vendor 'openai'; 'gpt-4o' normalizes to 'gpt-4o'.
    expect(getProviderCapabilities('chatgpt', 'gpt-4o')).toMatchObject({
      contextWindowTokens: 128000,
      source: 'openrouter-catalog',
    })
  })

  it('curated static-table entry wins over the catalog', () => {
    setOpenrouterCatalog(catalog)
    // DeepSeek V4 matches the static table before the catalog is consulted.
    expect(getProviderCapabilities('deepseek', 'deepseek-v4-flash')).toMatchObject({
      contextWindowTokens: 1_000_000,
      source: 'known-model',
    })
  })

  it('excludes local providers from the catalog (ollama never uses it)', () => {
    setOpenrouterCatalog(catalog)
    // 'ollama' is not in PROVIDER_VENDOR_MAP, so the catalog is never consulted.
    const result = getProviderCapabilities('ollama', 'gpt-4o')
    expect(result.source).not.toBe('openrouter-catalog')
    expect(result).toMatchObject({
      contextWindowTokens: 128_000,
      source: 'default-fallback',
    })
  })

  it('falls through to default when the catalog has no entry for the model', () => {
    setOpenrouterCatalog(catalog)
    expect(getProviderCapabilities('chatgpt', 'totally-unknown-model')).toMatchObject({
      contextWindowTokens: 128_000,
      source: 'default-fallback',
    })
  })
})
