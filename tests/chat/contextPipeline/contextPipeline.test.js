import { describe, expect, it } from 'vitest'
import {
  buildContextPipeline,
  budgetContext,
} from '@/lib/chat/contextPipeline/index.js'
import { getProviderCapabilities } from '@/lib/chat/providerCapabilities.js'
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

  it('uses the conservative budget for an unknown model', () => {
    expect(getProviderCapabilities('openaiCompatible', 'local-model')).toMatchObject({
      contextWindowTokens: 16_384,
      source: 'conservative-fallback',
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
})
