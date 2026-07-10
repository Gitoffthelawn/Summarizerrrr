import { describe, expect, it } from 'vitest'
import { createTabMentionService, unsupportedTabReason } from '@/services/chat/tabMentionService.js'
import { createChatSourceService } from '@/services/chat/chatSourceService.js'

describe('tab mentions', () => {
  it('keeps duplicate titles distinguishable by hostname', async () => {
    const service = createTabMentionService({ browserApi: { tabs: { query: async () => [
      { id: 1, title: 'Docs', url: 'https://one.example/docs' }, { id: 2, title: 'Docs', url: 'https://two.example/docs' },
    ] } }, isFirefox: () => false })
    const tabs = await service.listTabs('docs')
    expect(tabs.map((tab) => tab.hostname)).toEqual(['one.example', 'two.example'])
  })

  it('rejects restricted and PDF pages before capture', () => {
    expect(unsupportedTabReason('chrome://settings')).toContain('cannot be attached')
    expect(unsupportedTabReason('https://example.com/file.pdf')).toContain('PDF')
  })

  it('captures the explicit target tab without querying the active tab', async () => {
    const calls = []
    const sources = new Map()
    const sourceService = createChatSourceService({
      browserApi: { tabs: { get: async (id) => ({ id, url: 'https://target.example/page', title: 'Target' }), query: async () => { throw new Error('active tab must not be queried') } } },
      getPageContentFn: async (options) => { calls.push(options); return { type: 'webpage', content: 'Target tab content.' } },
      repository: { getSourceById: async (id) => sources.get(id), putSourceSnapshot: async (data) => { const source = { id: 'source-target', ...data }; sources.set(source.id, source); return source } },
    })
    await sourceService.captureTabSource({ tabId: 7, url: 'https://target.example/page', title: 'Target' })
    expect(calls).toEqual([expect.objectContaining({ tabId: 7, url: 'https://target.example/page' })])
  })
})
