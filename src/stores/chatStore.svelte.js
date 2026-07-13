import { chatService } from '@/services/chat/chatService.js'
import { chatSessionService } from '@/services/chat/chatSessionService.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { settings } from './settingsStore.svelte.js'
import { handleError } from '@/lib/error/simpleErrorHandler.js'
import { skillService } from '@/lib/chat/skills/skillService.js'
import { invalidateConversationDeepDive } from '@/stores/deepDiveStore.svelte.js'

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
    abortController: null,
    currentUrl: null,
    /** True when there are earlier messages not yet loaded into the visible window. */
    hasEarlierMessages: false,
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
    chatState.pendingAttachments = [...chatState.pendingAttachments, attachment]
    markChatTabsChanged()
  }
  return attachment
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
  const { conversation, tab } = await chatService.startConversationForActiveTab({ settings })
  if (activeTabId == null) activeTabId = tab.id
  chatTabsState.activeBrowserTabId = tab.id
  writeSession(tab.id, {
    activeConversationId: conversation.id,
    conversation,
    messages: [],
    error: null,
    contextWarnings: [],
  })
  return conversation
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
 */
export async function syncChatForActiveTab(tabId, { url = null } = {}) {
  if (tabId == null) return chatState.conversation
  chatTabsState.activeBrowserTabId = tabId

  if (tabId === activeTabId) {
    if (url) handleChatTabNavigation(tabId, url)
    return chatState.conversation
  }

  if (activeTabId != null) stashViewInto(getSession(activeTabId))
  activeTabId = tabId

  const session = getSession(tabId)
  if (url && !session.currentUrl) session.currentUrl = url
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
      settings,
      abortController,
      onChunk: (message) => {
        writeSession(targetTabId, { streamingMessage: message })
      },
      onWarnings: (warnings) => {
        writeSession(targetTabId, { contextWarnings: warnings })
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
