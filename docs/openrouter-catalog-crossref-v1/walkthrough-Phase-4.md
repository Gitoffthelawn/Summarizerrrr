# Walkthrough — Phase 4: Context Window Meter UI

Phase 4 of the **OpenRouter Catalog Cross-Reference V1** plan surfaces the resolved context window and per-turn usage as a compact meter near the chat composer, so users can see how much of the model's context they're consuming.

## Changes Made

### 1. Context Pipeline — Forward `inputBudgetTokens`

#### [contextAssembler.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextAssembler.js)
- Added `inputBudgetTokens: diagnostics?.inputBudgetTokens || 0` to the assembled return object, forwarding the budgeter's input budget alongside the existing `estimatedInputTokens`.

### 2. Chat Service — Emit `onDiagnostics` Callback

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- Added `onDiagnostics` as an optional callback parameter to `runGeneration()` and all public methods that forward to it (`send`, `retry`, `regenerate`, `edit`, `continueResponse`).
- After `onWarnings` fires (in both `runGeneration` for the main send path and `continueResponse` for its own pipeline build), `onDiagnostics` now emits `{ used, inputBudget, window, source }` derived from the pipeline's capabilities and token estimates.

### 3. Chat Store — Wire `contextUsage` State

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- Added `contextUsage: null` to `createChatSessionState()` (next to `contextWarnings`).
- Reset `contextUsage: null` at the start of every generation path (`sendChatMessage`, `retryChatMessage`, `regenerateChatMessage`, `editChatMessage`, `continueChatMessage`).
- Wired `onDiagnostics: (usage) => writeSession(targetTabId, { contextUsage: usage })` in all five chat service call sites.

### 4. Meter Component

#### [ChatContextMeter.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatContextMeter.svelte) [NEW]
- Renders nothing when `usage` is `null`.
- Shows a progress bar + label: `~{formatK(used)} / {formatK(window)}` where `formatK(12300)` → `12.3K`.
- Bar color: `accent` (normal), `warning` (≥80%), `error` (≥95%).
- Source badge: maps `discovered` → "exact", `openrouter-catalog` → "catalog", `known-model` → "curated", `default-fallback` → "estimated", with a tooltip showing the raw source string.

### 5. Shell Integration

#### [ChatShell.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatShell.svelte)
- Imported `ChatContextMeter` and rendered it above `ChatContextWarning` in the fixed composer area, so the meter reads as "capacity of the next send".

## Verification Results

### 1. Type Checks
- Ran `npm run check` → 0 errors, 21 warnings (all pre-existing Svelte deprecation warnings unrelated to this phase).

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 21 warnings in 8 files
```

### 2. Unit Tests
- Ran `npx vitest run tests/chat/` → 26 test files, 203 tests passed, 0 failures.

```sh
npx vitest run tests/chat/
```

Output:
```
 Test Files  26 passed (26)
      Tests  203 passed (203)
   Duration  2.68s
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` passes with 0 errors
- [x] `npx vitest run tests/chat/` — all 203 tests green
- [x] `inputBudgetTokens` forwarded through assembler return object
- [x] `onDiagnostics` threaded through all 5 chat service method paths + `runGeneration`

### Still-Required Manual Verification (To Be Done by User)
- [ ] In a dev build (`npm run dev`), start a chat with a cloud provider and send a message. Confirm the context meter appears near the composer showing `~<used> / <window>` with a proportional bar and the correct source badge.
- [ ] Attach a large `@tab` source to trip a `Dropped source` warning. Confirm the meter bar turns warning/error color near capacity.
- [ ] Switch to a local provider (Ollama/LM Studio) and confirm it resolves `default-fallback` or `discovered` — never `openrouter-catalog`.

## Known Follow-ups
- The meter shows the **last-sent turn's** estimate, not a live preview of the composer. Real-time token preview is explicitly out of scope for V1.
- The `~` prefix on the count reflects the `length / 4` estimation, not a real tokenizer.
