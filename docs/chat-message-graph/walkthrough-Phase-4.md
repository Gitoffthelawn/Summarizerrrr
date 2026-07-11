# Walkthrough — Phase 4: Durability & Performance

This walkthrough documents the implementation of Phase 4 of the Chat Message Graph roadmap. We added durable streaming via recovery-on-open, pagination decoupled from model context, and `content-visibility: auto` for rendering performance on long conversations.

## Changes Made

### 1. Repository Layer

#### [conversationRepository.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/db/conversationRepository.js)
- **`createStreamingAssistantMessage(conversationId, data)`** — pre-persists an assistant message with `status: 'streaming'` before calling the model. Sets `activeLeafMessageId` to the new message so the graph stays consistent even if the panel dies.
- **`checkpointStreamingContent(messageId, content)`** — updates content of a message still in `streaming` status. No-ops if the message has already been finalized (guards against races).
- **`recoverStreamingMessages(conversationId)`** — recovery-on-open: finds all messages with `status === 'streaming'` in a conversation and flips them to `interrupted`. This is the **source of truth** for durable streaming.
- **`finalizeStreamingAssistantMessage(messageId, updates)`** — updates the pre-persisted streaming record in place (status, content, usage, groundingRefs, error) rather than creating a new record. Updates conversation timestamp on success.
- All four functions added to the `conversationRepository` export object.

---

### 2. Service Layer

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- **`runGeneration`** rewritten for durable streaming:
  1. Pre-persists the assistant via `createStreamingAssistantMessage` before calling the model.
  2. Schedules content checkpoints on a 500 ms throttle during streaming via `setTimeout` / `checkpointStreamingContent`.
  3. Cancels the checkpoint timer on terminal (success, abort, error).
  4. Finalizes the same record in-place via `finalizeStreamingAssistantMessage` instead of creating a new record via `finalizeAssistantMessage`.
  5. All three error paths (success, abort, API error) handle the case where `streamingMessageId` may not yet exist (e.g., error before pre-persist).

---

### 3. Store Layer

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- Added `VISIBLE_MESSAGE_WINDOW = 25` constant for pagination.
- Added `hasEarlierMessages` to `createChatSessionState()` — tracks whether the visible window is truncated.
- **`reloadActivePath`** — fetches the full active path and windows to the last 25 messages. Sets `hasEarlierMessages` accordingly.
- **`openConversation`** — now calls `recoverStreamingMessages(id)` before loading messages (recovery-on-open). Windows visible messages.
- **`syncChatForActiveTab`** — tab restore path also calls `recoverStreamingMessages` and windows messages.
- **`switchBranch`** — windows visible messages after branch switch.
- **`loadEarlierMessages()`** — new export. Loads the full active path and sets `hasEarlierMessages = false`. Called by the "Load earlier" button in `ChatMessageList`.
- Model-context path remains `repository.getGenerationPath()` (always full) — pagination never touches it.

---

### 4. UI Layer

#### [ChatMessageList.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatMessageList.svelte)
- Imports `loadEarlierMessages` and `chatState` from the store.
- When `chatState.hasEarlierMessages` is true, renders a "Load earlier messages" button at the top of the scroll container with an arrow-up icon.
- Button shows "Loading…" state and disables during the async load.

#### [ChatMessage.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatMessage.svelte)
- Added `content-visibility: auto` and `contain-intrinsic-size: auto 200px` to the assistant message prose `<div>`. The browser can skip layout/paint for off-screen messages, improving scroll performance on long conversations.

---

### 5. Tests

#### [NEW] [messageGraphPhase4.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/messageGraphPhase4.test.js)
- **createStreamingAssistantMessage** — pre-persists with `streaming` status, sets `activeLeafMessageId`, defaults `parentId` from conversation.
- **checkpointStreamingContent** — updates content while streaming, no-ops after finalization, returns null for missing messages.
- **recoverStreamingMessages** — marks all streaming messages as interrupted, preserves partial content, leaves complete/error messages untouched.
- **finalizeStreamingAssistantMessage** — updates the same record in place (no extra records), handles error finalization.
- **chatService durable streaming** — integration test: pre-persists + finalizes the same record, only one assistant message in the DB.
- **Pagination decoupled from context** — `getGenerationPath` returns all 30 messages even when the UI windows to 25.

#### [MODIFY] [chatService.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/chatService.test.js)
- Added `createStreamingAssistantMessage`, `checkpointStreamingContent`, `recoverStreamingMessages`, and `finalizeStreamingAssistantMessage` to the mock repository.

#### [MODIFY] [messageGraphPhase2.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/messageGraphPhase2.test.js)
- Added durable streaming mock methods to the usage collection test's inline repository.

#### [MODIFY] [messageGraphPhase3.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/messageGraphPhase3.test.js)
- Added durable streaming mock methods to the service integration test's inline repository.

---

## Verification Results

### 1. Automated Tests
```
 Test Files  17 passed (17)
      Tests  116 passed (116)
   Duration  762ms
```

### 2. Svelte Type Check
```
svelte-check found 0 errors and 21 warnings in 8 files
```
(All 21 warnings are pre-existing and unrelated to Phase 4 changes.)

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `createStreamingAssistantMessage` pre-persists with `streaming` status and updates `activeLeafMessageId`.
- [x] `checkpointStreamingContent` updates content while streaming, no-ops after finalization.
- [x] `recoverStreamingMessages` marks all `streaming` messages as `interrupted`, preserves partial content.
- [x] `finalizeStreamingAssistantMessage` updates the record in place (no extra records created).
- [x] Service integration: pre-persists + finalizes the same record, only one assistant in the DB.
- [x] `getGenerationPath` returns the full path regardless of UI windowing (pagination decoupled from context).
- [x] All 116 tests pass, 0 errors in svelte-check.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Start a long generation, kill the panel/reload; reopen and confirm the partial reply persists and is marked `interrupted` (recovery-on-open), not lost.
- [ ] Load a 50+ message conversation; confirm "Load earlier messages" button appears at the top.
- [ ] Click "Load earlier messages" and verify all messages load, scroll stays smooth.
- [ ] After loading all messages, send a new message and confirm the model still receives the full active-path context (check the network payload).
- [ ] Verify `content-visibility: auto` is applied to assistant message containers in DevTools (Elements panel).

## Known Follow-ups
- The checkpoint throttle (500 ms) is a service-layer `setTimeout`; if the extension is suspended between ticks, partial content up to the last checkpoint is preserved. Recovery-on-open handles the rest.
- Best-effort cleanup on panel close (e.g., `beforeunload`) is optional and not implemented — recovery-on-open is the canonical guarantee.
