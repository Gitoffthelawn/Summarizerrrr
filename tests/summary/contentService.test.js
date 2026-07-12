import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn(),
    query: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
}))

vi.mock('wxt/browser', () => ({ browser: browserMock }))

import { getPageContent } from '@/services/contentService.js'

describe('contentService webpage extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserMock.tabs.get.mockResolvedValue({
      id: 22,
      url: 'https://example.com/article',
      title: 'Article',
    })
  })

  it('prefers Defuddle cleaned content over side-menu and full DOM text', async () => {
    const cleanedArticle = '# Article\n\nComplete article content '.repeat(20)

    browserMock.scripting.executeScript
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { result: { content: cleanedArticle, method: 'defuddle' } },
      ])

    await expect(
      getPageContent({ tabId: 22, contentType: 'webpageText' })
    ).resolves.toEqual({ type: 'webpage', content: cleanedArticle })
  })

  it('falls back to DOM extraction when both semantic scripts cannot be injected', async () => {
    const fullPage = 'Complete fallback article content '.repeat(20)

    browserMock.scripting.executeScript
      .mockRejectedValueOnce(new Error('Injection failed'))
      .mockRejectedValueOnce(new Error('Fallback injection failed'))
      .mockResolvedValueOnce([{ result: fullPage }])

    await expect(
      getPageContent({ tabId: 22, contentType: 'webpageText' })
    ).resolves.toEqual({ type: 'webpage', content: fullPage })
  })
})
