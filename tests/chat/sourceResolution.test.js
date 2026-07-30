import { describe, expect, it } from 'vitest'
import {
  SOURCE_KINDS,
  resolveAutoSourceKind,
  contentTypeForKind,
  labelForSourceKind,
  iconForSourceKind,
} from '@/services/chat/sourceResolution.js'
import { createChatSourceService } from '@/services/chat/chatSourceService.js'

// ---------------------------------------------------------------------------
// resolveAutoSourceKind
// ---------------------------------------------------------------------------
describe('resolveAutoSourceKind', () => {
  it('returns youtubeTranscript for a YouTube watch URL', () => {
    expect(resolveAutoSourceKind('https://www.youtube.com/watch?v=abc123')).toBe('youtubeTranscript')
  })

  it('returns courseTranscript for a Udemy lesson URL', () => {
    expect(resolveAutoSourceKind('https://www.udemy.com/course/my-course/learn/lecture/12345')).toBe('courseTranscript')
  })

  it('returns courseTranscript for a Coursera lesson URL', () => {
    expect(resolveAutoSourceKind('https://www.coursera.org/learn/ml/lecture/abc')).toBe('courseTranscript')
  })

  it('returns webpage for a generic URL', () => {
    expect(resolveAutoSourceKind('https://example.com/article')).toBe('webpage')
  })

  it('never returns youtubeComments', () => {
    // Comments must always be explicitly requested
    const urls = [
      'https://www.youtube.com/watch?v=abc',
      'https://example.com',
      'https://www.udemy.com/course/x/learn/lecture/1',
    ]
    for (const url of urls) {
      expect(resolveAutoSourceKind(url)).not.toBe('youtubeComments')
    }
  })

  it('falls back to webpage for null/empty input', () => {
    expect(resolveAutoSourceKind('')).toBe('webpage')
    expect(resolveAutoSourceKind(null)).toBe('webpage')
  })
})

// ---------------------------------------------------------------------------
// contentTypeForKind
// ---------------------------------------------------------------------------
describe('contentTypeForKind', () => {
  it('maps youtubeTranscript to timestampedTranscript', () => {
    expect(contentTypeForKind('youtubeTranscript')).toBe('timestampedTranscript')
  })

  it('maps courseTranscript to transcript', () => {
    expect(contentTypeForKind('courseTranscript')).toBe('transcript')
  })

  it('maps webpage to webpageText', () => {
    expect(contentTypeForKind('webpage')).toBe('webpageText')
  })

  it('defaults to webpageText for unknown kinds', () => {
    expect(contentTypeForKind('unknownKind')).toBe('webpageText')
  })
})

// ---------------------------------------------------------------------------
// labelForSourceKind
// ---------------------------------------------------------------------------
describe('labelForSourceKind', () => {
  it.each([
    ['youtubeTranscript', 'Transcript'],
    ['youtubeComments', 'Comments'],
    ['courseTranscript', 'Transcript'],
    ['selectedText', 'Selection'],
    ['webpage', 'Web page'],
  ])('maps %s → %s', (kind, expected) => {
    expect(labelForSourceKind(kind)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// iconForSourceKind
// ---------------------------------------------------------------------------
describe('iconForSourceKind', () => {
  it('returns a non-empty string for every known kind', () => {
    for (const kind of Object.values(SOURCE_KINDS)) {
      const icon = iconForSourceKind(kind)
      expect(icon).toBeTruthy()
      expect(typeof icon).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// Cache-key differentiation (tabId, url, sourceKind)
// ---------------------------------------------------------------------------
describe('chatSourceService cache-key differentiation', () => {
  function makeService({ content = 'Some content', sourceId = 'src-1' } = {}) {
    let putCalls = 0
    const repository = {
      async putSourceSnapshot(data) {
        putCalls += 1
        return { id: `${sourceId}-${putCalls}`, ...data }
      },
      async getSourceById(id) {
        return { id, condensedContent: content }
      },
    }
    const browserApi = {
      tabs: {
        async query() {
          return [{ id: 10, url: 'https://www.youtube.com/watch?v=abc', title: 'Video' }]
        },
        async get(tabId) {
          return { id: tabId, url: 'https://www.youtube.com/watch?v=abc', title: 'Video' }
        },
      },
    }
    const service = createChatSourceService({
      browserApi,
      getPageContentFn: async () => ({ content }),
      fetchCommentsFn: async () => ({ comments: [{ text: 'Great!' }], metadata: {} }),
      formatCommentsFn: () => 'Formatted comments',
      repository,
    })
    return { service, getPutCalls: () => putCalls }
  }

  it('caches transcript and comments independently for the same tab', async () => {
    const { service } = makeService()

    // First capture: transcript
    const transcript = await service.captureActiveSource('youtubeTranscript')
    expect(transcript.source.id).toBe('src-1-1')

    // Second capture: comments (different kind)
    const comments = await service.captureActiveSource('youtubeComments')
    expect(comments.source.id).toBe('src-1-2')

    // Third capture: transcript again → should hit cache, not re-extract
    const transcriptAgain = await service.captureActiveSource('youtubeTranscript')
    expect(transcriptAgain.source.id).toBe('src-1-1')

    // Fourth capture: comments again → should hit cache
    const commentsAgain = await service.captureActiveSource('youtubeComments')
    expect(commentsAgain.source.id).toBe('src-1-2')
  })

  it('does not return a transcript cache entry when comments are requested', async () => {
    const { service, getPutCalls } = makeService()

    await service.captureActiveSource('youtubeTranscript')
    expect(getPutCalls()).toBe(1)

    // Requesting comments must produce a separate capture, not return the transcript
    await service.captureActiveSource('youtubeComments')
    expect(getPutCalls()).toBe(2)
  })
})
