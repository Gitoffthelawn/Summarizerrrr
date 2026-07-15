import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/settingsStore.svelte.js', () => ({
  settings: { selectedProvider: 'gemini', tools: {}, chat: { provider: 'gemini', model: 'gemini-3-flash-preview', quickModels: [], defaultReasoningLevel: 'provider-default' } },
}))

vi.mock('@/services/chat/chatService.js', () => ({
  chatService: {
    startConversationForActiveTab: vi.fn(async ({ settings, modelOverride } = {}) => ({
      conversation: {
        id: 'conv-new',
        providerId: modelOverride?.provider || settings?.chat?.provider || 'gemini',
        modelId: modelOverride?.model || settings?.chat?.model || 'gemini-3-flash-preview',
      },
      tab: { id: 101 }, // TAB_A — must match the tab synced in the test
    })),
  },
}))

vi.mock('@/lib/db/conversationRepository.js', () => ({
  conversationRepository: {
    updateConversationMetadata: vi.fn(async (id, metadata) => ({
      id,
      ...metadata,
      updatedAt: new Date().toISOString(),
    })),
  },
}))

vi.mock('@/services/chat/chatSourceService.js', () => ({
  chatSourceService: {
    captureTabSource: vi.fn(),
  },
}))

import {
  chatState,
  handleChatBrowserTabRemoved,
  handleChatTabNavigation,
  syncChatForActiveTab,
  updateChatTabMetadata,
  setChatModel,
  getEffectiveChatModel,
  startConversationForActiveTab,
} from '@/stores/chatStore.svelte.js'
import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { chatService } from '@/services/chat/chatService.js'
import { chatSourceService } from '@/services/chat/chatSourceService.js'
import { resolveConversationModel } from '@/lib/providers/featureModelResolver.js'
import { settings } from '@/stores/settingsStore.svelte.js'

const TAB_A = 101
const TAB_B = 202
const TAB_C = 303

afterEach(() => {
  handleChatBrowserTabRemoved(TAB_A)
  handleChatBrowserTabRemoved(TAB_B)
  handleChatBrowserTabRemoved(TAB_C)
  vi.clearAllMocks()
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

  it('isolates reasoning level per browser tab', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    chatState.reasoningLevel = 'high'

    await syncChatForActiveTab(TAB_B, { url: 'https://b.example' })
    expect(chatState.reasoningLevel).toBeNull() // fresh tab starts with null sentinel

    chatState.reasoningLevel = 'low'

    await syncChatForActiveTab(TAB_A)
    expect(chatState.reasoningLevel).toBe('high') // Tab A retains its own value

    await syncChatForActiveTab(TAB_B)
    expect(chatState.reasoningLevel).toBe('low') // Tab B retains its own value
  })

  it('null sentinel resolves to the global default at read time (cold-start)', async () => {
    // Import effectiveReasoningLevel to test resolution
    const { effectiveReasoningLevel } = await import('@/lib/api/reasoningConfig.js')

    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    // Session starts with null sentinel
    expect(chatState.reasoningLevel).toBeNull()

    // Before settings are loaded, null resolves to provider-default
    expect(effectiveReasoningLevel(chatState.reasoningLevel, {})).toBe('provider-default')
    expect(effectiveReasoningLevel(chatState.reasoningLevel, null)).toBe('provider-default')

    // After settings load with a non-Auto default, null resolves to it
    const settingsWithDefault = { chat: { defaultReasoningLevel: 'high' } }
    expect(effectiveReasoningLevel(chatState.reasoningLevel, settingsWithDefault)).toBe('high')

    // Once the user explicitly picks a level, it overrides the default
    chatState.reasoningLevel = 'medium'
    expect(effectiveReasoningLevel(chatState.reasoningLevel, settingsWithDefault)).toBe('medium')
  })
})

describe('per-tab model state (Phase 3)', () => {
  it('isolates modelOverride per browser tab', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    chatState.modelOverride = { provider: 'chatgpt', model: 'gpt-5' }

    await syncChatForActiveTab(TAB_B, { url: 'https://b.example' })
    expect(chatState.modelOverride).toBeNull() // fresh tab

    chatState.modelOverride = { provider: 'cerebras', model: 'gpt-oss-120b' }

    await syncChatForActiveTab(TAB_A)
    expect(chatState.modelOverride).toEqual({ provider: 'chatgpt', model: 'gpt-5' })

    await syncChatForActiveTab(TAB_B)
    expect(chatState.modelOverride).toEqual({ provider: 'cerebras', model: 'gpt-oss-120b' })
  })

  it('setChatModel with active conversation persists via updateConversationMetadata', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    chatState.conversation = { id: 'conv-1', providerId: 'gemini', modelId: 'gemini-3-flash-preview' }
    chatState.activeConversationId = 'conv-1'

    await setChatModel({ provider: 'chatgpt', model: 'gpt-5' })

    expect(conversationRepository.updateConversationMetadata).toHaveBeenCalledWith(
      'conv-1',
      { providerId: 'chatgpt', modelId: 'gpt-5' }
    )
    expect(chatState.conversation.providerId).toBe('chatgpt')
    expect(chatState.conversation.modelId).toBe('gpt-5')
  })

  it('setChatModel before a conversation stores override, startConversation consumes it', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    expect(chatState.modelOverride).toBeNull()

    await setChatModel({ provider: 'deepseek', model: 'deepseek-chat' })
    expect(chatState.modelOverride).toEqual({ provider: 'deepseek', model: 'deepseek-chat' })

    await startConversationForActiveTab()

    // modelOverride consumed and cleared
    expect(chatState.modelOverride).toBeNull()
    // chatService was called with the override
    expect(chatService.startConversationForActiveTab).toHaveBeenCalledWith(
      expect.objectContaining({
        modelOverride: { provider: 'deepseek', model: 'deepseek-chat' },
      })
    )
    // conversation stamped with the override
    expect(chatState.conversation.providerId).toBe('deepseek')
    expect(chatState.conversation.modelId).toBe('deepseek-chat')
  })

  it('setChatModel is a no-op while isSending', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })
    chatState.conversation = { id: 'conv-2', providerId: 'gemini', modelId: 'gemini-3-flash-preview' }
    chatState.isSending = true

    await setChatModel({ provider: 'chatgpt', model: 'gpt-5' })

    expect(conversationRepository.updateConversationMetadata).not.toHaveBeenCalled()
    expect(chatState.conversation.providerId).toBe('gemini')
    expect(chatState.conversation.modelId).toBe('gemini-3-flash-preview')

    // Clean up
    chatState.isSending = false
  })

  it('getEffectiveChatModel resolves conversation → override → settings.chat', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })

    // No conversation, no override → falls back to settings.chat
    let effective = getEffectiveChatModel()
    expect(effective.provider).toBe('gemini')
    expect(effective.model).toBe('gemini-3-flash-preview')

    // Set modelOverride → override wins
    chatState.modelOverride = { provider: 'chatgpt', model: 'gpt-5' }
    effective = getEffectiveChatModel()
    expect(effective.provider).toBe('chatgpt')
    expect(effective.model).toBe('gpt-5')

    // Set conversation → conversation wins
    chatState.conversation = { id: 'conv-3', providerId: 'deepseek', modelId: 'deepseek-chat' }
    effective = getEffectiveChatModel()
    expect(effective.provider).toBe('deepseek')
    expect(effective.model).toBe('deepseek-chat')
  })

  it('getEffectiveChatModel keeps a stored-provider/no-model conversation on its own provider', async () => {
    await syncChatForActiveTab(TAB_A, { url: 'https://a.example' })

    // A stale override must not leak into the label for a conversation that
    // already has a stored provider — the request path would ignore it.
    chatState.modelOverride = { provider: 'chatgpt', model: 'gpt-5' }

    // Legacy conversation: stamped before models were recorded.
    chatState.conversation = { id: 'conv-legacy', providerId: 'cerebras', modelId: null }

    const effective = getEffectiveChatModel()
    // Must report cerebras — not settings.chat's gemini, not the override.
    expect(effective.provider).toBe('cerebras')
    expect(effective.model).not.toBe('gemini-3-flash-preview')
    expect(effective.model).not.toBe('gpt-5')
    // And must agree with what the request path would route to.
    const routed = resolveConversationModel(chatState.conversation, settings)
    expect(effective).toEqual({ provider: routed.providerId, model: routed.modelId })
  })
})

describe('active-tab identity — title + favicon (Phase 1)', () => {
  it('two browser tabs keep independent currentTitle/currentFavIconUrl', async () => {
    await syncChatForActiveTab(TAB_A, {
      url: 'https://a.example',
      title: 'Page A',
      favIconUrl: 'https://a.example/favicon.ico',
    })
    expect(chatState.currentTitle).toBe('Page A')
    expect(chatState.currentFavIconUrl).toBe('https://a.example/favicon.ico')

    await syncChatForActiveTab(TAB_B, {
      url: 'https://b.example',
      title: 'Page B',
      favIconUrl: 'https://b.example/favicon.ico',
    })
    expect(chatState.currentTitle).toBe('Page B')
    expect(chatState.currentFavIconUrl).toBe('https://b.example/favicon.ico')

    // Switch back to Tab A — its title/favicon should be restored
    await syncChatForActiveTab(TAB_A)
    expect(chatState.currentTitle).toBe('Page A')
    expect(chatState.currentFavIconUrl).toBe('https://a.example/favicon.ico')

    // Switch back to Tab B — its title/favicon should be restored
    await syncChatForActiveTab(TAB_B)
    expect(chatState.currentTitle).toBe('Page B')
    expect(chatState.currentFavIconUrl).toBe('https://b.example/favicon.ico')
  })

  it('a later syncChatForActiveTab with a new title overwrites the old one (not sticky)', async () => {
    await syncChatForActiveTab(TAB_A, {
      url: 'https://a.example',
      title: 'Loading…',
      favIconUrl: null,
    })
    expect(chatState.currentTitle).toBe('Loading…')

    // Same tab, title changes — must overwrite (unlike url which is sticky)
    await syncChatForActiveTab(TAB_A, {
      url: 'https://a.example',
      title: 'Actual Page Title',
      favIconUrl: 'https://a.example/favicon.ico',
    })
    expect(chatState.currentTitle).toBe('Actual Page Title')
    expect(chatState.currentFavIconUrl).toBe('https://a.example/favicon.ico')
  })

  it('updateChatTabMetadata on an inactive tab updates that snapshot without touching the active view', async () => {
    await syncChatForActiveTab(TAB_A, {
      url: 'https://a.example',
      title: 'Page A',
      favIconUrl: 'https://a.example/favicon.ico',
    })
    await syncChatForActiveTab(TAB_B, {
      url: 'https://b.example',
      title: 'Page B',
      favIconUrl: 'https://b.example/favicon.ico',
    })

    // Active tab is now TAB_B. Update TAB_A's metadata in the background.
    updateChatTabMetadata(TAB_A, {
      title: 'Page A (Updated)',
      favIconUrl: 'https://a.example/new-favicon.ico',
    })

    // Active view (TAB_B) must be untouched
    expect(chatState.currentTitle).toBe('Page B')
    expect(chatState.currentFavIconUrl).toBe('https://b.example/favicon.ico')

    // Switching back to TAB_A shows the updated snapshot
    await syncChatForActiveTab(TAB_A)
    expect(chatState.currentTitle).toBe('Page A (Updated)')
    expect(chatState.currentFavIconUrl).toBe('https://a.example/new-favicon.ico')
  })

  it('no-scrape guard: captureTabSource is never called by sync/update', async () => {
    // The core regression test: switching tabs and updating metadata must
    // never trigger content extraction (chatSourceService.captureTabSource).
    await syncChatForActiveTab(TAB_A, {
      url: 'https://a.example',
      title: 'Page A',
      favIconUrl: 'https://a.example/favicon.ico',
    })
    await syncChatForActiveTab(TAB_B, {
      url: 'https://b.example',
      title: 'Page B',
      favIconUrl: null,
    })
    await syncChatForActiveTab(TAB_A)
    await syncChatForActiveTab(TAB_B, {
      title: 'Page B Updated',
    })
    updateChatTabMetadata(TAB_A, { title: 'Page A v2' })
    updateChatTabMetadata(TAB_B, { favIconUrl: 'https://b.example/favicon.ico' })

    expect(chatSourceService.captureTabSource).not.toHaveBeenCalled()
  })
})
