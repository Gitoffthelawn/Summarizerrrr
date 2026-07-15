# Walkthrough - Phase 4: Surface safe diagnostics and complete regression verification

Phase 4 of the [chat-reasoning-control-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-reasoning-control-v1.md) plan added reasoning-coercion warning surfacing through the AI SDK stream pipeline into the chat's `contextWarnings`, and completed the full regression verification suite across all providers and both browser targets.

## Changes Made

### 1. AI SDK Adapter — Reasoning warning capture and surfacing

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)
- Added `extractReasoningWarnings(warnings, modelName, generationOptions)` helper that:
  - Filters AI SDK warnings for reasoning-related entries (unsupported-setting with `setting === 'reasoning'`, or messages matching `/reasoning|thinking/i`)
  - Normalizes them into user-friendly strings
  - Logs a concise dev warning with model name and requested level (no API keys or raw payloads)
- Updated the standard streaming path (`streamText` result handling) to await `result.warnings` alongside `result.usage`, extract reasoning warnings, and yield them in the `__streamMeta` marker as a new `reasoningWarnings` field
- Updated `generateContentStreamEnhancedRequest` to:
  - Capture `reasoningWarnings` from the metadata marker
  - Include them in the final completion event as an additive optional field (`...(reasoningWarnings.length ? { reasoningWarnings } : {})`)
  - Existing callers that ignore the field keep working unchanged

### 2. Chat Service — Warning merge into contextWarnings

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- Updated the completion event handler in `runGeneration` to check for `event.reasoningWarnings` and merge them with existing pipeline warnings via `onWarnings`
- Applied the same logic in the `continueResponse` stream loop
- The merged array includes both the original pipeline context warnings and any reasoning-related warnings, so users see a message like "High reasoning is not supported by this model; the provider used Medium." alongside existing context warnings

### 3. Ollama Proxy — Reasoning forwarding verified

#### [ollamaProxyModel.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/ollamaProxyModel.js) (no changes needed)
- Verified that `reasoning` from `generationOptions` flows through the proxy's `config` spread into `proxyGenerationConfig` in the background `OllamaApiProxyService.handleApiRequest`, so Ollama stays full-reasoning-capable in V1

## Verification Results

### 1. Unit Tests

Ran `npx vitest run tests/chat/aiSdkAdapter.test.js tests/chat/chatService.test.js`:

```
 ✓ tests/chat/aiSdkAdapter.test.js (13 tests) 15ms
 ✓ tests/chat/chatService.test.js (11 tests) 7ms

 Test Files  2 passed (2)
      Tests  24 passed (24)
```

### 2. Full Test Suite

Ran `npm test`:

```
 Test Files  40 passed (40)
      Tests  357 passed (357)
```

### 3. Type Checks

Ran `npm run check`:

```
svelte-check found 0 errors and 17 warnings in 9 files
```

All warnings are pre-existing and unrelated.

### 4. Chrome Build

Ran `npm run build`:

```
Σ Total size: 12.79 MB
✔ Finished in 16.9 s
```

### 5. Firefox Build

Ran `npm run build:firefox`:

```
Σ Total size: 12.8 MB
✔ Finished in 18.8 s
```

### 6. Whitespace Check

Ran `git diff --check` — clean, no issues.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Reasoning-coercion warning (unsupported-setting with setting=reasoning) surfaces in enhanced stream completion metadata
- [x] Non-reasoning warnings (e.g. temperature) are filtered out and not included in reasoningWarnings
- [x] Reasoning warnings merge into contextWarnings via onWarnings callback in chatService
- [x] Pipeline warnings and reasoning warnings coexist in the merged array
- [x] Dev console logs concise warning without API keys
- [x] Existing callers that ignore reasoningWarnings continue working (additive field)
- [x] Ollama proxy forwards reasoning through config spread (no change needed)
- [x] Summary generation paths are unchanged (no reasoning injection without explicit `reasoning` property)
- [x] Gemini thinking injection suppressed only when explicit `reasoning` is present (test coverage from Phase 1)
- [x] Firefox mobile flush error annotation unchanged
- [x] Full test suite passes (357/357)
- [x] Type checks pass (0 errors)
- [x] Chrome build succeeds
- [x] Firefox build succeeds
- [x] `git diff --check` clean

### Still-Required Manual Verification (To Be Done by User)
- [ ] Gemini: Auto and High both complete; Summary still honors its existing thinking setting
- [ ] ChatGPT/OpenAI: Low and High requests complete on a reasoning-capable model
- [ ] DeepSeek: Auto and High complete on a reasoning-capable model
- [ ] Groq: official provider model creation and a supported reasoning model work
- [ ] OpenRouter: inspect request body and confirm `reasoning: { effort: "high" }` not `reasoning_effort`
- [ ] Ollama: supported model maps Low/Medium/High; unsupported models respond normally
- [ ] Cerebras: reasoning-capable model receives `reasoningEffort` through official provider
- [ ] LM Studio/custom compatible: selector is Auto-only, no reasoning override sent
- [ ] Verify that temperature/top-p handling for GPT-5/o* models is unchanged
- [ ] Verify Firefox mobile streaming fallback still works
