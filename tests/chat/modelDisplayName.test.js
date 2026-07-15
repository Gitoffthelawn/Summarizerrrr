import { describe, expect, it } from 'vitest'
import { formatModelDisplayName } from '@/lib/chat/modelDisplayName.js'

describe('formatModelDisplayName', () => {
  it('decodes a model ID without repeating provider metadata', () => {
    expect(formatModelDisplayName('deepseek-v4-pro')).toBe('Deepseek v4 pro')
  })

  it('removes model namespaces and preserves meaningful punctuation', () => {
    expect(formatModelDisplayName('meta-llama/Llama-3.3-70b_Instruct')).toBe(
      'Llama 3.3 70b Instruct'
    )
  })

  it('decodes URI-encoded model IDs safely', () => {
    expect(formatModelDisplayName('anthropic%2Fclaude-4-sonnet')).toBe('Claude 4 sonnet')
    expect(formatModelDisplayName('model%not-encoded')).toBe('Model%not encoded')
  })

  it('uses an em dash for missing model IDs', () => {
    expect(formatModelDisplayName('')).toBe('—')
    expect(formatModelDisplayName(null)).toBe('—')
  })
})
