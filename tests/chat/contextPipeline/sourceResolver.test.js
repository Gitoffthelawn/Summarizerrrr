import { describe, expect, it } from 'vitest'
import { resolveSources } from '@/lib/chat/contextPipeline/sourceResolver.js'

describe('sourceResolver', () => {
  it('lazily captures an unresolved active source and returns its provenance', async () => {
    const captureSource = async () => ({
      id: 'captured-source',
      sourceKey: 'https://example.com:hash',
      normalizedUrl: 'https://example.com',
      title: 'Captured page',
      capturedAt: '2026-07-10T00:00:00.000Z',
      rawContent: 'Full page content',
      condensedContent: 'Condensed page content',
    })

    const result = await resolveSources({
      conversationSourceRefs: [{ sourceId: 'missing-active-source', kind: 'active' }],
      repository: { getSourceById: async () => undefined },
      captureSource,
    })

    expect(result.unresolvedRefs).toEqual([])
    expect(result.conversationSources[0]).toMatchObject({
      sourceId: 'captured-source',
      isActive: true,
      rawContent: 'Full page content',
      condensedContent: 'Condensed page content',
      provenance: {
        sourceKey: 'https://example.com:hash',
        normalizedUrl: 'https://example.com',
      },
    })
  })

  it('does not include the same source twice when it is both a conversation source and a re-attached source', async () => {
    const sources = {
      A: {
        id: 'A',
        sourceKey: 'https://example.com:hash',
        normalizedUrl: 'https://example.com',
        title: 'Active tab',
        rawContent: 'Full page content',
        condensedContent: 'Condensed page content',
      },
    }

    const result = await resolveSources({
      // Carried in from history and re-attached on the current turn (active tab).
      conversationSourceRefs: ['A'],
      newAttachmentRefs: ['A'],
      repository: { getSourceById: async (id) => sources[id] },
    })

    const allIds = [
      ...result.conversationSources.map((s) => s.sourceId),
      ...result.attachmentSources.map((s) => s.sourceId),
    ]
    expect(allIds).toEqual(['A'])
    expect(result.conversationSources).toHaveLength(1)
    expect(result.attachmentSources).toHaveLength(0)
  })
})
