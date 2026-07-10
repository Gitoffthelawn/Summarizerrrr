import { buildContextPipeline } from '@/lib/chat/contextPipeline/index.js'
import { handleError } from '@/lib/error/simpleErrorHandler.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { chatSourceService } from './chatSourceService.js'
import { chatSessionService } from './chatSessionService.js'
import { createPersonaSnapshot } from '@/lib/chat/skills/skillService.js'

async function* defaultStreamRequest(request) {
  const { generateContentStreamEnhancedRequest } = await import('@/lib/api/aiSdkAdapter.js')
  yield* generateContentStreamEnhancedRequest(request)
}

function isAbortError(error, abortController) {
  return Boolean(
    abortController?.signal.aborted ||
      error?.name === 'AbortError' ||
      error?.message?.toLowerCase().includes('aborted')
  )
}

function titleFrom(value, fallback = 'New conversation') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 80) : fallback
}

export function getModelId(providerId, settings) {
  const modelKeys = {
    gemini: settings.isAdvancedMode ? 'selectedGeminiAdvancedModel' : 'selectedGeminiModel',
    openai: 'selectedChatgptModel',
    chatgpt: 'selectedChatgptModel',
    ollama: 'selectedOllamaModel',
    openrouter: 'selectedOpenrouterModel',
    deepseek: 'selectedDeepseekModel',
    groq: 'selectedGroqModel',
    lmstudio: 'selectedLmStudioModel',
    openaiCompatible: 'selectedOpenAICompatibleModel',
  }
  return settings[modelKeys[providerId]] || null
}

function sourceIdsFrom(messages) {
  return [...new Set(messages.flatMap((message) => message.attachmentRefs || []))]
}

/**
 * Stateful sequencing without UI dependencies. Callbacks let the Svelte store
 * render a transient response while the repository only receives terminal
 * assistant records.
 */
export function createChatService({
  repository = conversationRepository,
  sourceService = chatSourceService,
  sessionService = chatSessionService,
  buildPipeline = buildContextPipeline,
  streamRequest = defaultStreamRequest,
} = {}) {
  async function startConversationForActiveTab({ settings, personaSnapshot } = {}) {
    const tab = await sourceService.getActiveTab()
    const conversation = (
      await repository.createConversation({
        title: titleFrom(tab.title),
        personaSnapshot:
          personaSnapshot ||
          createPersonaSnapshot(settings?.chatGlobalPersona, {
            language: settings?.summaryLang || 'English',
            tone: settings?.summaryTone || null,
          }),
        providerId: settings?.selectedProvider || 'gemini',
        modelId: getModelId(settings?.selectedProvider || 'gemini', settings || {}),
      })
    ).conversation
    sessionService.setConversationId(tab.id, conversation.id)
    return { conversation, tab }
  }

  async function openConversation(id) {
    const conversation = await repository.getConversation(id)
    if (!conversation || conversation.deleted) throw new Error(`Conversation ${id} was not found`)
    return {
      conversation,
      messages: await repository.listMessagesByConversation(id),
    }
  }

  async function prepareGroundedAttachments(existingAttachments, sourceRequired, onWarnings) {
    const attachmentRefs = []
    const warnings = []
    for (const attachment of existingAttachments || []) {
      if (typeof attachment === 'string') { attachmentRefs.push(attachment); continue }
      try {
        const captured = await sourceService.captureTabSource(attachment)
        attachmentRefs.push(captured.source.id)
      } catch (error) {
        warnings.push(error.message || `Could not capture ${attachment.title || 'selected tab'}.`)
      }
    }
    if (!sourceRequired) return attachmentRefs

    const cached = await sourceService.getCachedActiveSource()
    const captured = cached || (await sourceService.captureActiveSource())
    if (!attachmentRefs.includes(captured.source.id)) attachmentRefs.push(captured.source.id)
    onWarnings?.(warnings)
    return attachmentRefs
  }

  async function runGeneration({
    conversation,
    history,
    currentUserMessage,
    settings,
    abortController,
    retryOfMessageId = null,
    onChunk,
    onWarnings,
  }) {
    const transient = {
      role: 'assistant',
      content: '',
      status: 'complete',
      retryOfMessageId,
    }
    let pipeline
    try {
      const attachmentRefs = currentUserMessage.attachmentRefs || []
      pipeline = await buildPipeline(
        {
          conversation,
          history,
          currentUserMessage,
          skillInvocation: currentUserMessage.skillInvocation,
          conversationSourceRefs: sourceIdsFrom(history),
          newAttachmentRefs: attachmentRefs,
          providerId: conversation.providerId || settings.selectedProvider,
          modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
        },
        { repository }
      )
      onWarnings?.(pipeline.warnings)

      for await (const event of streamRequest({
        providerId: conversation.providerId || settings.selectedProvider,
        settings,
        system: pipeline.system,
        messages: pipeline.messages,
        abortSignal: abortController.signal,
      })) {
        if (event.isComplete) continue
        transient.content = event.fullText
        onChunk?.({ ...transient })
      }

      if (abortController.signal.aborted) transient.status = 'aborted'
      const assistant = await repository.finalizeAssistantMessage(conversation.id, {
        ...transient,
        providerId: conversation.providerId || settings.selectedProvider,
        modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
      })
      return { assistant, transient, diagnostics: pipeline }
    } catch (error) {
      if (isAbortError(error, abortController)) {
        transient.status = 'aborted'
        const assistant = await repository.finalizeAssistantMessage(conversation.id, {
          ...transient,
          providerId: conversation.providerId || settings.selectedProvider,
          modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
        })
        return { assistant, transient, diagnostics: pipeline }
      }

      const handledError = handleError(error, {
        source: pipeline ? 'chatGeneration' : 'chatAssembly',
      })
      transient.status = 'error'
      transient.error = handledError
      const assistant = await repository.finalizeAssistantMessage(conversation.id, {
        ...transient,
        providerId: conversation.providerId || settings.selectedProvider,
        modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
      })
      return { assistant, transient, error: handledError, diagnostics: pipeline }
    }
  }

  return {
    startConversationForActiveTab,
    openConversation,

    async send({
      conversation,
      messages = [],
      content,
      skillInvocation = null,
      pendingAttachments = [],
      settings,
      abortController = new AbortController(),
      sourceRequired = true,
      onUserMessage,
      onChunk,
      onWarnings,
    }) {
      if (!String(content || '').trim() && !skillInvocation) {
        throw new Error('Enter a message or choose a skill before sending.')
      }

      let attachmentRefs
      try {
        attachmentRefs = await prepareGroundedAttachments(pendingAttachments, sourceRequired, onWarnings)
      } catch (error) {
        throw handleError(error, { source: 'chatCapture' })
      }
      const userMessage = await repository.addMessage(conversation.id, {
        role: 'user',
        content: String(content || '').trim(),
        skillInvocation,
        attachmentRefs,
      })
      onUserMessage?.(userMessage)

      return runGeneration({
        conversation,
        history: messages,
        currentUserMessage: userMessage,
        settings,
        abortController,
        onChunk,
        onWarnings,
      })
    },

    async retry({ conversation, messages, userMessageId, settings, abortController, onChunk, onWarnings }) {
      const userIndex = messages.findIndex((message) => message.id === userMessageId && message.role === 'user')
      if (userIndex < 0) throw new Error('The selected user message is not available for retry.')
      const userMessage = messages[userIndex]
      return runGeneration({
        conversation,
        history: messages.slice(0, userIndex),
        currentUserMessage: userMessage,
        settings,
        abortController: abortController || new AbortController(),
        retryOfMessageId: userMessageId,
        onChunk,
        onWarnings,
      })
    },

    renameConversation(id, title) {
      return repository.updateConversationMetadata(id, { title: titleFrom(title) })
    },

    archiveConversation(id) {
      return repository.archiveConversation(id)
    },
  }
}

export const chatService = createChatService()
