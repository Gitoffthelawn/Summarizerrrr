export function conversationDeepDiveKey(conversationId, assistantMessageId) {
  return `${conversationId}:${assistantMessageId}`
}

/**
 * Small in-memory cache for chat Deep Dive requests. A monotonically increasing
 * request id lets callers ignore a provider response after a newer user turn.
 */
export function createConversationDeepDiveCache(state = { entries: {} }) {
  function ensure(conversationId, assistantMessageId) {
    const key = conversationDeepDiveKey(conversationId, assistantMessageId)
    if (!state.entries[key]) {
      state.entries[key] = {
        conversationId,
        assistantMessageId,
        questions: [],
        questionHistory: [],
        isGenerating: false,
        error: null,
        requestId: 0,
      }
    }
    return state.entries[key]
  }

  return {
    get(conversationId, assistantMessageId) {
      return ensure(conversationId, assistantMessageId)
    },

    start(conversationId, assistantMessageId) {
      const entry = ensure(conversationId, assistantMessageId)
      entry.requestId += 1
      entry.isGenerating = true
      entry.error = null
      return entry.requestId
    },

    resolve(conversationId, assistantMessageId, requestId, questions) {
      const entry = ensure(conversationId, assistantMessageId)
      if (entry.requestId !== requestId) return false
      entry.questions = [...questions]
      entry.questionHistory = [...entry.questionHistory, [...questions]]
      entry.isGenerating = false
      return true
    },

    reject(conversationId, assistantMessageId, requestId, error) {
      const entry = ensure(conversationId, assistantMessageId)
      if (entry.requestId !== requestId) return false
      entry.error = error?.message || String(error || 'Failed to generate questions')
      entry.isGenerating = false
      return true
    },

    invalidateConversation(conversationId) {
      Object.values(state.entries).forEach((entry) => {
        if (entry.conversationId === conversationId && entry.isGenerating) {
          entry.requestId += 1
          entry.isGenerating = false
        }
      })
    },
  }
}
