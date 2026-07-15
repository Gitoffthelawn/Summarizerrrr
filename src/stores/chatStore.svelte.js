import { chatService } from '@/services/chat/chatService.js'
import { chatSessionService } from '@/services/chat/chatSessionService.js'
import { chatSourceService } from '@/services/chat/chatSourceService.js'
import { estimateTokens } from '@/lib/chat/contextPipeline/contextBudgeter.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { settings } from './settingsStore.svelte.js'
import { handleError } from '@/lib/error/simpleErrorHandler.js'
import { skillService } from '@/lib/chat/skills/skillService.js'
import { invalidateConversationDeepDive } from '@/stores/deepDiveStore.svelte.js'
import { effectiveReasoningLevel } from '@/lib/api/reasoningConfig.js'
import {
  resolveFeatureModel,
  resolveConversationModel,
} from '@/lib/providers/featureModelResolver.js'

/** Number of messages to show in the visible window — pagination decoupled from context. */
const VISIBLE_MESSAGE_WINDOW = 25
import { MAX_TAB_ATTACHMENTS, tabMentionService } from '@/services/chat/tabMentionService.js'
import {
  abortChatTabSession,
  chatSessionHasActivity,
  toChatTabRuntimeDescriptor,
  updateChatSessionUrl,
} from '@/services/chat/chatTabPolicy.js'

/**
 * Per-tab chat runtime.
 *
 * Each browser tab owns an independent chat session (its own messages,
 * loading/streaming flags, abort controller and composer draft). The active
 * tab's session is the reactive `chatState` that components read; every other
 * tab's session is a plain snapshot kept in `tabSessions`. A generation
 * captures the tab that started it and writes there for its whole lifetime, so
 * switching tabs only swaps the view — it never aborts an in-flight stream.
 */
function createChatSessionState() {
  return {
    activeConversationId: null,
    conversation: null,
    messages: [],
    composerText: '',
    selectedSkill: null,
    pendingAttachments: [],
    /** Sticky opt-out: when true, the current page is NOT grounded into the chat. */
    activeSourceDismissed: false,
    isSending: false,
    streamingMessage: null,
    error: null,
    contextWarnings: [],
    contextUsage: null,
    abortController: null,
    currentUrl: null,
    /** Real browser tab title from `browser.tabs` metadata — refreshes on every sync. */
    currentTitle: null,
    /** Real browser tab favicon URL from `browser.tabs` metadata — refreshes on every sync. */
    currentFavIconUrl: null,
    /** True when there are earlier messages not yet loaded into the visible window. */
    hasEarlierMessages: false,
    /**
     * Per-tab reasoning effort level. `null` is a sentinel meaning "use the
     * global default from settings" — resolved at read time via
     * `effectiveReasoningLevel()`, never at session-creation time.
     */
    reasoningLevel: null,
    /**
     * Per-tab model override. `null` means "use the conversation's model or
     * the global Chat default". Set by `setChatModel` before a conversation
     * exists; consumed and cleared by `startConversationForActiveTab`.
     */
    modelOverride: null,
  }
}

const SESSION_KEYS = Object.keys(createChatSessionState())

export const chatState = $state(createChatSessionState())

export const chatTabsState = $state({
  activeBrowserTabId: null,
  activeSessionTabId: null,
  version: 0,
})

const tabSessions = new Map() // tabId -> plain session snapshot
let activeTabId = null

function markChatTabsChanged() {
  chatTabsState.activeSessionTabId = activeTabId
  chatTabsState.version += 1
}

function getSession(tabId) {
  if (!tabId) return null
  if (!tabSessions.has(tabId)) tabSessions.set(tabId, createChatSessionState())
  return tabSessions.get(tabId)
}

/** Copy the live view into a tab's stored snapshot (drafts included). */
function stashViewInto(session) {
  if (!session) return
  for (const key of SESSION_KEYS) session[key] = chatState[key]
}

/** Paint a tab's stored snapshot onto the live view. */
function projectSessionToView(session) {
  for (const key of SESSION_KEYS) chatState[key] = session[key]
}

/**
 * Route a state update to the tab that owns it: the reactive view when that tab
 * is still on screen, otherwise its background snapshot. A null/unknown tab is
 * treated as the active view so resume flows keep working before the active tab
 * is resolved.
 */
function writeSession(tabId, patch) {
  if (tabId == null || tabId === activeTabId) Object.assign(chatState, patch)
  else Object.assign(getSession(tabId), patch)
  markChatTabsChanged()
}

function readSession(tabId) {
  return tabId == null || tabId === activeTabId ? chatState : getSession(tabId)
}

function resetView() {
  Object.assign(chatState, createChatSessionState())
  markChatTabsChanged()
}

export function getChatTabRuntimeDescriptors() {
  const ids = new Set(tabSessions.keys())
  if (activeTabId != null) ids.add(activeTabId)

  const descriptors = []
  for (const tabId of ids) {
    const session = tabId === activeTabId ? chatState : tabSessions.get(tabId)
    if (chatSessionHasActivity(session)) {
      descriptors.push(toChatTabRuntimeDescriptor(tabId, session))
    }
  }
  return descriptors
}

export function notifyChatDraftChanged() {
  markChatTabsChanged()
}

export function canSendChat() {
  return Boolean(chatState.composerText.trim() || chatState.selectedSkill) && !chatState.isSending
}

export function selectChatSkill(skill) {
  const invocation = skillService.select(skill)
  if (!invocation) return null
  chatState.selectedSkill = invocation
  markChatTabsChanged()
  return invocation
}

export async function addTabAttachment(tab) {
  if (chatState.pendingAttachments.length >= MAX_TAB_ATTACHMENTS) {
    throw new Error(`You can attach up to ${MAX_TAB_ATTACHMENTS} tabs per message.`)
  }
  const attachment = await tabMentionService.select(tab)
  // Deduplicate by (tabId, sourceKind) so transcript and comments for the same
  // tab can coexist as separate attachments.
  const isDuplicate = chatState.pendingAttachments.some(
    (item) => item.tabId === attachment.tabId && (item.sourceKind || undefined) === (attachment.sourceKind || undefined)
  )
  if (!isDuplicate) {
    // Show the chip immediately with a loading state, then estimate its token
    // cost in the background (extraction is real, so transcript/comments are
    // measured — not the visible page text).
    chatState.pendingAttachments = [...chatState.pendingAttachments, { ...attachment, estimatedTokens: null, estimating: true }]
    markChatTabsChanged()
    estimateAttachmentTokens(attachment)
  }
  return attachment
}

/** Reactively patch a single pending attachment matched by (tabId, sourceKind). */
function patchPendingAttachment(tabId, sourceKind, patch) {
  chatState.pendingAttachments = chatState.pendingAttachments.map((item) =>
    item.tabId === tabId && (item.sourceKind || undefined) === (sourceKind || undefined)
      ? { ...item, ...patch }
      : item
  )
}

/**
 * Extract the attachment's real content (transcript for video, formatted
 * comments for youtubeComments, page text otherwise — same path used at send)
 * and record an estimated token count on the chip. Warms the source cache so
 * the eventual send does not re-extract. Fails silently: a chip without an
 * estimate is fine.
 */
async function estimateAttachmentTokens(attachment) {
  try {
    const { source } = await chatSourceService.captureTabSource(attachment, attachment.sourceKind)
    const tokens = estimateTokens(source?.rawContent || '')
    patchPendingAttachment(attachment.tabId, attachment.sourceKind, { estimatedTokens: tokens, estimating: false })
  } catch {
    patchPendingAttachment(attachment.tabId, attachment.sourceKind, { estimatedTokens: null, estimating: false })
  }
}

export function removeTabAttachment(tabId, sourceKind) {
  chatState.pendingAttachments = chatState.pendingAttachments.filter(
    (item) => !(item.tabId === tabId && (sourceKind == null || (item.sourceKind || undefined) === sourceKind))
  )
  markChatTabsChanged()
}

/** Stop grounding the current page into the chat (sticky for this conversation). */
export function dismissActiveSource() {
  chatState.activeSourceDismissed = true
  markChatTabsChanged()
}

/** Re-enable grounding the current page. */
export function restoreActiveSource() {
  chatState.activeSourceDismissed = false
  markChatTabsChanged()
}

async function reloadActivePath(tabId, result) {
  const owner = readSession(tabId)
  if (!owner.conversation) return
  const fullPath = await conversationRepository.getGenerationPath(owner.conversation.id)
  const hasEarlier = fullPath.length > VISIBLE_MESSAGE_WINDOW
  const windowed = hasEarlier ? fullPath.slice(-VISIBLE_MESSAGE_WINDOW) : fullPath
  writeSession(tabId, {
    messages: windowed,
    hasEarlierMessages: hasEarlier,
    streamingMessage: null,
    error: result?.error || null,
  })
}

export async function startConversationForActiveTab() {
  const modelOverride = chatState.modelOverride
  const { conversation, tab } = await chatService.startConversationForActiveTab({
    settings,
    modelOverride: modelOverride || undefined,
  })
  if (activeTabId == null) activeTabId = tab.id
  chatTabsState.activeBrowserTabId = tab.id
  writeSession(tab.id, {
    activeConversationId: conversation.id,
    conversation,
    messages: [],
    error: null,
    contextWarnings: [],
    modelOverride: null, // consumed
  })
  return conversation
}

/**
 * Switch the model for the active tab's chat. If a conversation exists, the
 * change is persisted immediately via `updateConversationMetadata`. If no
 * conversation has been started yet, it is stored as `modelOverride` and
 * consumed when the first message is sent. No-op while a generation is
 * in-flight.
 *
 * @param {{ provider: string, model: string }} selection
 */
export async function setChatModel({ provider, model }) {
  if (chatState.isSending) return

  if (chatState.conversation) {
    const updated = await conversationRepository.updateConversationMetadata(
      chatState.conversation.id,
      { providerId: provider, modelId: model }
    )
    writeSession(activeTabId, {
      conversation: updated,
    })
  } else {
    writeSession(activeTabId, {
      modelOverride: { provider, model },
    })
  }
}

/**
 * Reactive getter for the effective model that should display on the switcher
 * trigger. Resolution order: conversation → modelOverride → settings.chat.
 *
 * A conversation delegates to `resolveConversationModel` — the same resolver
 * the request path uses — so the trigger can never label a model different
 * from the one a send would actually route to. That matters for conversations
 * stamped with a provider but no model, which resolve to their own provider's
 * default rather than settings.chat's.
 * @returns {{ provider: string, model: string }}
 */
export function getEffectiveChatModel() {
  if (chatState.conversation) {
    const { providerId, modelId } = resolveConversationModel(chatState.conversation, settings)
    return { provider: providerId, model: modelId }
  }
  if (chatState.modelOverride) {
    return chatState.modelOverride
  }
  const fallback = resolveFeatureModel('chat', settings)
  return {
    provider: fallback.providerId,
    model: fallback.modelId,
  }
}

export async function openConversation(id) {
  const conversation = await conversationRepository.getConversation(id)
  if (!conversation || conversation.deleted) throw new Error(`Conversation ${id} was not found`)

  // Recovery-on-open: mark any stale 'streaming' messages as 'interrupted'
  await conversationRepository.recoverStreamingMessages(id)

  const fullPath = await conversationRepository.getGenerationPath(id)
  const hasEarlier = fullPath.length > VISIBLE_MESSAGE_WINDOW
  const windowed = hasEarlier ? fullPath.slice(-VISIBLE_MESSAGE_WINDOW) : fullPath
  writeSession(activeTabId, {
    activeConversationId: id,
    conversation,
    messages: windowed,
    hasEarlierMessages: hasEarlier,
    error: null,
    contextWarnings: [],
  })
  if (activeTabId != null) chatSessionService.setConversationId(activeTabId, id)
  return conversation
}

export async function renameConversation(id, title) {
  const conversation = await chatService.renameConversation(id, title)
  if (chatState.activeConversationId === id) chatState.conversation = conversation
  return conversation
}

export async function archiveConversation(id) {
  const conversation = await chatService.archiveConversation(id)
  if (chatState.activeConversationId === id) closeConversation()
  return conversation
}

export function closeConversation() {
  // Only the active tab's generation is torn down; background tabs keep running.
  chatState.abortController?.abort()
  if (activeTabId != null) {
    tabSessions.delete(activeTabId)
    chatSessionService.clearConversationId(activeTabId)
  }
  resetView()
}

export function removeChatTabSession(tabId, { detachActiveTab = false } = {}) {
  if (tabId == null) return false

  const isActiveSession = tabId === activeTabId
  const session = isActiveSession ? chatState : tabSessions.get(tabId)
  abortChatTabSession(session)
  tabSessions.delete(tabId)
  chatSessionService.clearConversationId(tabId)

  if (isActiveSession) {
    resetView()
    if (detachActiveTab) activeTabId = null
  }

  markChatTabsChanged()
  return Boolean(session)
}

export function handleChatBrowserTabRemoved(tabId) {
  return removeChatTabSession(tabId, { detachActiveTab: true })
}

export function handleChatTabNavigation(tabId, nextUrl) {
  if (tabId == null || !nextUrl) return false
  const session = tabId === activeTabId ? chatState : getSession(tabId)
  updateChatSessionUrl(session, nextUrl)
  markChatTabsChanged()
  return false
}

/**
 * Swap the chat view to a tab. Never touches other tabs' generations. A tab
 * with a persisted conversation but no loaded messages is hydrated lazily.
 *
 * `title` and `favIconUrl` refresh on every sync (a tab's title changes as it
 * loads, and a stale title is a visible bug). `url` remains sticky first-write.
 */
export async function syncChatForActiveTab(tabId, { url = null, title = undefined, favIconUrl = undefined } = {}) {
  if (tabId == null) return chatState.conversation
  chatTabsState.activeBrowserTabId = tabId

  if (tabId === activeTabId) {
    if (url) handleChatTabNavigation(tabId, url)
    // Always refresh title/favicon even when staying on the same tab
    if (title !== undefined) chatState.currentTitle = title
    if (favIconUrl !== undefined) chatState.currentFavIconUrl = favIconUrl
    return chatState.conversation
  }

  if (activeTabId != null) stashViewInto(getSession(activeTabId))
  activeTabId = tabId

  const session = getSession(tabId)
  if (url && !session.currentUrl) session.currentUrl = url
  // Title and favicon always refresh — unlike URL they are not sticky
  if (title !== undefined) session.currentTitle = title
  if (favIconUrl !== undefined) session.currentFavIconUrl = favIconUrl
  projectSessionToView(session)
  markChatTabsChanged()

  if (!session.conversation) {
    const conversationId = chatSessionService.getConversationId(tabId)
    if (conversationId) {
      try {
        const conversation = await conversationRepository.getConversation(conversationId)
        if (conversation && !conversation.deleted) {
          // Recovery-on-open for tab restore
          await conversationRepository.recoverStreamingMessages(conversationId)
          const fullPath = await conversationRepository.getGenerationPath(conversationId)
          const hasEarlier = fullPath.length > VISIBLE_MESSAGE_WINDOW
          const windowed = hasEarlier ? fullPath.slice(-VISIBLE_MESSAGE_WINDOW) : fullPath
          session.activeConversationId = conversation.id
          session.conversation = conversation
          session.messages = windowed
          session.hasEarlierMessages = hasEarlier
          // Only repaint if the user is still on this tab after the async load.
          if (activeTabId === tabId) projectSessionToView(session)
          markChatTabsChanged()
        }
      } catch (error) {
        console.error('[chatStore] Failed to restore conversation for tab:', error)
      }
    }
  }
  return session.conversation
}

/**
 * Update a tab's title/favicon in its session snapshot. Used by the
 * `onUpdated` browser event to keep inactive tabs' metadata fresh
 * without triggering a full view swap.
 */
export function updateChatTabMetadata(tabId, { title, favIconUrl } = {}) {
  if (tabId == null) return
  if (title !== undefined) writeSession(tabId, { currentTitle: title })
  if (favIconUrl !== undefined) writeSession(tabId, { currentFavIconUrl: favIconUrl })
}

export async function listRecentConversations({ limit = 10 } = {}) {
  const conversations = await conversationRepository.listConversations({
    includeArchived: false,
  })
  return conversations.slice(0, limit)
}

export async function sendChatMessage(content = chatState.composerText) {
  if (chatState.isSending) return null
  if (!chatState.conversation) await startConversationForActiveTab()

  const targetTabId = activeTabId
  const owner = readSession(targetTabId)
  const conversation = owner.conversation
  const history = owner.messages

  invalidateConversationDeepDive(conversation.id)

  const abortController = new AbortController()
  const skillInvocation = chatState.selectedSkill
    ? $state.snapshot(chatState.selectedSkill)
    : null
  const pendingAttachments = $state.snapshot(chatState.pendingAttachments)
  // When the user has dismissed the page context, don't ground the active tab.
  // Explicit @ attachments (if any) are still captured.
  const sourceRequired = !chatState.activeSourceDismissed

  writeSession(targetTabId, {
    error: null,
    contextWarnings: [],
    isSending: true,
    abortController,
    streamingMessage: { role: 'assistant', content: '', status: 'complete' },
  })

  try {
    const result = await chatService.send({
      conversation,
      messages: history,
      content,
      skillInvocation,
      pendingAttachments,
      sourceRequired,
      reasoningLevel: effectiveReasoningLevel(chatState.reasoningLevel, settings),
      settings,
      abortController,
      onUserMessage: (message) => {
        writeSession(targetTabId, {
          messages: [...readSession(targetTabId).messages, message],
          composerText: '',
          selectedSkill: null,
          pendingAttachments: [],
        })
      },
      onChunk: (message) => {
        writeSession(targetTabId, { streamingMessage: message })
      },
      onWarnings: (warnings) => {
        writeSession(targetTabId, { contextWarnings: warnings })
      },
      onDiagnostics: (usage) => {
        writeSession(targetTabId, { contextUsage: usage })
      },
    })
    await reloadActivePath(targetTabId, result)
    return result
  } catch (error) {
    writeSession(targetTabId, {
      error: error?.message ? error : handleError(error, { source: 'chatPersistence' }),
      streamingMessage: null,
    })
    return null
  } finally {
    writeSession(targetTabId, { isSending: false, abortController: null })
  }
}

export function stopGeneration() {
  chatState.abortController?.abort()
}

export async function sendChatFollowUp(question) {
  chatState.selectedSkill = null
  chatState.composerText = String(question || '')
  return sendChatMessage(chatState.composerText)
}

export async function retryChatMessage(userMessageId) {
  if (!chatState.conversation || chatState.isSending) return null

  const targetTabId = activeTabId
  const owner = readSession(targetTabId)
  const abortController = new AbortController()

  writeSession(targetTabId, {
    error: null,
    isSending: true,
    abortController,
    streamingMessage: {
      role: 'assistant',
      content: '',
      status: 'complete',
      retryOfMessageId: userMessageId,
    },
  })

  try {
    const result = await chatService.retry({
      conversation: owner.conversation,
      messages: owner.messages,
      userMessageId,
      settings,
      abortController,
      onChunk: (message) => {
        writeSession(targetTabId, { streamingMessage: message })
      },
      onWarnings: (warnings) => {
        writeSession(targetTabId, { contextWarnings: warnings })
      },
      onDiagnostics: (usage) => {
        writeSession(targetTabId, { contextUsage: usage })
      },
    })
    await reloadActivePath(targetTabId, result)
    return result
  } catch (error) {
    writeSession(targetTabId, {
      error: handleError(error, { source: 'chatGeneration' }),
      streamingMessage: null,
    })
    return null
  } finally {
    writeSession(targetTabId, { isSending: false, abortController: null })
  }
}

export async function switchBranch(messageId) {
  const activeLeafId = await conversationRepository.activateBranch(messageId)
  const conversationId = chatState.activeConversationId
  if (conversationId) {
    const fullPath = await conversationRepository.getGenerationPath(conversationId)
    const hasEarlier = fullPath.length > VISIBLE_MESSAGE_WINDOW
    const windowed = hasEarlier ? fullPath.slice(-VISIBLE_MESSAGE_WINDOW) : fullPath
    writeSession(activeTabId, {
      messages: windowed,
      hasEarlierMessages: hasEarlier,
      error: null,
    })
  }
  return activeLeafId
}

/**
 * Load earlier messages beyond the visible window. Fetches the full active
 * path and shows all of them. Called by the “Load earlier” button in
 * ChatMessageList.
 */
export async function loadEarlierMessages() {
  const conversationId = chatState.activeConversationId
  if (!conversationId) return
  const fullPath = await conversationRepository.getGenerationPath(conversationId)
  writeSession(activeTabId, {
    messages: fullPath,
    hasEarlierMessages: false,
  })
}

export async function regenerateChatMessage(assistantMessageId) {
  if (!chatState.conversation || chatState.isSending) return null

  const targetTabId = activeTabId
  const owner = readSession(targetTabId)
  const abortController = new AbortController()

  const allMessages = owner.messages
  const assistantMessage = allMessages.find((m) => m.id === assistantMessageId)
  const userMessageId = assistantMessage?.parentId

  writeSession(targetTabId, {
    error: null,
    isSending: true,
    abortController,
    streamingMessage: {
      role: 'assistant',
      content: '',
      status: 'complete',
      retryOfMessageId: userMessageId,
    },
  })

  try {
    const result = await chatService.regenerate({
      conversation: owner.conversation,
      assistantMessageId,
      settings,
      abortController,
      onChunk: (message) => {
        writeSession(targetTabId, { streamingMessage: message })
      },
      onWarnings: (warnings) => {
        writeSession(targetTabId, { contextWarnings: warnings })
      },
      onDiagnostics: (usage) => {
        writeSession(targetTabId, { contextUsage: usage })
      },
    })
    await reloadActivePath(targetTabId, result)
    return result
  } catch (error) {
    writeSession(targetTabId, {
      error: handleError(error, { source: 'chatGeneration' }),
      streamingMessage: null,
    })
    return null
  } finally {
    writeSession(targetTabId, { isSending: false, abortController: null })
  }
}

export async function editChatMessage(messageId, content) {
  if (!chatState.conversation || chatState.isSending) return null

  const targetTabId = activeTabId
  const owner = readSession(targetTabId)
  const abortController = new AbortController()

  writeSession(targetTabId, {
    error: null,
    isSending: true,
    abortController,
    streamingMessage: {
      role: 'assistant',
      content: '',
      status: 'complete',
    },
  })

  try {
    const result = await chatService.edit({
      conversation: owner.conversation,
      messageId,
      content,
      reasoningLevel: effectiveReasoningLevel(chatState.reasoningLevel, settings),
      settings,
      abortController,
      onChunk: (message) => {
        writeSession(targetTabId, { streamingMessage: message })
      },
      onWarnings: (warnings) => {
        writeSession(targetTabId, { contextWarnings: warnings })
      },
      onDiagnostics: (usage) => {
        writeSession(targetTabId, { contextUsage: usage })
      },
    })
    await reloadActivePath(targetTabId, result)
    return result
  } catch (error) {
    writeSession(targetTabId, {
      error: handleError(error, { source: 'chatGeneration' }),
      streamingMessage: null,
    })
    return null
  } finally {
    writeSession(targetTabId, { isSending: false, abortController: null })
  }
}

export async function continueChatMessage(assistantMessageId) {
  if (!chatState.conversation || chatState.isSending) return null

  const targetTabId = activeTabId
  const owner = readSession(targetTabId)
  const abortController = new AbortController()

  const assistantMessage = owner.messages.find((m) => m.id === assistantMessageId)

  writeSession(targetTabId, {
    error: null,
    isSending: true,
    abortController,
    streamingMessage: {
      role: 'assistant',
      content: assistantMessage?.content || '',
      status: 'complete',
    },
  })

  try {
    const result = await chatService.continueResponse({
      conversation: owner.conversation,
      assistantMessageId,
      settings,
      abortController,
      onChunk: (message) => {
        writeSession(targetTabId, { streamingMessage: message })
      },
      onWarnings: (warnings) => {
        writeSession(targetTabId, { contextWarnings: warnings })
      },
      onDiagnostics: (usage) => {
        writeSession(targetTabId, { contextUsage: usage })
      },
    })
    await reloadActivePath(targetTabId, result)
    return result
  } catch (error) {
    writeSession(targetTabId, {
      error: handleError(error, { source: 'chatGeneration' }),
      streamingMessage: null,
    })
    return null
  } finally {
    writeSession(targetTabId, { isSending: false, abortController: null })
  }
}

export async function deleteChatMessage(messageId) {
  if (!chatState.conversation) return null

  try {
    const result = await conversationRepository.deleteSubtree(messageId)
    await reloadActivePath(activeTabId)
    return result
  } catch (error) {
    writeSession(activeTabId, {
      error: handleError(error, { source: 'chatDelete' }),
    })
    return null
  }
}
