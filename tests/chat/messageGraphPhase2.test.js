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
  getConversation,
  getMessage,
  updateMessageContent,
  deleteSubtree,
  listMessagesByConversation,
  getGenerationPath,
  getSiblings,
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

describe('Phase 2 — deleteSubtree', () => {
  it('deletes a message and all its descendants in a single transaction', async () => {
    const { conversation } = await createConversation({ id: 'c-del' })
    const u1 = await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Root' })
    const a1 = await finalizeAssistantMessage(conversation.id, { id: 'a1', role: 'assistant', content: 'Reply 1' })
    const u2 = await addMessage(conversation.id, { id: 'u2', role: 'user', content: 'Follow up' })
    const a2 = await finalizeAssistantMessage(conversation.id, { id: 'a2', role: 'assistant', content: 'Reply 2' })

    // Delete a1 and everything below it (u2, a2)
    const result = await deleteSubtree('a1')
    expect(result.deletedCount).toBe(3) // a1, u2, a2
    expect(result.deletedIds).toContain('a1')
    expect(result.deletedIds).toContain('u2')
    expect(result.deletedIds).toContain('a2')

    const remaining = await listMessagesByConversation(conversation.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('u1')

    // Active leaf should be re-pointed to u1 (parent of deleted subtree root)
    const conv = await getConversation(conversation.id)
    expect(conv.activeLeafMessageId).toBe('u1')
  })

  it('re-points active leaf to surviving sibling branch', async () => {
    const { conversation } = await createConversation({ id: 'c-sib' })
    const u1 = await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Hello' })
    const a1 = await finalizeAssistantMessage(conversation.id, { id: 'a1', role: 'assistant', content: 'A1' })
    // Create a sibling branch off u1
    const a1Alt = await finalizeAssistantMessage(conversation.id, { id: 'a1-alt', role: 'assistant', content: 'A1-Alt', parentId: 'u1' })
    const u2Alt = await addMessage(conversation.id, { id: 'u2-alt', role: 'user', content: 'Alt branch', parentId: 'a1-alt' })

    // Delete the alt branch (a1-alt and its child u2-alt)
    await deleteSubtree('a1-alt')

    const remaining = await listMessagesByConversation(conversation.id)
    expect(remaining.map(m => m.id).sort()).toEqual(['a1', 'u1'])

    // Active leaf should be on the surviving branch — a1 is the latest descendant of u1
    const conv = await getConversation(conversation.id)
    expect(conv.activeLeafMessageId).toBe('a1')
  })

  it('sets activeLeafMessageId to null when deleting the root message', async () => {
    const { conversation } = await createConversation({ id: 'c-root' })
    const u1 = await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Only message' })

    await deleteSubtree('u1')

    const remaining = await listMessagesByConversation(conversation.id)
    expect(remaining).toHaveLength(0)

    const conv = await getConversation(conversation.id)
    expect(conv.activeLeafMessageId).toBeNull()
  })
})

describe('Phase 2 — getMessage and updateMessageContent', () => {
  it('retrieves a single message by id', async () => {
    const { conversation } = await createConversation({ id: 'c-get' })
    await addMessage(conversation.id, { id: 'msg-1', role: 'user', content: 'Hello' })

    const msg = await getMessage('msg-1')
    expect(msg).toBeTruthy()
    expect(msg.id).toBe('msg-1')
    expect(msg.content).toBe('Hello')
  })

  it('returns undefined for a non-existent message', async () => {
    const msg = await getMessage('nonexistent')
    expect(msg).toBeUndefined()
  })

  it('updates message content in-place for continue', async () => {
    const { conversation } = await createConversation({ id: 'c-upd' })
    await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Hi' })
    await finalizeAssistantMessage(conversation.id, { id: 'a1', role: 'assistant', content: 'Partial...', status: 'aborted' })

    const updated = await updateMessageContent('a1', 'Partial... and continued!')
    expect(updated.content).toBe('Partial... and continued!')
    expect(updated.updatedAt).toBeTruthy()

    // Verify persisted
    const fetched = await getMessage('a1')
    expect(fetched.content).toBe('Partial... and continued!')
  })
})

describe('Phase 2 — edit (user message edit creates sibling)', () => {
  it('creates a new user sibling and old branch stays intact', async () => {
    const { conversation } = await createConversation({ id: 'c-edit' })
    const u1 = await addMessage(conversation.id, { id: 'u1', role: 'user', content: 'Original' })
    const a1 = await finalizeAssistantMessage(conversation.id, { id: 'a1', role: 'assistant', content: 'Reply to original' })

    // Simulate edit: create a new user sibling with same parentId as u1
    const u1Edited = await addMessage(conversation.id, {
      role: 'user',
      content: 'Edited version',
      parentId: u1.parentId, // Same parent as u1 (null for root)
    })

    // u1 and u1Edited should be siblings under __root__
    const rootSiblings = await getSiblings(conversation.id, '__root__')
    expect(rootSiblings.map(m => m.id)).toContain('u1')
    expect(rootSiblings.map(m => m.id)).toContain(u1Edited.id)

    // Old branch (u1 -> a1) should still exist
    const allMessages = await listMessagesByConversation(conversation.id)
    expect(allMessages.find(m => m.id === 'a1')).toBeTruthy()

    // Active leaf should be on the new branch
    const conv = await getConversation(conversation.id)
    expect(conv.activeLeafMessageId).toBe(u1Edited.id)
  })
})

describe('Phase 2 — continueResponse (via chatService)', () => {
  it('appends continuation to an aborted reply content', async () => {
    // Build an in-memory repository
    const conversations = new Map()
    const messages = new Map()
    let sequence = 0
    const repository = {
      async createConversation(data) {
        const conversation = { id: 'c-cont', ...data }
        conversations.set(conversation.id, conversation)
        return { conversation }
      },
      async getConversation(id) { return conversations.get(id) || null },
      async addMessage(conversationId, data) {
        const message = { id: `m-${++sequence}`, conversationId, sequence, ...data }
        messages.set(message.id, message)
        const conv = conversations.get(conversationId)
        if (conv) conv.activeLeafMessageId = message.id
        return message
      },
      async finalizeAssistantMessage(conversationId, data) {
        if (data.status === 'aborted' && !data.content) return null
        const message = { id: `m-${++sequence}`, conversationId, sequence, ...data }
        messages.set(message.id, message)
        const conv = conversations.get(conversationId)
        if (conv) conv.activeLeafMessageId = message.id
        return message
      },
      async getMessage(id) { return messages.get(id) || undefined },
      async updateMessageContent(id, content) {
        const msg = messages.get(id)
        if (!msg) throw new Error('Not found')
        msg.content = content
        msg.updatedAt = new Date().toISOString()
        return msg
      },
      async markMessageStreaming(id) {
        const msg = messages.get(id)
        if (!msg) throw new Error('Not found')
        msg.status = 'streaming'
        return msg
      },
      async checkpointStreamingContent(id, content) {
        const msg = messages.get(id)
        if (!msg || msg.status !== 'streaming') return msg || null
        msg.content = content
        return msg
      },
      async finalizeStreamingAssistantMessage(id, updates) {
        const msg = messages.get(id)
        if (!msg) throw new Error('Not found')
        if (updates.content != null) msg.content = updates.content
        msg.status = updates.status || 'complete'
        if (updates.usage != null) msg.usage = updates.usage
        return msg
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
      async listMessagesByConversation(id) {
        return [...messages.values()].filter(m => m.conversationId === id)
      },
    }

    const probe = {
      calls: [],
      async build(input, deps) {
        probe.calls.push(input)
        return { system: 'sys', messages: [{ role: 'user', content: input.currentUserMessage.content }], warnings: [] }
      },
    }

    const service = createChatService({
      repository,
      sourceService: { getActiveTab: async () => ({ id: 1, title: 'Test' }) },
      sessionService: createChatSessionService(),
      buildPipeline: probe.build,
      streamRequest: async function* () {
        yield { chunk: ' more text', fullText: ' more text', isComplete: false }
        yield { chunk: '', fullText: ' more text', isComplete: true, usage: { promptTokens: 10, completionTokens: 5 } }
      },
    })

    // Set up conversation with an aborted message
    const { conversation } = await repository.createConversation({ id: 'c-cont', title: 'Test' })
    await repository.addMessage(conversation.id, { id: 'user-1', role: 'user', content: 'Hello' })
    await repository.finalizeAssistantMessage(conversation.id, {
      id: 'asst-1',
      role: 'assistant',
      content: 'Partial response...',
      status: 'aborted',
      parentId: 'user-1',
    })

    const result = await service.continueResponse({
      conversation,
      assistantMessageId: 'asst-1',
      settings: { selectedProvider: 'gemini', selectedGeminiModel: 'test' },
    })

    // Content should be appended
    expect(result.assistant.content).toBe('Partial response... more text')
    // A finished continuation is no longer continuable — status becomes complete
    expect(result.assistant.status).toBe('complete')
  })
})

describe('Phase 2 — usage collection', () => {
  it('captures usage from stream completion event and persists on assistant', async () => {
    const conversations = new Map()
    const messages = new Map()
    let seq = 0
    const repository = {
      async createConversation(data) {
        const c = { id: 'c-usage', ...data }
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
    }

    const service = createChatService({
      repository,
      sourceService: {
        getActiveTab: async () => ({ id: 1, title: 'Test' }),
        getCachedActiveSource: async () => null,
        captureActiveSource: async () => ({ source: { id: 'src-1' } }),
      },
      sessionService: createChatSessionService(),
      buildPipeline: async (input) => ({
        system: 'sys',
        messages: [{ role: 'user', content: input.currentUserMessage.content }],
        warnings: [],
      }),
      streamRequest: async function* () {
        yield { chunk: 'Hi', fullText: 'Hi', isComplete: false }
        yield { chunk: '', fullText: 'Hi', isComplete: true, usage: { promptTokens: 42, completionTokens: 17 } }
      },
    })

    const { conversation } = await repository.createConversation({ id: 'c-usage', title: 'Usage test' })

    const result = await service.send({
      conversation,
      content: 'Test usage',
      settings: { selectedProvider: 'gemini', selectedGeminiModel: 'test' },
    })

    expect(result.assistant.usage).toEqual({ promptTokens: 42, completionTokens: 17 })
  })
})
