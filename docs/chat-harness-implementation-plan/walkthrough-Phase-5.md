# Walkthrough - Phase 5: Active-Tab Chat UI

Phase 5 of `chat-harness-implementation-plan.md` made chat the default side-panel surface, wiring the Phase 4 `chatStore`/`chatService` orchestration into a new set of Svelte 5 components under `src/components/chat/`, while keeping the existing summary UI reachable as a labeled legacy view.

## Changes Made

### 1. New chat components

#### [ChatShell.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatShell.svelte)
- Top-level composition: header, message list or empty state, context warnings/error, composer.
- Delegates all persistence/orchestration to `chatStore.svelte.js`; only renders state and forwards callbacks.

#### [ChatHeader.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatHeader.svelte)
- Shows the active conversation title with inline rename (click title → edit → Enter/blur commits via `renameConversation`).
- Hosts `ConversationMenu` for new chat, rename, archive, and the legacy escape hatch.

#### [ConversationMenu.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ConversationMenu.svelte)
- `bits-ui` `DropdownMenu`, following the same pattern as the existing `ActionDropdownMenu.svelte`.
- Lazily loads recent conversations (via a new `listRecentConversations()` store helper) only when opened, and lets the user reopen one or jump to the "Legacy summary view".

#### [ChatEmptyState.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatEmptyState.svelte)
- Shows the active tab title (`tabTitleStore`) and focuses the composer on request. No live-tab reads happen here; capture stays lazy per the locked v1 scope.

#### [ChatMessageList.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatMessageList.svelte)
- Renders persisted messages plus the transient streaming message.
- Auto-scrolls only when the user is already within 120px of the bottom, per the Phase 5 UX spec.
- Resolves the retry target for an aborted/error assistant message by walking back to the preceding user message (falling back to the assistant record's own `retryOfMessageId` when present, e.g. after a prior retry).

#### [ChatMessage.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatMessage.svelte)
- User bubbles render as plain pre-wrapped text (never markdown). Assistant messages reuse the existing `StreamingMarkdownV2` component so behavior/styling matches the legacy summary display.
- Marks aborted/error messages without discarding partial text, and offers copy/retry actions once streaming finishes.

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)
- Multiline textarea; Enter sends, Shift+Enter inserts a newline.
- The send button becomes a Stop button while `chatState.isSending` is true, calling `stopGeneration()`.
- Renders `ChatSkillChip`/`ChatSourceChip` for the currently selected skill/pending attachments (skill picker itself remains out of scope until Phase 6A).

#### [ChatSourceChip.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatSourceChip.svelte), [ChatSkillChip.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatSkillChip.svelte), [ChatContextWarning.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatContextWarning.svelte)
- Small presentational pieces reused by the composer/shell. `ChatContextWarning` renders `chatState.contextWarnings` with `role="status"`/`aria-live="polite"` so warnings are announced without treating every streamed token as a live region update.

### 2. Store helper for read-only conversation listing

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- Added `listRecentConversations({ limit })`, a thin wrapper over `conversationRepository.listConversations()`, so `ConversationMenu.svelte` never imports the repository/IndexedDB layer directly.
- Fixed a Svelte 5 build error latent since Phase 4: `export const canSendChat = $derived(...)` is not legal at module scope (`derived_invalid_export`). This only surfaced now because Phase 4's tests run under Vitest's Node environment and never exercised the real `vite-plugin-svelte` module compiler; Phase 5 is the first phase to import `chatStore.svelte.js` into an actual page bundle. Converted it to an exported function `canSendChat()` and updated `ChatComposer.svelte` to call it, matching the existing `needsApiKeySetup()()` getter-function convention already used elsewhere in the side panel.

### 3. Side panel composition

#### [App.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/App.svelte)
- Added a `showLegacySummary` flag (`$state(false)`), so chat is the default surface and the old summary grid becomes a fully preserved `{#if showLegacySummary}` branch — no logic inside it was changed.
- Added an `$effect` that resolves the active tab, calls `restoreConversationForActiveTab(tabId)` to reattach a runtime chat session for that tab, and falls back to `closeConversation()` when no session is mapped yet. Also listens to `browser.tabs.onActivated` to re-sync when the user switches tabs, matching Phase 4's "runtime tab-to-conversation mapping" contract (`tabId` is never treated as conversation identity, only used to look up a previously mapped `conversationId`).
- The chat branch keeps a minimal shared top bar (archive shortcut, settings button) and gates on `needsApiKeySetup()()` before mounting `ChatShell`, reusing `ApiKeySetupPrompt` exactly as the legacy view does.
- `Noti`, the fixed bottom scroll-fade gradient, and the Deep Dive FAB/dialog (which are keyed to `summaryState`/`deepDiveState`, not chat) now only render in the legacy branch; Deep Dive integration with chat is explicitly Phase 6B scope.

## Verification Results

### 1. Type checks

```sh
npm run check
```

Output:

```text
svelte-check found 0 errors and 20 warnings in 7 files
```

Same warning count/file set as the Phase 4 walkthrough baseline — no new warnings introduced by the Phase 5 files.

### 2. Automated tests

```sh
npm test
```

Output:

```text
Test Files  6 passed (6)
     Tests  30 passed (30)
```

No new tests were added in this phase (it is a pure UI-composition phase over already-tested Phase 1-4 logic); existing suites remain green.

### 3. Production builds

```sh
npm run build
npm run build:firefox
```

Output:

```text
✔ Finished in 12.9 s   (chrome-mv3, Σ Total size: 9.9 MB)
✔ Finished in 13.6 s   (firefox-mv2, Σ Total size: 9.91 MB)
```

Both browser targets built successfully, confirming the fix to `chatStore.svelte.js` resolved the `derived_invalid_export` error that `npm run check` alone did not catch.

### 4. Diff and syntax validation

```sh
git diff --check
node --check src/stores/chatStore.svelte.js
```

Both completed with no output/errors.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` passes with the same pre-existing warning baseline.
- [x] `npm test` — all 30 existing tests still pass.
- [x] `npm run build` and `npm run build:firefox` both succeed.
- [x] `git diff --check` and `node --check` on the touched non-Svelte JS file are clean.

### Still-Required Manual Verification (To Be Done by User)

Side-panel UI cannot be exercised through a plain browser preview because it depends on real extension APIs (`browser.tabs`, side panel host) that only exist once loaded as an unpacked extension — this matches the project's own documented manual-testing process (`CLAUDE.md` → Testing).

1. Run `npm run dev` (or use the already-built `.output/chrome-mv3` / `.output/firefox-mv2` folders) and load the extension unpacked in Chrome/Firefox developer mode.
2. Open the side panel on a normal webpage, YouTube video, and a course page:
   - Confirm the chat surface (not the old summary grid) is shown by default.
   - Confirm the empty state shows the current tab's title and focuses the composer.
   - Send a message with no prior summary; confirm the active page is captured lazily (no "summarize first" requirement) and a streamed reply appears.
3. Click Stop mid-stream; confirm the partial response is kept and marked "Stopped", and that a new send is possible immediately after.
4. Force a provider error (e.g. temporarily invalid API key) and confirm the Retry control on the assistant message resends using the original user turn.
5. Switch tabs mid-conversation and back; confirm the side panel restores the correct chat session per tab without rebinding stored source identity.
6. Reload the side panel after chatting; confirm the conversation reopens via `openConversation`/runtime tab restore.
7. Open the conversation menu (`⋮`) and verify New chat, Rename (inline), Archive, recent-conversation switching, and "Legacy summary view" all work; confirm the legacy summary grid still functions unchanged once selected.
8. Check narrow/mobile side-panel width and both light/dark themes for layout overflow or unreadable contrast in the new chat components.
9. Verify Firefox behavior with `<all_urls>` denied still allows chat to attempt capture and surfaces a clear error rather than crashing.

## Known Follow-ups

- Skill chips (`ChatSkillChip`) render whenever `chatState.selectedSkill` is set, but no picker UI exists yet — that lands in Phase 6A.
- Deep Dive remains legacy-summary-only in this phase; Phase 6B generalizes it to conversation/assistant-message scope.
- `@[tabname]` attachments are not yet selectable from the composer; `ChatSourceChip` currently only labels the implicit active-tab grounding and is ready to be reused for Phase 8's explicit attachments.
