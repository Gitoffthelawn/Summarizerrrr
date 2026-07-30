import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  DB_NAME,
  getDatabase,
} from '@/lib/db/indexedDBService.js'
import {
  addMessage,
  createConversation,
  finalizeAssistantMessage,
  getMessage,
} from '@/lib/db/conversationRepository.js'
import { buildContextPipeline } from '@/lib/chat/contextPipeline/index.js'
import { createChatService } from '@/services/chat/chatService.js'
import { createChatSessionService } from '@/services/chat/chatSessionService.js'

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Test database deletion was blocked'))
  })
}

beforeEach(async () => {
  closeDatabase()
  await deleteDatabase()
})

afterEach(async () => {
  closeDatabase()
  await deleteDatabase()
})

describe('Phase 3 — groundingRefs in pipeline', () => {
  it('builds groundingRefs from budgeted conversation and attachment sources', async () => {
    const sources = [
      {
        id: 'src-active',
        sourceKey: 'https://example.com:active',
        normalizedUrl: 'https://example.com/',
        title: 'Active Page',
        sourceType: 'webpage',
        condensedContent: 'Active page content.',
        rawContent: 'Active raw content.',
        isActive: true,
      },
      {
        id: 'src-tab',
        sourceKey: 'https://tab.com:tab',
        normalizedUrl: 'https://tab.com/',
        title: 'Tab Page',
        sourceType: 'webpage',
        condensedContent: 'Tab content.',
        isActive: false,
      },
    ]
    const sourceMap = new Map(sources.map((s) => [s.id, s]))
    const repository = { getSourceById: async (id) => sourceMap.get(id) }

    const result = await buildContextPipeline(
      {
        conversation: { id: 'c-1', personaSnapshot: { content: 'Be helpful.' } },
        history: [],
        currentUserMessage: { role: 'user', content: 'Summarize the page.' },
        skillInvocation: null,
        conversationSourceRefs: [{ sourceId: 'src-active', isActive: true }],
        newAttachmentRefs: ['src-tab'],
        providerId: 'gemini',
        modelId: 'gemini-2.0-flash',
      },
      { repository }
    )

    expect(result.groundingRefs).toBeDefined()
    expect(result.groundingRefs.length).toBeGreaterThanOrEqual(1)

    // All included source IDs should appear in groundingRefs
    const groundingIds = result.groundingRefs.map((r) => r.sourceId)
    for (const id of result.includedSourceIds) {
      expect(groundingIds).toContain(id)
    }

    // Each ref should have sourceId and contentKind
    for (const ref of result.groundingRefs) {
      expect(ref.sourceId).toBeTruthy()
      expect(ref.contentKind).toBeTruthy()
      expect(['raw', 'condensed']).toContain(ref.contentKind)
    }
  })

  it('returns empty groundingRefs when no sources are provided', async () => {
    const repository = { getSourceById: async () => undefined }

    const result = await buildContextPipeline(
      {
        conversation: { id: 'c-2' },
        history: [],
        currentUserMessage: { role: 'user', content: 'Hello.' },
        skillInvocation: null,
        conversationSourceRefs: [],
        newAttachmentRefs: [],
        providerId: 'gemini',
        modelId: 'gemini-2.0-flash',
      },
      { repository }
    )

    expect(result.groundingRefs).toEqual([])
  })
})

describe('Phase 3 — groundingRefs on message record', () => {
  it('persists groundingRefs on assistant message through createMessageRecord', async () => {
    const { conversation } = await createConversation({ id: 'c-ground' })
    await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Hi' })

    const refs = [
      { sourceId: 'src-1', contentKind: 'raw' },
      { sourceId: 'src-2', contentKind: 'condensed' },
    ]
    const assistant = await finalizeAssistantMessage(conversation.id, {
      id: 'a1',
      role: 'assistant',
      content: 'Reply with sources',
      status: 'complete',
      groundingRefs: refs,
    })

    expect(assistant.groundingRefs).toEqual(refs)

    // Verify round-trip through the store
    const fetched = await getMessage('a1')
    expect(fetched.groundingRefs).toEqual(refs)
  })

  it('defaults groundingRefs to empty array when not provided', async () => {
    const { conversation } = await createConversation({ id: 'c-noground' })
    await addMessage(conversation.id, { id: 'u2', role: 'user', content: 'Hi' })

    const assistant = await finalizeAssistantMessage(conversation.id, {
      id: 'a2',
      role: 'assistant',
      content: 'Reply without sources',
    })

    expect(assistant.groundingRefs).toEqual([])
  })
})

describe('Phase 3 — chatService persists groundingRefs', () => {
  it('passes pipeline groundingRefs to finalized assistant message', async () => {
    const conversations = new Map()
    const messages = new Map()
    const sources = new Map()
    let seq = 0

    // Set up a source
    const testSource = {
      id: 'test-src',
      sourceKey: 'https://example.com:test',
      normalizedUrl: 'https://example.com/',
      title: 'Test Page',
      sourceType: 'webpage',
      condensedContent: 'Test content.',
      rawContent: 'Test raw content.',
    }
    sources.set(testSource.id, testSource)

    const repository = {
      async createConversation(data) {
        const c = { id: 'c-svc', ...data }
        conversations.set(c.id, c)
        return { conversation: c }
      },
      async getConversation(id) { return conversations.get(id) || null },
      async addMessage(cid, data) {
        const m = { id: `m-${++seq}`, conversationId: cid, sequence: seq, ...data }
        messages.set(m.id, m)
        const c = conversations.get(cid)
        if (c) c.activeLeafMessageId = m.id
        return m
      },
      async finalizeAssistantMessage(cid, data) {
        const m = { id: `m-${++seq}`, conversationId: cid, sequence: seq, ...data }
        messages.set(m.id, m)
        const c = conversations.get(cid)
        if (c) c.activeLeafMessageId = m.id
        return m
      },
      async createStreamingAssistantMessage(cid, data) {
        const m = { id: `m-${++seq}`, conversationId: cid, sequence: seq, status: 'streaming', ...data }
        messages.set(m.id, m)
        const c = conversations.get(cid)
        if (c) c.activeLeafMessageId = m.id
        return m
      },
      async checkpointStreamingContent(id, content) {
        const m = messages.get(id)
        if (m && m.status === 'streaming') m.content = content
        return m || null
      },
      async finalizeStreamingAssistantMessage(id, updates) {
        const m = messages.get(id)
        if (!m) return null
        Object.assign(m, updates)
        m.status = updates.status || 'complete'
        return m
      },
      async getGenerationPath(id) {
        return [...messages.values()].filter(m => m.conversationId === id)
      },
      async getGenerationContextForUser(userId) {
        const user = messages.get(userId)
        const all = [...messages.values()].filter(m => m.conversationId === user.conversationId)
        const idx = all.findIndex(m => m.id === userId)
        return { history: all.slice(0, idx), currentUserMessage: user }
      },
      async getSourceById(id) { return sources.get(id) || undefined },
      async putSourceSnapshot(data) {
        const s = { id: `src-${sources.size + 1}`, ...data }
        sources.set(s.id, s)
        return s
      },
    }

    // A buildPipeline that returns groundingRefs (simulating the real pipeline)
    const buildPipeline = async (input, deps) => {
      // Resolve sources like the real pipeline would
      const conversationSources = []
      for (const ref of (input.conversationSourceRefs || [])) {
        const id = typeof ref === 'string' ? ref : ref.sourceId
        const source = await deps.repository.getSourceById(id)
        if (source) conversationSources.push(source)
      }
      const groundingRefs = conversationSources.map((s) => ({
        sourceId: s.id,
        contentKind: 'condensed',
      }))
      return {
        system: 'sys',
        messages: [{ role: 'user', content: input.currentUserMessage.content }],
        warnings: [],
        groundingRefs,
        includedSourceIds: groundingRefs.map((r) => r.sourceId),
      }
    }

    const service = createChatService({
      repository,
      sourceService: {
        getActiveTab: async () => ({ id: 1, title: 'Test' }),
        getCachedActiveSource: async () => ({ source: testSource }),
      },
      sessionService: createChatSessionService(),
      buildPipeline,
      streamRequest: async function* () {
        yield { chunk: 'Reply', fullText: 'Reply', isComplete: false }
        yield { chunk: '', fullText: 'Reply', isComplete: true }
      },
    })

    const { conversation } = await repository.createConversation({ id: 'c-svc', title: 'Test' })
    // Add a user message with a source ref so groundingRefs will be populated
    const userMsg = await repository.addMessage(conversation.id, {
      role: 'user',
      content: 'Summarize this',
      attachmentRefs: ['test-src'],
    })

    const result = await service.send({
      conversation,
      messages: [userMsg],
      content: 'Summarize this',
      settings: { selectedProvider: 'gemini', selectedGeminiModel: 'test' },
    })

    // The assistant message should have groundingRefs from the pipeline
    expect(result.assistant.groundingRefs).toBeDefined()
    expect(Array.isArray(result.assistant.groundingRefs)).toBe(true)
  })
})
