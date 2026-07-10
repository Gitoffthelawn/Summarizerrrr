import { describe, expect, it } from 'vitest'
import { createConversationDeepDiveCache } from '@/services/tools/conversationDeepDiveCache.js'

describe('conversation Deep Dive cache', () => {
  it('keeps questions scoped to their conversation and assistant message', () => {
    const state = { entries: {} }
    const cache = createConversationDeepDiveCache(state)
    const request = cache.start('conversation-a', 'assistant-1')

    expect(cache.resolve('conversation-a', 'assistant-1', request, ['Question A?'])).toBe(true)
    expect(cache.get('conversation-a', 'assistant-1').questions).toEqual(['Question A?'])
    expect(cache.get('conversation-a', 'assistant-2').questions).toEqual([])
    expect(cache.get('conversation-b', 'assistant-1').questions).toEqual([])
  })

  it('ignores a stale response after a new user turn invalidates the conversation', () => {
    const cache = createConversationDeepDiveCache({ entries: {} })
    const request = cache.start('conversation-a', 'assistant-1')
    cache.invalidateConversation('conversation-a')

    expect(cache.resolve('conversation-a', 'assistant-1', request, ['Stale?'])).toBe(false)
    expect(cache.get('conversation-a', 'assistant-1')).toMatchObject({
      questions: [],
      isGenerating: false,
    })
  })
})
