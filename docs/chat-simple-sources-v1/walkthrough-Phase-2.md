# Walkthrough - Phase 2: Skills carry a default source; Auto applies to every skill

Phase 2 of the `chat-simple-sources-v1` plan adds a `sourceMode` declaration to
every skill and wires it through the chat service so the capture engine fetches
the right source kind automatically. Free-form chat (no skill) behaves as
`'auto'` — transcript on YouTube, course transcript on lesson pages, webpage
elsewhere. Comments are only fetched when a skill explicitly declares
`sourceMode: 'youtubeComments'`.

## Changes Made

### 1. Skill contract & invocation snapshot

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)
- Added optional `sourceMode` property to the `ChatSkill` typedef:
  `'auto' | 'webpage' | 'youtubeTranscript' | 'youtubeComments' | 'courseTranscript'`.
  Defaults to `'auto'` when absent.

#### [skillService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/skillService.js)
- `toSkillInvocation()` now snapshots `sourceMode` (defaulting to `'auto'`) onto
  the persisted invocation record, so a saved message reproduces its source
  behaviour even if the skill registry changes later.

### 2. Built-in skill declarations

#### [builtInSkills.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/builtInSkills.js)
- Added `sourceMode` to every built-in skill:
  - `summarize`, `analyze`, `explain`, `debate`, `translate` → `'auto'`
  - `chapter-summary` → `'youtubeTranscript'`
  - `comment-analysis` → `'youtubeComments'`
  - `course-concepts` → `'courseTranscript'`
- Bumped all skill versions (`v2 → v3`, `translate v1 → v2`).

### 3. Source kind routing in chatService

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- Imported `resolveAutoSourceKind` from `sourceResolution.js`.
- Refactored `prepareGroundedAttachments()` to accept a `{ skillInvocation, onWarnings }` options object.
- Before capturing the active source, reads `skillInvocation.sourceMode`:
  - `'auto'` or absent → `resolveAutoSourceKind(activeTab.url)` (transcript on YouTube, etc.)
  - Explicit kind (e.g. `'youtubeComments'`) → passed directly to `captureActiveSource()`.
- `send()` now passes `skillInvocation` through to `prepareGroundedAttachments()`.
- Tab attachments pass their own `sourceKind` (if present) to `captureTabSource()`.

### 4. Test update

#### [skills.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/skills.test.js)
- Updated the version-assertion test to match bumped versions (`v3` for most skills, `v2` for Translate).

## Verification Results

### 1. Type Checks

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 21 warnings in 8 files
```

All warnings are pre-existing (unused CSS selectors, deprecated event directives, a11y) — none related to these changes.

### 2. Test Suite

```sh
npm test
```

Output:
```
 Test Files  28 passed (28)
      Tests  160 passed (160)
   Duration  4.52s
```

All 160 tests pass, including `chatService.test.js` (4 tests) and `skills.test.js` (7 tests).

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` — 0 errors
- [x] `npm test` — 160/160 tests pass
- [x] `toSkillInvocation()` snapshots `sourceMode` for persistence
- [x] `prepareGroundedAttachments()` resolves source kind from skill's `sourceMode`
- [x] Free-form chat (no skill / no `skillInvocation`) defaults to `'auto'`
- [x] User-created skills default to `'auto'` via `toSkillInvocation` fallback

### Still-Required Manual Verification (To Be Done by User)
- [ ] In a dev build (`npm run dev`), open a YouTube watch page and send each of these:
  1. `/Summarize` — confirm persisted user message has a `youtubeTranscript` active source
  2. `/Analyze` — same: `youtubeTranscript` source, no comments fetched
  3. `/Explain` — same: `youtubeTranscript` source
  4. A plain free-form question (no skill) — same: `youtubeTranscript` source
  5. `/Comment Analysis` — confirm it produces a `youtubeComments` source and **only** this skill fetches comments

## Known Follow-ups

Phase 3 will extend the `@` mention menu to list both tabs and a synthetic
"Comments" entry on YouTube pages, so users can explicitly attach comments
alongside auto-resolved sources.
