# Walkthrough - Phase 3: Enrich the diagnostics payload (per-source tokens + input/output/cache/model)

Phase 3 of the [chat-composer-ui-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-composer-ui-v1.md) plan enriched the `onDiagnostics` callback payload with per-source token counts, provider usage breakdown (input/output/cache), and model identity — all as a pure read-out with zero changes to budgeting math or assembled prompt content.

## Changes Made

### 1. Context Budgeter — per-source token accumulation

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)
- Added a `sourceTokens` map (`{}`) initialized alongside `includedSourceIds`/`droppedSourceIds`
- In the source-selection loop, records `sourceTokens[sourceId] = tokens` for each included source
- Returns `sourceTokens` in the budget result object alongside existing keys
- **No budgeting math was changed** — the `tokens` variable was already computed; this is a pure read-out

### 2. Context Pipeline — surfacing sourceTokens and enriching groundingRefs

#### [index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/index.js)
- Each `groundingRefs` entry now carries `tokens: budget.sourceTokens[sourceId] ?? null`
- The pipeline result now exposes `sourceTokens: budget.sourceTokens || {}` for downstream consumers (the Phase 2 context bar, the Phase 4 donut)

### 3. Chat Service — enriched onDiagnostics at both call sites

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- **`runGeneration`** (line ~282): `onDiagnostics` payload extended with `input`, `output`, `cached`, `providerId`, `modelId`, `sourceTokens`
- **`continueResponse`** (line ~607): identical enrichment at the second call site
- The four legacy keys (`used`, `inputBudget`, `window`, `source`) remain byte-identical
- `input`/`output`/`cached` map directly from the already-normalized adapter usage (`promptTokens`/`completionTokens`/`cachedInputTokens`)
- `providerId`/`modelId` are the conversation-level resolved values — the UI resolves display labels via `resolveProviderEntry()`

### 4. Tests

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)
- `sourceTokens has an entry per included source matching estimateTokens of selected content` — verifies the count equals `estimateTokens(selectedContent)`
- `sourceTokens omits dropped sources` — verifies dropped @tab sources are absent from the map
- `sourceTokens read-out does not change the assembled system/messages` — proves the enrichment is inert; assembled prompt content is unchanged, and `groundingRefs` carry `tokens`

#### [chatService.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/chatService.test.js)
- `onDiagnostics fires with input/output/cached/providerId/modelId/sourceTokens from mocked usage` — end-to-end test with a mocked stream that reports full usage including `cachedInputTokens`; validates all new and legacy keys
- `cached is null when the provider reports no cache figure` — confirms `cached: null` when `cachedInputTokens` is absent from usage

## Verification Results

### 1. Phase-specific tests

```sh
npx vitest run tests/chat/contextPipeline/contextPipeline.test.js tests/chat/chatService.test.js
```

```
 ✓ tests/chat/contextPipeline/contextPipeline.test.js (19 tests) 8ms
 ✓ tests/chat/chatService.test.js (19 tests) 10ms

 Test Files  2 passed (2)
      Tests  38 passed (38)
   Duration  264ms
```

### 2. Full test suite

```sh
npx vitest run
```

```
 Test Files  42 passed (42)
      Tests  434 passed (434)
   Duration  8.14s
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `sourceTokens` map is populated with per-included-source token counts
- [x] `sourceTokens` omits dropped sources
- [x] Assembled `system`/`messages` are unchanged (inert read-out)
- [x] `groundingRefs` entries carry `tokens` field
- [x] `onDiagnostics` fires with `input`/`output`/`cached`/`providerId`/`modelId`/`sourceTokens`
- [x] Legacy keys (`used`/`inputBudget`/`window`/`source`) unchanged
- [x] `cached: null` when provider reports no cache figure
- [x] Full test suite (434 tests) passes with no regressions

### Still-Required Manual Verification (To Be Done by User)
- [ ] Load the extension in `.output/chrome`, send a chat message, and confirm the side panel's existing context meter still works correctly with the enriched diagnostics
