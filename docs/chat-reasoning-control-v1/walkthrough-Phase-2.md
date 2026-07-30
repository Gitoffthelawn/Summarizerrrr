# Walkthrough - Phase 2: Snapshot reasoning per user turn and reuse it consistently

Phase 2 of the [chat-reasoning-control-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-reasoning-control-v1.md) plan wires the reasoning level through the chat service layer: user messages now carry a normalized `reasoningLevel` snapshot, the generation pipeline reads it back and merges the correct AI SDK request options, and retry/regenerate/continue reuse the stored snapshot rather than accepting a new one.

## Changes Made

### 1. JSDoc Contracts

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)
- Added `reasoning` (optional string) to the `GenerationRequest` typedef — documents the AI SDK portable reasoning level that suppresses legacy Gemini thinking injection when present.
- Added `reasoningLevel` (optional string) to `ConversationMessageRecord` — documents the per-user-turn snapshot. Missing on older records means `'provider-default'`.

### 2. Chat Service

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- **Import**: added `normalizeChatReasoningLevel` and `buildReasoningRequestOptions` from `reasoningConfig.js`.
- **`send`**: accepts a new `reasoningLevel` parameter, normalizes it, and persists it on the user message via `repository.addMessage`.
- **`runGeneration`**: reads `currentUserMessage.reasoningLevel`, normalizes it (falls back to `'provider-default'` for older records), calls `buildReasoningRequestOptions(resolvedAdapterId, ...)`, and spreads the result into the `streamRequest({...})` call. This is keyed on `resolvedAdapterId` (the output of `resolveAdapterCall`), which already collapses dynamic OpenAI-compatible profile ids to `'openaiCompatible'`.
- **`retry` / `regenerate`**: unchanged — they recover `currentUserMessage` from the repository, which already carries the stored `reasoningLevel`. The generation pipeline reads it automatically.
- **`continueResponse`**: reads `currentUserMessage.reasoningLevel` from the originating user turn and merges reasoning options into its own `streamRequest` call (same pattern as `runGeneration`).
- **`edit`**: accepts a new `reasoningLevel` parameter, normalizes it, and persists it on the new user sibling message. The edit branch then flows through `runGeneration` which reads it back.

### 3. Test Extensions

#### [chatService.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/chatService.test.js)
- Added `getMessage` and `markMessageStreaming` methods to the in-memory test repository (needed by `edit` and `continueResponse`).
- Added 5 new test cases in a `'reasoning level snapshot'` describe block:
  1. **Send persists and passes** — `reasoningLevel: 'high'` is persisted on the user message and `reasoning: 'high'` appears in the stream request.
  2. **Invalid values normalize** — `'xhigh'` becomes `'provider-default'` on the message; no `reasoning` key in the request.
  3. **Retry reuses stored level** — after sending with `'high'`, a retry without passing a new level still sends `reasoning: 'high'`.
  4. **Edit snapshots new level** — editing a `'low'` message with `'high'` persists and sends `'high'` on the new branch.
  5. **Backward compat** — old messages without `reasoningLevel` generate without error, defaulting to `'provider-default'` (no reasoning override).

## Verification Results

### 1. Plan-specified test command

```sh
npx vitest run tests/chat/chatService.test.js tests/chat/messageGraphPhase2.test.js tests/chat/messageGraphPhase3.test.js tests/chat/messageGraphPhase4.test.js
```

Output:

```
 ✓ tests/chat/chatService.test.js (10 tests) 8ms
 ✓ tests/chat/messageGraphPhase3.test.js (5 tests) 18ms
 ✓ tests/chat/messageGraphPhase2.test.js (9 tests) 31ms
 ✓ tests/chat/messageGraphPhase4.test.js (12 tests) 50ms

 Test Files  4 passed (4)
      Tests  36 passed (36)
   Start at  23:00:41
   Duration  362ms (transform 310ms, setup 126ms, import 435ms, tests 107ms, environment 0ms)
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] All 10 chatService tests pass (5 existing + 5 new reasoning snapshot tests).
- [x] All 9 messageGraphPhase2 tests pass (no regression from repository helper additions).
- [x] All 5 messageGraphPhase3 tests pass.
- [x] All 12 messageGraphPhase4 tests pass.
- [x] Send, retry, edit, and backward-compat scenarios all covered.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Run full test suite (`npm test`) to confirm no regressions.
- [ ] Manually test: send a chat message with a reasoning level, then retry — verify the retry reuses the original level (check console logs for `reasoning:` in the request).
- [ ] Manually test: edit a message and confirm the new branch uses the newly selected level.

## Known Follow-ups
- Phase 3 will add the per-tab Svelte 5 `ChatReasoningSelect` component and wire `reasoningLevel` through the chat store.
- Phase 4 will add AI SDK warning capture and complete regression verification.
