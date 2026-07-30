import { describe, expect, it } from 'vitest'
import { conversationBundleToMarkdown } from '@/services/exportImport/conversationExportService.js'

describe('conversationBundleToMarkdown', () => {
  it('includes transcript, source provenance, capture time, and skill metadata', () => {
    const markdown = conversationBundleToMarkdown({
      conversation: { title: 'Research notes', createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T01:00:00.000Z', archived: false },
      sources: [{ id: 'source-1', title: 'Example', url: 'https://example.com/page', capturedAt: '2026-07-10T00:10:00.000Z', sourceType: 'webpage', sourceKey: 'https://example.com/page:hash' }],
      messages: [{ id: 'message-1', role: 'user', content: 'Summarize it.', createdAt: '2026-07-10T00:20:00.000Z', attachmentRefs: ['source-1'], skillInvocation: { skillId: 'summarize', skillVersion: 1 } }],
    })

    expect(markdown).toContain('## Source provenance')
    expect(markdown).toContain('captured 2026-07-10T00:10:00.000Z')
    expect(markdown).toContain('Skill: summarize (v1)')
    expect(markdown).toContain('Summarize it.')
  })
})
