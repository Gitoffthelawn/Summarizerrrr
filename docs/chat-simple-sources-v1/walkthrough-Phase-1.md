# Walkthrough - Phase 1: Auto source resolution in the capture engine

Phase 1 of the `chat-simple-sources-v1` plan makes the chat source capture
engine kind-aware. Instead of always hard-coding `webpageText`, captures now
automatically resolve the right source kind based on page type (YouTube →
transcript, Udemy/Coursera → course transcript, everything else → webpage text).
Comment fetching is wired in but only triggers on explicit request, never
automatically.

## Changes Made

### 1. New source resolution module

#### [sourceResolution.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/sourceResolution.js)
- Created `SOURCE_KINDS` constant enumerating all recognised source kinds:
  `webpage`, `youtubeTranscript`, `youtubeComments`, `courseTranscript`,
  `selectedText`.
- Created `resolveAutoSourceKind(url)` — uses `detectContentType(url)` to map
  `youtube → 'youtubeTranscript'`, `course → 'courseTranscript'`,
  `website → 'webpage'`. Comments are **never** returned automatically.
- Created `contentTypeForKind(kind)` — maps source kinds to the `contentType`
  string accepted by the existing `getPageContent()` in `contentService.js`:
  `youtubeTranscript → 'timestampedTranscript'`,
  `courseTranscript → 'transcript'`, `webpage → 'webpageText'`.

### 2. Kind-aware capture engine

#### [chatSourceService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatSourceService.js)
- `captureActiveSource(sourceKind?)` and `captureTabSource(attachment, sourceKind?)`
  now accept an optional `sourceKind` parameter. When omitted, they call
  `resolveAutoSourceKind(tab.url)` to auto-detect the correct kind.
- For `youtubeTranscript` / `courseTranscript` / `webpage`, delegates to
  `getPageContent()` with the correct `contentType` via `contentTypeForKind()`.
- For `youtubeComments`, calls `fetchYouTubeComments()` then
  `formatCommentsForAI()`, storing `commentLimit`, `replyLimit`, and
  `fetchedCount` in the persisted snapshot for provenance.
- Runtime cache is now keyed by `(tabId, normalizedUrl, sourceKind)` via a
  `cacheKey()` helper, so a transcript and comments for the same tab never
  collide.
- `forgetTab(tabId)` clears all cache entries for that tab across all kinds.
- `getCachedActiveSource(sourceKind?)` accepts the same optional kind parameter.
- Source key for persistence is now
  `<normalizedUrl>:<sourceKind>:<contentHash>`, passed explicitly to
  `repository.putSourceSnapshot()` along with `sourceType` set to the kind.
- Clear, kind-specific error messages for: no transcript available, comments
  disabled/empty, bridge timeout, tab navigated during capture. No silent
  fallback from a requested kind to webpage text.

### 3. Expanded source type contract

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)
- `ConversationSourceRecord.sourceType` union expanded from
  `'webpage' | 'youtube' | 'course' | 'selectedText'` to
  `'webpage' | 'youtube' | 'course' | 'youtubeTranscript' | 'youtubeComments' | 'courseTranscript' | 'selectedText'`.
- Legacy values (`'youtube'`, `'course'`) are preserved so already-persisted
  records remain valid.

## Verification Results

### 1. Type Checks

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 21 warnings in 8 files
```

All warnings are pre-existing (unused CSS selectors, deprecated event
directives, a11y) — none related to these changes.

### 2. Test Suite

```sh
npm test
```

Output:
```
 Test Files  28 passed (28)
      Tests  160 passed (160)
   Duration  3.66s
```

All 160 tests pass, including the existing `sourceResolver.test.js`,
`chatService.test.js`, and `chatStoreTabs.test.js` that exercise the capture
path.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` — 0 errors
- [x] `npm test` — 160/160 tests pass
- [x] `captureActiveSource()` and `captureTabSource()` maintain backward
  compatibility (both accept 0 args and fall back to auto-resolution)
- [x] Cache key differentiation: `(tabId, url, sourceKind)` prevents transcript
  and comments from colliding

### Still-Required Manual Verification (To Be Done by User)
- [ ] In a dev build (`npm run dev`), open a YouTube watch page, open the side
  panel chat, send a message, and inspect the persisted
  `conversationSources` record in IndexedDB:
  1. Confirm `sourceType` is `'youtubeTranscript'`
  2. Confirm `sourceKey` contains `:youtubeTranscript:`
  3. Confirm `rawContent` contains `[mm:ss]`-style timestamps (not page DOM text)
- [ ] On a non-YouTube page, confirm `sourceType` is `'webpage'` and content is
  semantic page text

## Known Follow-ups

Phase 2 will wire skill `sourceMode` defaults so that each built-in skill
declares which source kind it prefers, and the capture call in `chatService.js`
will pass that kind through to `captureActiveSource(kind)`.
