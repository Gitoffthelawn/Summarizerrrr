/**
 * Minimal stand-in for `stores/chatStore` in component tests. Lives in its own
 * `.svelte.js` module because `$state` may only initialize a declaration — it
 * cannot be written inline in a `vi.mock` factory.
 */
export const chatState = $state({
  messages: [{ id: 'm1', role: 'user' }],
  streamingMessage: null,
  conversation: { id: 'c1' },
  contextWarnings: [],
  error: null,
  scrollTargetMessageId: null,
  pendingScrollRestore: null,
})

export function retryChatMessage() {}
export function sendChatFollowUp() {}
