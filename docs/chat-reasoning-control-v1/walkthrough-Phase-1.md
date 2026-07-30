# Walkthrough - Phase 1: Normalize provider routing and reasoning request mapping

Phase 1 of the [chat-reasoning-control-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-reasoning-control-v1.md) plan normalizes AI SDK provider construction for Groq, OpenRouter, and Cerebras to their official provider packages, creates the central reasoning-config module, and wires up Gemini thinking-config suppression when chat reasoning is active.

## Changes Made

### 1. Provider Routing (aiSdkAdapter.js)

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)
- Added imports for `createGroq` from `@ai-sdk/groq` and `createCerebras` from `@ai-sdk/cerebras`.
- **Groq** (`case 'groq'`): replaced `createOpenAICompatible({ name: 'groq', baseURL: '...' })` with `createGroq({ apiKey })`. The official provider handles the base URL and correct request mapping internally.
- **OpenRouter** (`case 'openrouter'`): replaced `createOpenAICompatible({ name: 'openrouter', baseURL: '...' })` with the already-imported `createOpenRouter({ apiKey })`.
- **Cerebras** (`case 'cerebras'`): replaced `createOpenAICompatible({ name: 'cerebras', baseURL: '...' })` with `createCerebras({ apiKey })`.
- All three keep the same provider ids, API key sources, and selected-model settings — no caller or stored setting changes shape.

### 2. Gemini Thinking Suppression

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)
- In both `generateContentRequest` (blocking) and `generateContentStreamRequest` (streaming), added a `hasExplicitReasoning` check: if the destructured `generationOptions` contains a `reasoning` key, the existing `buildThinkingProviderOptions` call is skipped for Gemini.
- When no `reasoning` key is present (legacy Summary calls), existing behavior is preserved exactly — `buildThinkingProviderOptions` runs and its output merges into `providerOptions`.
- `provider-default` counts as explicit (`reasoning` key is present), so chat requests using Auto still suppress the legacy thinking injection.

### 3. Reasoning Config Module (NEW)

#### [reasoningConfig.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/reasoningConfig.js)
- **`REASONING_CHOICES`** — frozen array of four V1 UI choices (`provider-default`, `low`, `medium`, `high`) with labels and descriptions.
- **`normalizeChatReasoningLevel(value)`** — sanitizes arbitrary input to a valid V1 level; missing/invalid → `'provider-default'`.
- **`getChatReasoningOptions(providerId, modelId)`** — returns the allowed UI choices for a provider. Full set for gemini, chatgpt, deepseek, groq, ollama, openrouter, cerebras. Auto-only for openaiCompatible, lmstudio, dynamic profile ids, and unknown providers. Normalizes `geminiAdvanced` → gemini, `openai` → chatgpt, and `isOpenAICompatibleProfileId(id)` → openaiCompatible before lookup.
- **`buildReasoningRequestOptions(providerId, level)`** — maps provider + level to the correct AI SDK request shape:
  - Portable `{ reasoning: level }` for gemini, chatgpt, deepseek, groq, ollama.
  - `{ providerOptions: { openrouter: { reasoning: { effort: level } } } }` for OpenRouter.
  - `{ providerOptions: { cerebras: { reasoningEffort: level } } }` for Cerebras.
  - `{}` for Auto, unsupported, or Auto-only providers.
- **`effectiveReasoningLevel(sessionLevel, settings)`** — resolves the null sentinel (session not yet set) against `settings.chat.defaultReasoningLevel` at read time, handling the cold-start ordering issue.

### 4. Test Files

#### [reasoningConfig.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/reasoningConfig.test.js)
- 54 test cases covering:
  - `normalizeChatReasoningLevel` — valid levels preserved, invalid/null/undefined → `provider-default`
  - `getChatReasoningOptions` — full choices for 7 supported providers, Auto-only for lmstudio, openaiCompatible template, dynamic profile ids, unknown providers; `geminiAdvanced`/`openai` normalization
  - `buildReasoningRequestOptions` — portable reasoning for 5 providers, OpenRouter native object, Cerebras native object, `{}` for Auto/Auto-only/unknown, invalid level normalization
  - `effectiveReasoningLevel` — explicit session value wins, null falls back to settings, double-null → provider-default, invalid values normalized

#### [aiSdkAdapter.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/aiSdkAdapter.test.js)
- Added mocks for `@ai-sdk/groq` and `@ai-sdk/cerebras`.
- Promoted `buildThinkingProviderOptions` mock to the shared `mocks` object for per-test control.
- 3 new test cases:
  - **`forwards explicit reasoning to generateText without Gemini thinking injection`** — verifies `reasoning: 'medium'` reaches `generateText` and `buildThinkingProviderOptions` is not called.
  - **`preserves Gemini thinking injection when no explicit reasoning is present`** — verifies legacy Summary calls still receive thinking `providerOptions`.
  - **`forwards explicit reasoning through streaming path and suppresses thinking`** — same suppression check in the streaming path.

## Verification Results

### 1. Focused Tests

Ran the plan-specified verification command:

```sh
npx vitest run tests/chat/reasoningConfig.test.js tests/chat/aiSdkAdapter.test.js
```

Output:

```
 ✓ tests/chat/reasoningConfig.test.js (54 tests) 6ms
 ✓ tests/chat/aiSdkAdapter.test.js (11 tests) 16ms

 Test Files  2 passed (2)
      Tests  65 passed (65)
   Start at  22:56:24
   Duration  222ms (transform 106ms, setup 52ms, import 145ms, tests 22ms, environment 0ms)
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] All 54 `reasoningConfig.test.js` tests pass — every provider row and level normalization covered.
- [x] All 11 `aiSdkAdapter.test.js` tests pass — reasoning forwarding, thinking suppression, and legacy preservation.
- [x] Existing adapter tests (message ordering, fallback, proxy, abort, Firefox mobile flush) remain green.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Run full test suite (`npm test`) to confirm no regressions from the Groq/OpenRouter/Cerebras provider swap (shared `getAISDKModel()` is used by Summary too).
- [ ] Load the extension in Chrome dev mode and verify Groq, OpenRouter, and Cerebras Summary still works with the official providers.
- [ ] Verify no new build errors: `npm run build` and `npm run build:firefox`.

## Known Follow-ups
- Phase 2 will snapshot reasoning levels per user message and wire `buildReasoningRequestOptions` into `chatService.js`.
- Phase 3 will add the per-tab Svelte 5 composer control.
- Phase 4 will add AI SDK warning capture and full regression verification.
