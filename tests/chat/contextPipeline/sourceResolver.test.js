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
})
