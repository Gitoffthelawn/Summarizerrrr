import { detectContentType } from '@/lib/utils/contentTypeDetector.js'

/**
 * All recognised source kinds for the chat capture engine.
 *
 * @readonly
 * @enum {string}
 */
export const SOURCE_KINDS = /** @type {const} */ ({
  webpage: 'webpage',
  youtubeTranscript: 'youtubeTranscript',
  youtubeComments: 'youtubeComments',
  courseTranscript: 'courseTranscript',
  selectedText: 'selectedText',
})

/**
 * Maps a page URL to the source kind that should be captured automatically.
 *
 * Comments are **never** returned here — they must be explicitly requested.
 *
 * @param {string} url
 * @returns {'webpage' | 'youtubeTranscript' | 'courseTranscript'}
 */
export function resolveAutoSourceKind(url) {
  const pageType = detectContentType(url)
  switch (pageType) {
    case 'youtube':
      return SOURCE_KINDS.youtubeTranscript
    case 'course':
      return SOURCE_KINDS.courseTranscript
    default:
      return SOURCE_KINDS.webpage
  }
}

/**
 * Maps a source kind to the `contentType` value accepted by
 * `getPageContent()` in `src/services/contentService.js`.
 *
 * @param {string} kind  One of {@link SOURCE_KINDS} (excluding `youtubeComments`
 *   and `selectedText`, which bypass `getPageContent`).
 * @returns {'webpageText' | 'timestampedTranscript' | 'transcript'}
 */
export function contentTypeForKind(kind) {
  switch (kind) {
    case SOURCE_KINDS.youtubeTranscript:
      return 'timestampedTranscript'
    case SOURCE_KINDS.courseTranscript:
      return 'transcript'
    case SOURCE_KINDS.webpage:
    default:
      return 'webpageText'
  }
}

/**
 * Human-readable label for a source kind (used in the chip UI).
 *
 * @param {string} kind  One of {@link SOURCE_KINDS}.
 * @returns {string}
 */
export function labelForSourceKind(kind) {
  switch (kind) {
    case SOURCE_KINDS.youtubeTranscript:
      return 'Transcript'
    case SOURCE_KINDS.youtubeComments:
      return 'Comments'
    case SOURCE_KINDS.courseTranscript:
      return 'Transcript'
    case SOURCE_KINDS.selectedText:
      return 'Selection'
    case SOURCE_KINDS.webpage:
    default:
      return 'Web page'
  }
}

/**
 * Short label for the *active page* source chip (as opposed to the kind label).
 * e.g. `This video` on YouTube, `This lesson` on a course, `This page` else.
 *
 * @param {string} url
 * @returns {string}
 */
export function activeSourceLabelForUrl(url) {
  const pageType = detectContentType(url)
  switch (pageType) {
    case 'youtube':
      return 'This video'
    case 'course':
      return 'This lesson'
    default:
      return 'This page'
  }
}

/**
 * Iconify icon string for a source kind.
 *
 * @param {string} kind  One of {@link SOURCE_KINDS}.
 * @returns {string}
 */
export function iconForSourceKind(kind) {
  switch (kind) {
    case SOURCE_KINDS.youtubeTranscript:
      return 'heroicons:play-circle'
    case SOURCE_KINDS.youtubeComments:
      return 'heroicons:chat-bubble-left-right'
    case SOURCE_KINDS.courseTranscript:
      return 'heroicons:academic-cap'
    case SOURCE_KINDS.selectedText:
      return 'heroicons:cursor-arrow-rays'
    case SOURCE_KINDS.webpage:
    default:
      return 'heroicons:document-text'
  }
}
