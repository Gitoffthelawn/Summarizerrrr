import { chatService } from '@/services/chat/chatService.js'
import { chatSessionService } from '@/services/chat/chatSessionService.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { settings } from './settingsStore.svelte.js'
import { handleError } from '@/lib/error/simpleErrorHandler.js'
import { skillService } from '@/lib/chat/skills/skillService.js'
import { invalidateConversationDeepDive } from '@/stores/deepDiveStore.svelte.js'
import { MAX_TAB_ATTACHMENTS, tabMentionService } from '@/services/chat/tabMentionService.js'

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
    isSending: false,
    streamingMessage: null,
    error: null,
    contextWarnings: [],
    abortController: null,
  }
}

const SESSION_KEYS = Object.keys(createChatSessionState())

export const chatState = $state(createChatSessionState())

const tabSessions = new Map() // tabId -> plain session snapshot
let activeTabId = null

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
}

function readSession(tabId) {
  return tabId == null || tabId === activeTabId ? chatState : getSession(tabId)
}

function resetView() {
  Object.assign(chatState, createChatSessionState())
}

export function canSendChat() {
  return Boolean(chatState.composerText.trim() || chatState.selectedSkill) && !chatState.isSending
}

export function selectChatSkill(skill, { seedStarterPrompt = true } = {}) {
  const invocation = skillService.select(skill)
  if (!invocation) return null
  chatState.selectedSkill = invocation
  if (seedStarterPrompt && !chatState.composerText.trim() && skill.starterPrompt) {
    chatState.composerText = skill.starterPrompt
  }
  return invocation
}

export function consumeLeadingSkillCommand(text = chatState.composerText) {
  const parsed = skillService.parseComposerCommand(text, settings)
  if (!parsed.skill) return false
  chatState.selectedSkill = skillService.select(parsed.skill)
  chatState.composerText = parsed.text
  return true
}

export async function addTabAttachment(tab) {
  if (chatState.pendingAttachments.length >= MAX_TAB_ATTACHMENTS) {
    throw new Error(`You can attach up to ${MAX_TAB_ATTACHMENTS} tabs per message.`)
  }
  const attachment = await tabMentionService.select(tab)
  if (!chatState.pendingAttachments.some((item) => item.tabId === attachment.tabId)) {
    chatState.pendingAttachments = [...chatState.pendingAttachments, attachment]
  }
  return attachment
}

export function removeTabAttachment(tabId) {
  chatState.pendingAttachments = chatState.pendingAttachments.filter((item) => item.tabId !== tabId)
}

function applyTerminalResult(tabId, result) {
  const owner = readSession(tabId)
  const patch = { streamingMessage: null, error: result.error || null }
  if (result.assistant) patch.messages = [...owner.messages, result.assistant]
  writeSession(tabId, patch)
}

export async function startConversationForActiveTab() {
  const { conversation, tab } = await chatService.startConversationForActiveTab({ settings })
  if (activeTabId == null) activeTabId = tab.id
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
  const { conversation, messages } = await chatService.openConversation(id)
  writeSession(activeTabId, {
    activeConversationId: id,
    conversation,
    messages,
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

/**
 * Swap the chat view to a tab. Never touches other tabs' generations. A tab
 * with a persisted conversation but no loaded messages is hydrated lazily.
 */
export async function syncChatForActiveTab(tabId) {
  if (tabId == null || tabId === activeTabId) return chatState.conversation

  if (activeTabId != null) stashViewInto(getSession(activeTabId))
  activeTabId = tabId

  const session = getSession(tabId)
  projectSessionToView(session)

  if (!session.conversation) {
    const conversationId = chatSessionService.getConversationId(tabId)
    if (conversationId) {
      try {
        const { conversation, messages } = await chatService.openConversation(conversationId)
        session.activeConversationId = conversation.id
        session.conversation = conversation
        session.messages = messages
        // Only repaint if the user is still on this tab after the async load.
        if (activeTabId === tabId) projectSessionToView(session)
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

  // A fresh user turn makes any outstanding suggestions for older replies
  // stale. Keep completed cached suggestions, but ignore pending results.
  invalidateConversationDeepDive(conversation.id)

  const abortController = new AbortController()
  const skillInvocation = chatState.selectedSkill
    ? $state.snapshot(chatState.selectedSkill)
    : null
  const pendingAttachments = $state.snapshot(chatState.pendingAttachments)

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
    applyTerminalResult(targetTabId, result)
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
    applyTerminalResult(targetTabId, result)
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
