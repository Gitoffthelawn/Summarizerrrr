/**
 * Runtime-only association between browser tabs and chat conversations.
 * Conversation identity is always the persisted conversation ID; tab IDs are
 * intentionally never written to IndexedDB.
 */
export function createChatSessionService() {
  const conversationsByTab = new Map()

  return {
    getConversationId(tabId) {
      return tabId ? conversationsByTab.get(tabId) || null : null
    },

    setConversationId(tabId, conversationId) {
      if (!tabId || !conversationId) return
      conversationsByTab.set(tabId, conversationId)
    },

    clearConversationId(tabId) {
      if (tabId) conversationsByTab.delete(tabId)
    },

    clearAll() {
      conversationsByTab.clear()
    },
  }
}

export const chatSessionService = createChatSessionService()
