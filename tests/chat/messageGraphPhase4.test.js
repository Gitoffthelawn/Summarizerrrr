import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  DB_NAME,
  getDatabase,
} from '@/lib/db/indexedDBService.js'
import {
  addMessage,
  createConversation,
  finalizeAssistantMessage,
  getConversation,
  getMessage,
  getGenerationPath,
  listMessagesByConversation,
  createStreamingAssistantMessage,
  checkpointStreamingContent,
  recoverStreamingMessages,
  finalizeStreamingAssistantMessage,
} from '@/lib/db/conversationRepository.js'
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

// ──────────────────────────────────────────────────────────────
// Durable streaming: createStreamingAssistantMessage
// ──────────────────────────────────────────────────────────────
describe('Phase 4 — createStreamingAssistantMessage', () => {
  it('pre-persists an assistant message with status "streaming"', async () => {
    const { conversation } = await createConversation({ id: 'c-stream' })
    const u1 = await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Hello' })

    const streaming = await createStreamingAssistantMessage(conversation.id, {
      content: '',
      parentId: u1.id,
    })

    expect(streaming.status).toBe('streaming')
    expect(streaming.role).toBe('assistant')
    expect(streaming.parentId).toBe(u1.id)
    expect(streaming.conversationId).toBe(conversation.id)

    // activeLeafMessageId should point to the streaming message
    const conv = await getConversation(conversation.id)
    expect(conv.activeLeafMessageId).toBe(streaming.id)
  })

  it('uses conversation activeLeafMessageId as default parentId', async () => {
    const { conversation } = await createConversation({ id: 'c-stream2' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })

    const streaming = await createStreamingAssistantMessage(conversation.id, {
      content: '',
    })

    expect(streaming.parentId).toBe(u1.id)
  })
})

// ──────────────────────────────────────────────────────────────
// Durable streaming: checkpointStreamingContent
// ──────────────────────────────────────────────────────────────
describe('Phase 4 — checkpointStreamingContent', () => {
  it('updates content of a streaming message', async () => {
    const { conversation } = await createConversation({ id: 'c-cp' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const streaming = await createStreamingAssistantMessage(conversation.id, {
      content: '',
      parentId: u1.id,
    })

    await checkpointStreamingContent(streaming.id, 'partial content...')

    const msg = await getMessage(streaming.id)
    expect(msg.content).toBe('partial content...')
    expect(msg.status).toBe('streaming')
  })

  it('does not checkpoint if status is no longer streaming', async () => {
    const { conversation } = await createConversation({ id: 'c-cp2' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const streaming = await createStreamingAssistantMessage(conversation.id, {
      content: '',
      parentId: u1.id,
    })

    // Finalize it first
    await finalizeStreamingAssistantMessage(streaming.id, {
      content: 'final content',
      status: 'complete',
    })

    // Try to checkpoint — should not overwrite
    const result = await checkpointStreamingContent(streaming.id, 'should not write')
    const msg = await getMessage(streaming.id)
    expect(msg.content).toBe('final content')
    expect(msg.status).toBe('complete')
  })

  it('returns null for a non-existent message', async () => {
    const result = await checkpointStreamingContent('nonexistent', 'content')
    expect(result).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────
// Recovery-on-open: recoverStreamingMessages
// ──────────────────────────────────────────────────────────────
describe('Phase 4 — recoverStreamingMessages', () => {
  it('marks all streaming messages as interrupted', async () => {
    const { conversation } = await createConversation({ id: 'c-rec' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const s1 = await createStreamingAssistantMessage(conversation.id, {
      content: 'partial...',
      parentId: u1.id,
    })

    // Simulate another streaming message (user sends again quickly)
    const u2 = await addMessage(conversation.id, { role: 'user', content: 'Another', parentId: s1.id })
    const s2 = await createStreamingAssistantMessage(conversation.id, {
      content: 'also partial',
      parentId: u2.id,
    })

    const recovered = await recoverStreamingMessages(conversation.id)
    expect(recovered).toHaveLength(2)
    expect(recovered.every((m) => m.status === 'interrupted')).toBe(true)

    // Verify persisted state
    const msg1 = await getMessage(s1.id)
    const msg2 = await getMessage(s2.id)
    expect(msg1.status).toBe('interrupted')
    expect(msg2.status).toBe('interrupted')
  })

  it('does not touch completed or errored messages', async () => {
    const { conversation } = await createConversation({ id: 'c-rec2' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const a1 = await finalizeAssistantMessage(conversation.id, {
      content: 'Complete reply',
      parentId: u1.id,
    })

    const recovered = await recoverStreamingMessages(conversation.id)
    expect(recovered).toHaveLength(0)

    const msg = await getMessage(a1.id)
    expect(msg.status).toBe('complete')
  })

  it('preserves partial content when recovering', async () => {
    const { conversation } = await createConversation({ id: 'c-rec3' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const s1 = await createStreamingAssistantMessage(conversation.id, {
      content: '',
      parentId: u1.id,
    })
    await checkpointStreamingContent(s1.id, 'saved partial content')

    await recoverStreamingMessages(conversation.id)

    const msg = await getMessage(s1.id)
    expect(msg.status).toBe('interrupted')
    expect(msg.content).toBe('saved partial content')
  })
})

// ──────────────────────────────────────────────────────────────
// finalizeStreamingAssistantMessage
// ──────────────────────────────────────────────────────────────
describe('Phase 4 — finalizeStreamingAssistantMessage', () => {
  it('updates the streaming record in place with final content', async () => {
    const { conversation } = await createConversation({ id: 'c-fin' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const streaming = await createStreamingAssistantMessage(conversation.id, {
      content: '',
      parentId: u1.id,
    })

    const finalized = await finalizeStreamingAssistantMessage(streaming.id, {
      content: 'Full response',
      status: 'complete',
      providerId: 'gemini',
      modelId: 'gemini-2.5-flash',
      usage: { promptTokens: 100, completionTokens: 50 },
      groundingRefs: [{ sourceId: 's1', contentKind: 'raw' }],
    })

    expect(finalized.id).toBe(streaming.id) // Same record, not a new one
    expect(finalized.content).toBe('Full response')
    expect(finalized.status).toBe('complete')
    expect(finalized.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
    expect(finalized.groundingRefs).toEqual([{ sourceId: 's1', contentKind: 'raw' }])

    // No extra messages created — only u1 + the finalized streaming message
    const all = await listMessagesByConversation(conversation.id)
    expect(all).toHaveLength(2)
  })

  it('finalizes with error status', async () => {
    const { conversation } = await createConversation({ id: 'c-fin-err' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Hello' })
    const streaming = await createStreamingAssistantMessage(conversation.id, {
      content: '',
      parentId: u1.id,
    })

    const finalized = await finalizeStreamingAssistantMessage(streaming.id, {
      content: '',
      status: 'error',
      error: { message: 'API failure', type: 'api' },
    })

    expect(finalized.status).toBe('error')
    expect(finalized.error.message).toBe('API failure')
  })
})

// ──────────────────────────────────────────────────────────────
// Durable streaming service integration
// ──────────────────────────────────────────────────────────────
describe('Phase 4 — chatService durable streaming', () => {
  it('pre-persists the assistant and finalizes the same record', async () => {
    const chunks = [
      { fullText: 'Hello ' },
      { fullText: 'Hello World' },
      { isComplete: true, usage: { promptTokens: 10, completionTokens: 5 } },
    ]

    const service = createChatService({
      sourceService: {
        getActiveTab: async () => ({ id: 1, title: 'Test' }),
        getCachedActiveSource: async () => null,
        captureActiveSource: async () => ({ source: { id: 's1' } }),
        captureTabSource: async () => ({ source: { id: 's1' } }),
      },
      sessionService: createChatSessionService(),
      buildPipeline: async () => ({
        system: 'test',
        messages: [],
        warnings: [],
        groundingRefs: [],
      }),
      streamRequest: async function* () {
        for (const chunk of chunks) yield chunk
      },
    })

    const { conversation } = await createConversation({ id: 'c-dur' })
    const u1 = await addMessage(conversation.id, { role: 'user', content: 'Test' })

    const chunksSeen = []
    const result = await service.send({
      conversation,
      content: 'Test',
      settings: { selectedProvider: 'gemini' },
      onUserMessage: () => {},
      onChunk: (msg) => chunksSeen.push(msg.content),
    })

    expect(result.assistant).not.toBeNull()
    expect(result.assistant.status).toBe('complete')
    expect(result.assistant.content).toBe('Hello World')

    // Only 3 messages: u1 (original), the user message from send, and the assistant
    const all = await listMessagesByConversation(conversation.id)
    expect(all).toHaveLength(3)

    // The assistant should be an update of the streaming record, not a new record
    const assistants = all.filter((m) => m.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(assistants[0].id).toBe(result.assistant.id)
  })
})

// ──────────────────────────────────────────────────────────────
// Pagination decoupled from context
// ──────────────────────────────────────────────────────────────
describe('Phase 4 — pagination does not affect generation path', () => {
  it('getGenerationPath returns full active path regardless of windowing', async () => {
    const { conversation } = await createConversation({ id: 'c-pag' })

    // Create 30 messages (15 user + 15 assistant turns)
    for (let i = 0; i < 15; i++) {
      await addMessage(conversation.id, { role: 'user', content: `User ${i}` })
      await finalizeAssistantMessage(conversation.id, { role: 'assistant', content: `Reply ${i}` })
    }

    const fullPath = await getGenerationPath(conversation.id)
    expect(fullPath).toHaveLength(30)

    // Windowed view
    const windowed = fullPath.slice(-25)
    expect(windowed).toHaveLength(25)

    // Full path for model context must still be 30
    const contextPath = await getGenerationPath(conversation.id)
    expect(contextPath).toHaveLength(30)
    expect(contextPath[0].content).toBe('User 0')
    expect(contextPath[contextPath.length - 1].content).toBe('Reply 14')
  })
})
