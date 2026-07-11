import { describe, expect, it } from 'vitest'
import {
  abortChatTabSession,
  chatSessionHasActivity,
  getAdjacentChatTabId,
  mergeChatTabsWithBrowserTabs,
  shouldResetChatOnNavigation,
  toChatTabRuntimeDescriptor,
} from '@/services/chat/chatTabPolicy.js'

describe('chat tab policy', () => {
  it.each([
    { conversation: { id: 'conversation-1' } },
    { messages: [{ id: 'message-1' }] },
    { composerText: 'Draft' },
    { selectedSkill: { id: 'summarize' } },
    { pendingAttachments: [{ tabId: 2 }] },
    { isSending: true },
    { streamingMessage: { content: 'Partial' } },
    { error: { message: 'Failed' } },
  ])('includes a session with runtime activity: %j', (session) => {
    expect(chatSessionHasActivity(session)).toBe(true)
  })

  it('excludes an empty runtime session', () => {
    expect(
      chatSessionHasActivity({
        messages: [],
        composerText: ' ',
        pendingAttachments: [],
        contextWarnings: [],
      }),
    ).toBe(false)
  })

  it('adds the active browser tab as a non-removable placeholder and preserves browser order', () => {
    const tabs = mergeChatTabsWithBrowserTabs({
      runtimeTabs: [
        { id: 30, isLoading: true, hasError: false, removable: true },
        { id: 10, isLoading: false, hasError: true, removable: true },
      ],
      browserTabs: [
        { id: 10, title: 'First' },
        { id: 20, title: 'Current empty tab' },
        { id: 30, title: 'Third' },
        { id: 40, title: 'Unused' },
      ],
      activeBrowserTabId: 20,
    })

    expect(tabs).toEqual([
      {
        id: 10,
        title: 'First',
        isLoading: false,
        hasError: true,
        removable: true,
      },
      {
        id: 20,
        title: 'Current empty tab',
        isLoading: false,
        hasError: false,
        removable: false,
      },
      {
        id: 30,
        title: 'Third',
        isLoading: true,
        hasError: false,
        removable: true,
      },
    ])
  })

  it('maps loading, error and removable state from a session', () => {
    expect(
      toChatTabRuntimeDescriptor(7, {
        isSending: true,
        error: { message: 'Failed' },
      }),
    ).toEqual({ id: 7, isLoading: true, hasError: true, removable: true })
  })

  it('aborts only the removed tab session', () => {
    const removed = new AbortController()
    const background = new AbortController()

    expect(abortChatTabSession({ abortController: removed })).toBe(true)
    expect(removed.signal.aborted).toBe(true)
    expect(background.signal.aborted).toBe(false)
    expect(abortChatTabSession(null)).toBe(false)
  })

  it('cycles through displayed chat tabs in browser order', () => {
    const tabs = [{ id: 10 }, { id: 20 }, { id: 30 }]
    expect(getAdjacentChatTabId(tabs, 20, 1)).toBe(30)
    expect(getAdjacentChatTabId(tabs, 30, 1)).toBe(10)
    expect(getAdjacentChatTabId(tabs, 10, -1)).toBe(30)
  })

  it('resets only for a changed URL while the feature and auto-reset are enabled', () => {
    const base = {
      previousUrl: 'https://example.com/one',
      nextUrl: 'https://example.com/two',
    }
    expect(
      shouldResetChatOnNavigation({
        ...base,
        enabled: true,
        autoResetOnNavigation: true,
      }),
    ).toBe(true)
    expect(
      shouldResetChatOnNavigation({
        ...base,
        enabled: false,
        autoResetOnNavigation: true,
      }),
    ).toBe(false)
    expect(
      shouldResetChatOnNavigation({
        ...base,
        enabled: true,
        autoResetOnNavigation: false,
      }),
    ).toBe(false)
    expect(
      shouldResetChatOnNavigation({
        ...base,
        nextUrl: base.previousUrl,
        enabled: true,
        autoResetOnNavigation: true,
      }),
    ).toBe(false)
  })
})
