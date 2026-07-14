import { describe, expect, it } from 'vitest'
import { createChatService } from '@/services/chat/chatService.js'
import { createChatSessionService } from '@/services/chat/chatSessionService.js'
import { createChatSourceService } from '@/services/chat/chatSourceService.js'

function source(id = 'source-1') {
  return {
    id,
    sourceKey: `https://example.com:${id}`,
    normalizedUrl: 'https://example.com/',
    url: 'https://example.com/',
    title: 'Example page',
    sourceType: 'webpage',
    condensedContent: 'Condensed example source.',
    rawContent: 'Raw example source.',
    capturedAt: '2026-07-10T00:00:00.000Z',
  }
}

function createRepository() {
  const conversations = new Map()
  const messages = new Map()
  const sources = new Map()
  let sequence = 0
  return {
    sources,
    async createConversation(data) {
      const conversation = { id: 'conversation-1', ...data }
      conversations.set(conversation.id, conversation)
      return { conversation }
    },
    async getConversation(id) {
      return conversations.get(id) || null
    },
    async listMessagesByConversation(id) {
      return [...messages.values()].filter((message) => message.conversationId === id)
    },
    async addMessage(conversationId, data) {
      const message = { id: `message-${++sequence}`, conversationId, sequence, ...data }
      messages.set(message.id, message)
      return message
    },
    async finalizeAssistantMessage(conversationId, data) {
      if (data.status === 'aborted' && !data.content) return null
      const message = { id: `message-${++sequence}`, conversationId, sequence, ...data }
      messages.set(message.id, message)
      return message
    },
    async createStreamingAssistantMessage(conversationId, data) {
      const message = { id: `message-${++sequence}`, conversationId, sequence, status: 'streaming', ...data }
      messages.set(message.id, message)
      return message
    },
    async checkpointStreamingContent(messageId, content) {
      const msg = messages.get(messageId)
      if (!msg || msg.status !== 'streaming') return msg || null
      msg.content = content
      return msg
    },
    async recoverStreamingMessages(conversationId) {
      const recovered = []
      for (const msg of messages.values()) {
        if (msg.conversationId === conversationId && msg.status === 'streaming') {
          msg.status = 'interrupted'
          recovered.push(msg)
        }
      }
      return recovered
    },
    async finalizeStreamingAssistantMessage(messageId, updates) {
      const msg = messages.get(messageId)
      if (!msg) return null
      Object.assign(msg, updates)
      msg.status = updates.status || 'complete'
      return msg
    },
    async getGenerationPath(id) {
      return [...messages.values()].filter((message) => message.conversationId === id)
    },
    async getGenerationContextForUser(userMessageId) {
      const userMessage = messages.get(userMessageId)
      const all = [...messages.values()].filter((message) => message.conversationId === userMessage.conversationId)
      const userIndex = all.findIndex((m) => m.id === userMessageId)
      return {
        history: all.slice(0, userIndex),
        currentUserMessage: userMessage,
      }
    },
    async getSourceById(id) {
      return sources.get(id) || null
    },
    async putSourceSnapshot(data) {
      const snapshot = { id: `source-${sources.size + 1}`, ...data }
      sources.set(snapshot.id, snapshot)
      return snapshot
    },
    async updateConversationMetadata(id, data) {
      const updated = { ...conversations.get(id), ...data }
      conversations.set(id, updated)
      return updated
    },
    archiveConversation(id) {
      return this.updateConversationMetadata(id, { archived: true })
    },
  }
}

const settings = { selectedProvider: 'gemini', selectedGeminiModel: 'gemini-test' }

function createPipelineProbe() {
  const calls = []
  return {
    calls,
    async build(input, dependencies) {
      calls.push({ input, dependencies })
      return { system: 'System', messages: [{ role: 'user', content: input.currentUserMessage.content }], warnings: [] }
    },
  }
}

describe('chat orchestration', () => {
  it('captures the active page on first send and reuses the cached snapshot on later sends', async () => {
    const repository = createRepository()
    let extractionCount = 0
    const sourceService = createChatSourceService({
      browserApi: { tabs: { query: async () => [{ id: 44, url: 'https://example.com', title: 'Example page' }] } },
      getPageContentFn: async () => {
        extractionCount += 1
        return { type: 'webpage', content: 'The active page source.' }
      },
      repository,
    })
    const probe = createPipelineProbe()
    const service = createChatService({
      repository,
      sourceService,
      sessionService: createChatSessionService(),
      buildPipeline: probe.build,
      streamRequest: async function* () { yield { chunk: 'Answer', fullText: 'Answer', isComplete: false }; yield { chunk: '', fullText: 'Answer', isComplete: true } },
    })
    const { conversation } = await service.startConversationForActiveTab({ settings })
    const first = await service.send({ conversation, content: 'What is this?', settings })
    const second = await service.send({
      conversation,
      messages: await repository.listMessagesByConversation(conversation.id),
      content: 'And why?',
      settings,
    })

    expect(extractionCount).toBe(1)
    expect(first.assistant).toMatchObject({ content: 'Answer', status: 'complete' })
    expect(second.assistant).toMatchObject({ content: 'Answer', status: 'complete' })
    expect(probe.calls[1].input.conversationSourceRefs).toEqual(['source-1'])
  })

  it('persists non-empty partial output as aborted and clears the terminal lifecycle', async () => {
    const repository = createRepository()
    const activeSource = source()
    repository.sources.set(activeSource.id, activeSource)
    const sourceService = {
      getActiveTab: async () => ({ id: 1, title: 'Example' }),
      getCachedActiveSource: async () => ({ source: activeSource }),
    }
    const service = createChatService({
      repository,
      sourceService,
      buildPipeline: createPipelineProbe().build,
      streamRequest: async function* () {
        yield { chunk: 'Partial', fullText: 'Partial', isComplete: false }
      },
    })
    const { conversation } = await service.startConversationForActiveTab({ settings })
    const controller = new AbortController()
    const result = await service.send({
      conversation,
      content: 'Stop me',
      settings,
      abortController: controller,
      onChunk: () => controller.abort(),
    })

    expect(result.assistant).toMatchObject({ content: 'Partial', status: 'aborted' })
  })

  it('retries with the stored skill and attachment snapshots without duplicating the user record', async () => {
    const repository = createRepository()
    const attachedSource = source()
    repository.sources.set(attachedSource.id, attachedSource)
    const probe = createPipelineProbe()
    const service = createChatService({
      repository,
      sourceService: { getActiveTab: async () => ({ id: 7, title: 'Example' }) },
      buildPipeline: probe.build,
      streamRequest: async function* () { yield { chunk: 'Retried', fullText: 'Retried', isComplete: false } },
    })
    const { conversation } = await service.startConversationForActiveTab({ settings })
    const user = await repository.addMessage(conversation.id, {
      role: 'user',
      content: 'Explain this',
      skillInvocation: { skillId: 'explain', skillVersion: 1, instructionSnapshot: 'Explain simply.' },
      attachmentRefs: [attachedSource.id],
    })
    const failed = await repository.finalizeAssistantMessage(conversation.id, { role: 'assistant', content: '', status: 'error', error: { message: 'failed' } })
    const result = await service.retry({ conversation, messages: [user, failed], userMessageId: user.id, settings })

    expect(probe.calls[0].input.skillInvocation).toEqual(user.skillInvocation)
    expect(probe.calls[0].input.newAttachmentRefs).toEqual([attachedSource.id])
    expect(result.assistant).toMatchObject({ retryOfMessageId: user.id, content: 'Retried' })
    expect([...repository.sources.values()]).toHaveLength(1)
  })

  it('restores the runtime conversation for a tab without rebinding persisted sources', async () => {
    const repository = createRepository()
    const sessionService = createChatSessionService()
    const service = createChatService({
      repository,
      sourceService: { getActiveTab: async () => ({ id: 23, title: 'Original tab' }) },
      sessionService,
      buildPipeline: createPipelineProbe().build,
    })
    const { conversation } = await service.startConversationForActiveTab({ settings })
    await repository.addMessage(conversation.id, { role: 'user', content: 'Saved', attachmentRefs: ['source-closed'] })

    expect(sessionService.getConversationId(23)).toBe(conversation.id)
    await expect(service.openConversation(conversation.id)).resolves.toMatchObject({ conversation })
  })

  it('resolves dynamic profile identities and falls back correctly when deleted', async () => {
    const repository = createRepository()
    const probe = createPipelineProbe()
    const streamRequestCalls = []
    const service = createChatService({
      repository,
      sourceService: { getActiveTab: async () => ({ id: 1, title: 'Example' }) },
      buildPipeline: probe.build,
      streamRequest: async function* (req) {
        streamRequestCalls.push(req)
        yield { chunk: 'Response', fullText: 'Response', isComplete: false }
        yield { chunk: '', fullText: 'Response', isComplete: true }
      },
    })

    const customSettings = {
      selectedProvider: 'gemini',
      selectedGeminiModel: 'gemini-test',
      chat: {
        provider: 'openai-compatible-profile-1',
        model: 'model-1-overridden',
      },
      openaiCompatibleProfiles: [
        {
          id: 'openai-compatible-profile-1',
          name: 'My Profile',
          baseUrl: 'https://api.my-profile.com/v1',
          apiKey: 'my-key',
          defaultModel: 'model-1',
        }
      ]
    }

    // 1. Start conversation (should store dynamic profile id)
    const { conversation } = await service.startConversationForActiveTab({ settings: customSettings })
    expect(conversation.providerId).toBe('openai-compatible-profile-1')
    expect(conversation.modelId).toBe('model-1-overridden')

    // 2. Send message (should resolve overlay and convert adapter ID)
    const warnings = []
    const diagnostics = []
    await service.send({
      conversation,
      content: 'Hello',
      settings: customSettings,
      sourceRequired: false,
      onWarnings: (w) => warnings.push(...w),
      onDiagnostics: (d) => diagnostics.push(d),
    })

    expect(streamRequestCalls).toHaveLength(1)
    // The request passed to streamRequest should use 'openaiCompatible' adapter id
    expect(streamRequestCalls[0].providerId).toBe('openaiCompatible')
    expect(streamRequestCalls[0].settings.openaiCompatibleApiKey).toBe('my-key')
    expect(streamRequestCalls[0].settings.openaiCompatibleBaseUrl).toBe('https://api.my-profile.com/v1')
    expect(streamRequestCalls[0].settings.selectedOpenAICompatibleModel).toBe('model-1-overridden')

    // 3. Fallback when profile is deleted
    const deletedSettings = {
      selectedProvider: 'gemini',
      selectedGeminiModel: 'gemini-test',
      chat: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
      },
      openaiCompatibleProfiles: [] // profile-1 is now deleted!
    }

    const fallbackWarnings = []
    await service.send({
      conversation,
      content: 'Hello after delete',
      settings: deletedSettings,
      sourceRequired: false,
      onWarnings: (w) => fallbackWarnings.push(...w),
    })

    // The conversation metadata should be updated in the repository to 'gemini' fallback
    const updatedConversation = await repository.getConversation(conversation.id)
    expect(updatedConversation.providerId).toBe('gemini')
    expect(updatedConversation.modelId).toBe('gemini-3-flash-preview')

    // We should receive a warning in onWarnings
    expect(fallbackWarnings).toContain(
      'The selected OpenAI Compatible profile was deleted. Falling back to the current Chat provider: Google Gemini.'
    )
  })
})
