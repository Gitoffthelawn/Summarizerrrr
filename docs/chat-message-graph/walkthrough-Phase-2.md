# Walkthrough - Phase 2: Per-message actions

This walkthrough documents the implementation of Phase 2 of the Chat Message Graph roadmap. We added per-message actions (edit, continue, delete, copy for user messages), surfaced model/provider and token usage metadata on assistant messages, and modified the AI SDK adapter to yield usage data from the stream completion event.

## Changes Made

### 1. Repository Layer

#### [conversationRepository.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/db/conversationRepository.js)
- Added `getMessage(messageId)` — single-message lookup by ID.
- Added `updateMessageContent(messageId, content)` — in-place content update for the continue-append flow. Sets `updatedAt` timestamp.
- Added `deleteSubtree(messageId)` — BFS-collects all descendants, deletes them in a **single IDB transaction**, and re-points `activeLeafMessageId` to the nearest surviving ancestor's latest descendant (or `null` if the root message was deleted).
- All three functions exported and added to the `conversationRepository` facade.

---

### 2. Adapter Layer

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)
- In `generateContentStreamRequest`: after the standard (non-proxy) text stream loop completes, reads `await result.usage` from the AI SDK and yields a `{ __streamMeta: true, usage }` marker object.
- In `generateContentStreamEnhancedRequest`: detects the `__streamMeta` marker, captures `usage`, and includes it in the `isComplete` yield: `{ chunk: '', fullText, isComplete: true, usage }`.

---

### 3. Service Layer

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- Modified `runGeneration` to capture `usage` from the `isComplete` stream event (instead of `continue`-ing past it) and pass it to `finalizeAssistantMessage` — persisted on both successful and error finalization paths.
- Added `edit({ conversation, messageId, content, settings, ... })` — looks up the original user message, creates a new user sibling with the same `parentId`, then generates via `getGenerationContextForUser`.
- Added `continueResponse({ conversation, assistantMessageId, settings, ... })` — for aborted/interrupted replies only. Builds context including the partial assistant content, sends a "continue" instruction, and appends the continuation to the existing message via `updateMessageContent`.

---

### 4. Store Layer

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- Added `editChatMessage(messageId, content)` — orchestrates the edit lifecycle (isSending, streaming, reload).
- Added `continueChatMessage(assistantMessageId)` — orchestrates the continue lifecycle, pre-populating the streaming message with existing partial content.
- Added `deleteChatMessage(messageId)` — calls `deleteSubtree` and reloads the active path.

---

### 5. UI Layer

#### [ChatMessage.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatMessage.svelte)
- **User messages**: Added Edit button (pencil icon) that opens an inline textarea pre-filled with message content. Submit creates a new user sibling + generates. Added Copy button.
- **Assistant messages**: Added Continue button (play icon) for aborted/interrupted replies. Added Delete button (trash icon, changes to error color on hover). Retry button now shows only for error status (not aborted).
- **Model/usage chip**: Below assistant action buttons, displays `modelId` (with CPU chip icon) and token usage as "N in · N out" (with chart icon) when available.

---

### 6. Tests

#### [messageGraphPhase2.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/messageGraphPhase2.test.js)
- `deleteSubtree`: deletes subtree + re-points active leaf (3 tests: subtree, sibling branch, root deletion).
- `getMessage` and `updateMessageContent`: single lookup, non-existent returns undefined, in-place content update.
- `edit`: verifies old branch stays intact and new sibling becomes active.
- `continueResponse`: appends continuation to aborted reply via in-memory repository mock.
- `usage`: captures usage from stream completion event and persists on finalized assistant.

#### [aiSdkAdapter.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/aiSdkAdapter.test.js)
- Updated existing enhanced stream test to expect `usage: null` in the `isComplete` event.

---

## Verification Results

### 1. Automated Tests
```sh
npm run test
```
```Output
 Test Files  13 passed (13)
      Tests  72 passed (72)
   Start at  19:25:56
   Duration  682ms (transform 734ms, setup 487ms, import 1.19s, tests 276ms, environment 2ms)
```

### 2. Svelte Type Check
```sh
npm run check
```
```Output
svelte-check found 0 errors and 21 warnings in 8 files
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `deleteSubtree` removes all descendants and re-points active leaf (3 scenarios).
- [x] `getMessage` and `updateMessageContent` work correctly.
- [x] Edit creates new user sibling with old branch intact.
- [x] Continue appends to aborted reply content.
- [x] Usage data flows from stream → service → finalized assistant record.
- [x] All 72 tests pass, 0 errors in svelte-check.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Edit a mid-conversation user message in the browser; verify inline textarea appears, old branch persists, and new branch becomes active with a fresh generation.
- [ ] Switch branches with `‹ ›` controls after editing to confirm old branch content is still accessible.
- [ ] Continue an aborted reply (stop generation mid-stream, then click play icon); confirm content appends seamlessly.
- [ ] Delete a message; verify subtree is removed and active path updates.
- [ ] Verify model/usage chips render below assistant messages when the provider returns usage data.
