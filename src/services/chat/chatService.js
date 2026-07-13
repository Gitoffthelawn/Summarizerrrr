import { buildContextPipeline } from '@/lib/chat/contextPipeline/index.js'
import { handleError } from '@/lib/error/simpleErrorHandler.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { chatSourceService } from './chatSourceService.js'
import { chatSessionService } from './chatSessionService.js'
import { createPersonaSnapshot } from '@/lib/chat/skills/skillService.js'
import { resolveAutoSourceKind } from './sourceResolution.js'

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
            language: settings?.summaryLang || null,
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

  async function prepareGroundedAttachments(existingAttachments, sourceRequired, { skillInvocation, settings, onWarnings } = {}) {
    const attachmentRefs = []
    const warnings = []
    const commentLimit = settings?.commentLimit
    for (const attachment of existingAttachments || []) {
      if (typeof attachment === 'string') { attachmentRefs.push(attachment); continue }
      try {
        const captured = await sourceService.captureTabSource(attachment, attachment.sourceKind, { commentLimit })
        attachmentRefs.push(captured.source.id)
      } catch (error) {
        warnings.push(error.message || `Could not capture ${attachment.title || 'selected tab'}.`)
      }
    }
    if (!sourceRequired) return attachmentRefs

    // Resolve the active source kind from the skill's sourceMode.
    // Explicit kinds (e.g. 'youtubeComments') pass through; 'auto' or absent →
    // resolveAutoSourceKind (transcript on YouTube, course transcript, webpage).
    const mode = skillInvocation?.sourceMode || 'auto'
    const activeTab = await sourceService.getActiveTab()
    const sourceKind = mode === 'auto' ? resolveAutoSourceKind(activeTab.url) : mode

    const cached = await sourceService.getCachedActiveSource(sourceKind)
    const captured = cached || (await sourceService.captureActiveSource(sourceKind, { commentLimit }))
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
      parentId: currentUserMessage.id,
    }
    let pipeline
    let usage = null
    let streamingMessageId = null
    let checkpointTimer = null

    function cancelCheckpoint() {
      if (checkpointTimer != null) {
        clearTimeout(checkpointTimer)
        checkpointTimer = null
      }
    }

    function scheduleCheckpoint(content) {
      cancelCheckpoint()
      if (!streamingMessageId) return
      checkpointTimer = setTimeout(() => {
        repository.checkpointStreamingContent(streamingMessageId, content).catch(() => {})
      }, 500)
    }

    try {
      const attachmentRefs = currentUserMessage.attachmentRefs || []

      // Pre-persist the assistant message with status 'streaming' before calling the model.
      const streamingMessage = await repository.createStreamingAssistantMessage(conversation.id, {
        ...transient,
        content: '',
        providerId: conversation.providerId || settings.selectedProvider,
        modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
      })
      streamingMessageId = streamingMessage.id

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
        if (event.isComplete) {
          usage = event.usage || null
          continue
        }
        transient.content = event.fullText
        onChunk?.({ ...transient })
        scheduleCheckpoint(event.fullText)
      }

      cancelCheckpoint()

      if (abortController.signal.aborted) transient.status = 'aborted'
      const assistant = await repository.finalizeStreamingAssistantMessage(streamingMessageId, {
        content: transient.content,
        status: transient.status,
        providerId: conversation.providerId || settings.selectedProvider,
        modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
        usage,
        groundingRefs: pipeline?.groundingRefs || [],
      })
      return { assistant, transient, diagnostics: pipeline }
    } catch (error) {
      cancelCheckpoint()

      if (isAbortError(error, abortController)) {
        transient.status = 'aborted'
        if (streamingMessageId) {
          const assistant = await repository.finalizeStreamingAssistantMessage(streamingMessageId, {
            content: transient.content,
            status: 'aborted',
            providerId: conversation.providerId || settings.selectedProvider,
            modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
            groundingRefs: pipeline?.groundingRefs || [],
          })
          return { assistant, transient, diagnostics: pipeline }
        }
        return { assistant: null, transient, diagnostics: pipeline }
      }

      const handledError = handleError(error, {
        source: pipeline ? 'chatGeneration' : 'chatAssembly',
      })
      transient.status = 'error'
      transient.error = handledError
      if (streamingMessageId) {
        const assistant = await repository.finalizeStreamingAssistantMessage(streamingMessageId, {
          content: transient.content,
          status: 'error',
          error: handledError,
          providerId: conversation.providerId || settings.selectedProvider,
          modelId: conversation.modelId || getModelId(settings.selectedProvider, settings),
          usage,
          groundingRefs: pipeline?.groundingRefs || [],
        })
        return { assistant, transient, error: handledError, diagnostics: pipeline }
      }
      return { assistant: null, transient, error: handledError, diagnostics: pipeline }
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
        attachmentRefs = await prepareGroundedAttachments(pendingAttachments, sourceRequired, { skillInvocation, settings, onWarnings })
      } catch (error) {
        throw handleError(error, { source: 'chatCapture' })
      }

      const history = await repository.getGenerationPath(conversation.id)

      const userMessage = await repository.addMessage(conversation.id, {
        role: 'user',
        content: String(content || '').trim(),
        skillInvocation,
        attachmentRefs,
      })
      onUserMessage?.(userMessage)

      return runGeneration({
        conversation,
        history,
        currentUserMessage: userMessage,
        settings,
        abortController,
        onChunk,
        onWarnings,
      })
    },

    async retry({ conversation, messages, userMessageId, settings, abortController, onChunk, onWarnings }) {
      const { history, currentUserMessage } = await repository.getGenerationContextForUser(userMessageId)
      return runGeneration({
        conversation,
        history,
        currentUserMessage,
        settings,
        abortController: abortController || new AbortController(),
        retryOfMessageId: userMessageId,
        onChunk,
        onWarnings,
      })
    },

    async regenerate({ conversation, assistantMessageId, settings, abortController, onChunk, onWarnings }) {
      const allMessages = await repository.listMessagesByConversation(conversation.id)
      const assistantMessage = allMessages.find((m) => m.id === assistantMessageId)
      if (!assistantMessage) throw new Error('The assistant message was not found.')

      const userMessageId = assistantMessage.parentId
      if (!userMessageId) throw new Error('The assistant message has no parent user turn.')

      const { history, currentUserMessage } = await repository.getGenerationContextForUser(userMessageId)
      return runGeneration({
        conversation,
        history,
        currentUserMessage,
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

    async edit({ conversation, messageId, content, settings, abortController, onChunk, onWarnings }) {
      const original = await repository.getMessage(messageId)
      if (!original) throw new Error('The message to edit was not found.')
      if (original.role !== 'user') throw new Error('Only user messages can be edited.')

      // Create a new user sibling with the same parentId as the edited message
      const newUser = await repository.addMessage(conversation.id, {
        role: 'user',
        content: String(content || '').trim(),
        skillInvocation: original.skillInvocation,
        attachmentRefs: original.attachmentRefs,
        parentId: original.parentId,
      })

      const { history, currentUserMessage } = await repository.getGenerationContextForUser(newUser.id)
      return runGeneration({
        conversation,
        history,
        currentUserMessage,
        settings,
        abortController: abortController || new AbortController(),
        onChunk,
        onWarnings,
      })
    },

    async continueResponse({ conversation, assistantMessageId, settings, abortController, onChunk, onWarnings }) {
      const assistantMessage = await repository.getMessage(assistantMessageId)
      if (!assistantMessage) throw new Error('The assistant message was not found.')
      if (assistantMessage.status !== 'aborted' && assistantMessage.status !== 'interrupted') {
        throw new Error('Only aborted or interrupted replies can be continued.')
      }

      const userMessageId = assistantMessage.parentId
      if (!userMessageId) throw new Error('The assistant message has no parent user turn.')

      const { history, currentUserMessage } = await repository.getGenerationContextForUser(userMessageId)

      // Include the partial assistant content in history so the model sees what was already generated
      const historyWithPartial = [
        ...history,
        { role: 'user', content: currentUserMessage.content },
        { role: 'assistant', content: assistantMessage.content },
      ]

      // Build a continue instruction as the current user message
      const continueInstruction = {
        ...currentUserMessage,
        content: 'Continue your previous response from exactly where you left off. Do not repeat any content you already wrote.',
      }

      const controller = abortController || new AbortController()
      const baseContent = assistantMessage.content || ''
      const transient = {
        role: 'assistant',
        content: '',
        status: 'complete',
        parentId: userMessageId,
      }
      let pipeline
      let usage = null
      let checkpointTimer = null

      function cancelCheckpoint() {
        if (checkpointTimer != null) {
          clearTimeout(checkpointTimer)
          checkpointTimer = null
        }
      }

      function scheduleCheckpoint(combined) {
        cancelCheckpoint()
        checkpointTimer = setTimeout(() => {
          repository.checkpointStreamingContent(assistantMessageId, combined).catch(() => {})
        }, 500)
      }

      // Flip the existing record to 'streaming' so partial continuation content
      // is durable (checkpointed) and recoverable if the panel closes mid-stream.
      await repository.markMessageStreaming(assistantMessageId)

      try {
        const attachmentRefs = currentUserMessage.attachmentRefs || []
        pipeline = await buildPipeline(
          {
            conversation,
            history: historyWithPartial,
            currentUserMessage: continueInstruction,
            skillInvocation: currentUserMessage.skillInvocation,
            conversationSourceRefs: sourceIdsFrom(historyWithPartial),
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
          abortSignal: controller.signal,
        })) {
          if (event.isComplete) {
            usage = event.usage || null
            continue
          }
          transient.content = event.fullText
          // Show the combined content during streaming
          const combined = baseContent + event.fullText
          onChunk?.({ ...transient, content: combined })
          scheduleCheckpoint(combined)
        }

        cancelCheckpoint()

        // Aborted continuation stays continuable; a finished one becomes complete.
        const combined = baseContent + transient.content
        const status = controller.signal.aborted ? 'aborted' : 'complete'
        transient.status = status
        const updated = await repository.finalizeStreamingAssistantMessage(assistantMessageId, {
          content: combined,
          status,
          usage,
          groundingRefs: pipeline?.groundingRefs || [],
        })
        return { assistant: updated, transient, diagnostics: pipeline }
      } catch (error) {
        cancelCheckpoint()
        const combined = baseContent + transient.content
        if (isAbortError(error, controller)) {
          transient.status = 'aborted'
          const updated = await repository.finalizeStreamingAssistantMessage(assistantMessageId, {
            content: combined,
            status: 'aborted',
          })
          return { assistant: updated, transient }
        }
        // Leave the record in a continuable terminal state rather than 'streaming'.
        await repository
          .finalizeStreamingAssistantMessage(assistantMessageId, { content: combined, status: 'aborted' })
          .catch(() => {})
        throw handleError(error, { source: pipeline ? 'chatGeneration' : 'chatAssembly' })
      }
    },
  }
}

export const chatService = createChatService()
