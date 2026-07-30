# Walkthrough - Phase 4: Display-first source chip with progressive override

Phase 4 of the `chat-simple-sources-v1` plan extends the source chip to show
the **resolved kind** (e.g. `This video · Transcript`, `Article · Web page`)
with zero clicks required. Clicking the chip reveals a minimal override menu
that lets the user switch the source kind for the current turn only —
progressive disclosure behind a single click.

## Changes Made

### 1. Source resolution — UI helpers

#### [sourceResolution.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/sourceResolution.js)
- Added `labelForSourceKind(kind)` — maps each `SOURCE_KINDS` value to a
  human-readable label (`'Transcript'`, `'Comments'`, `'Web page'`, etc.).
- Added `iconForSourceKind(kind)` — maps each kind to an Iconify icon string
  (play-circle for transcript, chat-bubble for comments, academic-cap for
  course, document-text for webpage).
- Added `validOverridesForUrl(url)` — returns the page-type-aware override
  options for a given URL. Always includes `Auto` and `Web page`; adds
  `Transcript` and `Comments` only for YouTube, `Transcript` only for course
  pages. Each option is `{ kind, label, icon }`.

### 2. Source chip — display-first kind label + override menu

#### [ChatSourceChip.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatSourceChip.svelte)
- New props: `kindLabel` (shown after a `·` separator), `overrides` (array of
  `{kind, label, icon}`), `activeKind` (to highlight the current selection),
  `onOverride` (callback when the user picks a different kind).
- When `overrides` is provided, the chip becomes clickable — a chevron icon
  appears and clicking reveals a dropdown menu positioned above the chip.
- The override menu shows a checkmark next to the active kind, and a
  `Remove` button at the bottom (divider-separated) when `onRemove` is set.
- Clicking outside closes the menu (`svelte:window onclick`).
- When `overrides` is absent/empty the chip renders as a simple display-only
  badge with the old `tabler:x` remove button — fully backward compatible.

### 3. Composer — wiring through kind display and override

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)
- Imports expanded from `sourceResolution.js`: `resolveAutoSourceKind`,
  `labelForSourceKind`, `iconForSourceKind`, `validOverridesForUrl`.
- Added `resolveAttachmentDisplay(attachment)` — resolves the kind, kindLabel,
  and icon for an attachment chip using the attachment's `sourceKind` or auto
  resolution from its URL.
- Added `handleAttachmentOverride(attachment, newKind)` — updates the
  attachment's `sourceKind` in place (or clears it for `'auto'`) and triggers
  reactivity by replacing the `pendingAttachments` array.
- Each attachment chip now receives `kindLabel`, `overrides`,
  `activeKind`, and `onOverride` — displaying the resolved kind and offering
  the progressive override menu.

## Verification Results

### 1. Type Checks

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 24 warnings in 9 files
```

All warnings are pre-existing (a11y labels, deprecated event directives,
unused CSS) — none related to these changes.

### 2. Test Suite

```sh
npm test
```

Output:
```
 Test Files  28 passed (28)
      Tests  160 passed (160)
   Duration  5.05s
```

All 160 tests pass. No regressions.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` — 0 errors
- [x] `npm test` — 160/160 tests pass
- [x] `ChatSourceChip` renders `kindLabel` after a `·` separator
- [x] `ChatSourceChip` shows a chevron and opens an override menu when `overrides` is provided
- [x] Override menu is page-type-aware via `validOverridesForUrl()`
- [x] `handleAttachmentOverride()` updates `sourceKind` for the next capture
- [x] Backward compatibility: chip without `overrides` prop renders as before

### Still-Required Manual Verification (To Be Done by User)
- [ ] In a dev build (`npm run dev`), on a YouTube watch page:
  1. The active-source chip reads `<video title> · Transcript` with zero clicks
  2. Clicking the chip reveals the override menu with options: Auto ✓,
     Transcript, Comments, Web page
  3. Choosing `Comments` updates the chip to `<title> · Comments`
  4. Sending a message after the override captures comments (not transcript)
- [ ] On a non-YouTube article page:
  1. The chip reads `<title> · Web page`
  2. Override menu omits Transcript and Comments (only Auto + Web page)
- [ ] On a course page:
  1. Override menu shows Auto, Transcript, Web page (no Comments)

## Known Follow-ups

Phase 5 will add error-copy audit for unavailable sources, focused unit tests
for `resolveAutoSourceKind`, `contentTypeForKind`, and the cache-key
differentiation, and run `npm run build` for a full production validation.
