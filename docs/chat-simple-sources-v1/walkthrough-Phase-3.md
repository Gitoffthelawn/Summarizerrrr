# Walkthrough - Phase 3: Unified `@` menu: tabs **and** Comments

Phase 3 of the `chat-simple-sources-v1` plan extends the `@` mention menu to
list both browser tabs and a synthetic **Comments** entry when a YouTube watch
page is in play. Selecting the Comments entry attaches a `youtubeComments`
source that flows through to the Phase 1 capture engine. No Comments entry
appears on non-YouTube pages, and plain `/Summarize` never triggers a comment
fetch.

## Changes Made

### 1. Tab mention service — non-tab source entries

#### [tabMentionService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/tabMentionService.js)
- Added `listMentionSources(query, { activeTab, attachments })` method alongside
  the existing `listTabs()`. It returns all open tabs plus synthetic Comments
  entries for YouTube watch pages.
- Comments surface when the active tab is a YouTube watch page, or when an
  already-attached YouTube tab exists. Comments are never surfaced for non-YouTube
  pages.
- Each Comments entry carries `kind: 'youtubeComments'`, `isCommentEntry: true`,
  and a `label` like `Comments · <video title>`.
- Comments entries that are already attached get a `disabledReason` to prevent
  duplicates.
- `select()` now returns `sourceKind` from `tab.kind` (if present) on the
  attachment object, and uses `tab.tabId ?? tab.id` to handle both real tabs and
  synthetic entries.

### 2. Mention menu UI — tabs + Comments with distinct icons

#### [TabMentionMenu.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/TabMentionMenu.svelte)
- Now accepts `activeTab` and `attachments` props, passed through to
  `listMentionSources()`.
- Calls `listMentionSources()` instead of `listTabs()` on open.
- Renders Comments entries with `heroicons:chat-bubble-left-right` icon and
  tab entries with the existing `heroicons:document-text` icon.
- Comments entries display their `label` (e.g. `Comments · My Video`) instead
  of `title`.
- `aria-label` updated from "Matching tabs" to "Matching sources".
- Keyboard navigation and `disabledReason` handling unchanged.

### 3. Chat store — sourceKind-aware attach/remove

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- `addTabAttachment()`: deduplication now checks `(tabId, sourceKind)` instead of
  just `tabId`, so a tab's transcript and comments can coexist as separate
  attachments.
- `removeTabAttachment(tabId, sourceKind?)`: now accepts an optional `sourceKind`
  to selectively remove a specific source type. When omitted, removes all
  attachments for that `tabId` (backward compatible).

### 4. Composer — wiring through active tab context

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)
- Derives `activeTabInfo` from `chatTabsState.activeBrowserTabId` and
  `chatState.currentUrl` to pass into `TabMentionMenu`.
- Passes `activeTab` and `attachments` props to `TabMentionMenu`.
- Comment attachment chips display `Comments · <title>` label with the chat
  bubble icon.
- `removeTabAttachment()` call now passes `attachment.sourceKind`.
- Attachment `{#each}` key updated to `${tabId}-${sourceKind || 'auto'}` for
  uniqueness when transcript and comments coexist.

### 5. Source chip — optional icon

#### [ChatSourceChip.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatSourceChip.svelte)
- Added optional `icon` prop (defaults to `'heroicons:document-text'`).
- Icon component now uses the prop value instead of a hardcoded icon string.

## Verification Results

### 1. Type Checks

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 21 warnings in 8 files
```

All warnings are pre-existing (unused CSS selectors, deprecated event directives,
a11y) — none related to these changes.

### 2. Test Suite

```sh
npm test
```

Output:
```
 Test Files  28 passed (28)
      Tests  160 passed (160)
   Duration  5.41s
```

All 160 tests pass, including `tabMentionService.test.js` (3 tests),
`chatService.test.js` (4 tests), and `chatStoreTabs.test.js` (2 tests).

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` — 0 errors
- [x] `npm test` — 160/160 tests pass
- [x] `listMentionSources()` returns tabs + Comments on YouTube, tabs only elsewhere
- [x] `select()` preserves `sourceKind` on the returned attachment
- [x] `addTabAttachment()` allows transcript + comments for same tab (no collision)
- [x] `removeTabAttachment()` with `sourceKind` removes only the targeted attachment
- [x] `TabMentionMenu` renders distinct icons for tabs vs Comments
- [x] `ChatSourceChip` uses the `icon` prop for Comments chips

### Still-Required Manual Verification (To Be Done by User)
- [ ] In a dev build (`npm run dev`), on a YouTube watch page, type `@` in the
  chat composer:
  1. Confirm the menu lists open tabs **and** a "Comments · `<video title>`" entry
     with a chat-bubble icon
  2. Select the Comments entry — confirm a chip appears labeled
     `Comments · <title>` with the chat-bubble icon
  3. Send a message — confirm the next reply reflects audience comments (the
     `youtubeComments` source is captured and grounded)
- [ ] On a non-YouTube page, type `@` — confirm no Comments entry appears
- [ ] Send `/Summarize` on any page — confirm it never triggers a comment fetch
  (only transcript/webpage grounding)
- [ ] On a YouTube page, `@`-attach a tab (not comments) — confirm the tab is
  auto-resolved to transcript via `resolveAutoSourceKind`

## Known Follow-ups

Phase 4 will extend `ChatSourceChip` with a display-first resolved-kind label
(e.g. `This video · Transcript`) and a progressive-disclosure override menu
that lets the user switch source kind on a per-turn basis.
