import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/settingsStore.svelte.js', () => ({
  settings: { selectedProvider: 'gemini', tools: {} },
}))

vi.mock('@/services/chat/chatService.js', () => ({
  chatService: {},
}))

vi.mock('@/lib/db/conversationRepository.js', () => ({
  conversationRepository: {},
}))
import {
  chatState,
  handleChatBrowserTabRemoved,
  handleChatTabNavigation,
  syncChatForActiveTab,
} from '@/stores/chatStore.svelte.js'

const TAB_A = 101
const TAB_B = 202
const TAB_C = 303

afterEach(() => {
  handleChatBrowserTabRemoved(TAB_A)
  handleChatBrowserTabRemoved(TAB_B)
  handleChatBrowserTabRemoved(TAB_C)
})

describe('chat store tab ownership', () => {
  it('projects an independent chat session for each browser tab', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    chatState.conversation = { id: 'conversation-a' }
    chatState.activeConversationId = 'conversation-a'
    chatState.messages = [{ id: 'message-a' }]
    chatState.composerText = 'Draft A'

    await syncChatForActiveTab(TAB_B, { url: 'https://b.example' })
    expect(chatState.conversation).toBeNull()
    expect(chatState.messages).toEqual([])
    expect(chatState.composerText).toBe('')

    chatState.conversation = { id: 'conversation-b' }
    chatState.activeConversationId = 'conversation-b'
    chatState.composerText = 'Draft B'

    await syncChatForActiveTab(TAB_A)
    expect(chatState.conversation.id).toBe('conversation-a')
    expect(chatState.messages).toEqual([{ id: 'message-a' }])
    expect(chatState.composerText).toBe('Draft A')
  })

  it('keeps a mentioned tab as an attachment instead of transferring ownership', async () => {
    await syncChatForActiveTab(TAB_C, { url: 'https://c.example/one' })
    chatState.conversation = { id: 'conversation-c' }
    chatState.activeConversationId = 'conversation-c'
    chatState.pendingAttachments = [{ tabId: TAB_B, title: 'Tab B' }]

    handleChatTabNavigation(TAB_C, 'https://c.example/two')
    expect(chatState.conversation.id).toBe('conversation-c')
    expect(chatState.pendingAttachments).toEqual([{ tabId: TAB_B, title: 'Tab B' }])

    await syncChatForActiveTab(TAB_B, { url: 'https://b.example' })
    expect(chatState.conversation).toBeNull()
    expect(chatState.pendingAttachments).toEqual([])

    await syncChatForActiveTab(TAB_C)
    expect(chatState.conversation.id).toBe('conversation-c')
    expect(chatState.pendingAttachments).toEqual([{ tabId: TAB_B, title: 'Tab B' }])
  })
})
