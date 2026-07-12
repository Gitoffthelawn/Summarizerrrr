import { afterEach, describe, expect, it } from 'vitest'
import {
  checkAndResetTabState,
  clearAllTabStates,
  getOrCreateTabState,
} from '@/services/tabCacheService.js'

describe('summary tab cache policy', () => {
  afterEach(() => clearAllTabStates())

  it('keeps each tab state across tab switches and resets only the navigated tab', () => {
    const tabA = getOrCreateTabState(1)
    const tabB = getOrCreateTabState(2)
    tabA.summaryState.summary = 'Summary A'
    tabB.summaryState.summary = 'Summary B'

    expect(checkAndResetTabState(1, 'https://a.example/one')).toBe(false)
    expect(checkAndResetTabState(2, 'https://b.example/one')).toBe(false)
    expect(tabA.summaryState.summary).toBe('Summary A')
    expect(tabB.summaryState.summary).toBe('Summary B')

    expect(checkAndResetTabState(1, 'https://a.example/two')).toBe(true)
    expect(getOrCreateTabState(1).summaryState.summary).toBe('')
    expect(getOrCreateTabState(2).summaryState.summary).toBe('Summary B')
  })
})
