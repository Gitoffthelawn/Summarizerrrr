# Walkthrough - Phase 1: Lock the model-routing foundation (verification, no adapter contract change)

Phase 1 of the [chat-model-quick-select-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-model-quick-select-v1.md) plan verified that the existing model-routing contract — `resolveAdapterCall` overlaying `settings.selected*Model` fields which `getAISDKModel` reads — works correctly for all provider paths. Six new regression tests lock this behavior to prevent future breakage.

## Changes Made

### 1. Test Infrastructure

#### [aiSdkAdapter.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/aiSdkAdapter.test.js)
- Added tracked hoisted mocks for `createOpenAI`, `createOpenAICompatible`, and `createCerebras` (previously `vi.fn()` throwaways — now spied so tests can observe model construction)
- Wired the new mocks into `vi.mock()` registrations for `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, and `@ai-sdk/cerebras`
- Added import for `resolveAdapterCall` from `providerRegistry.js`
- Added new `describe('Model-routing contract (Phase 1 lock)')` block with 6 tests:
  1. **Explicit model via `resolveAdapterCall` reaches `generateText`** — proves the Gemini overlay path works end-to-end
  2. **Dynamic `openai-compatible-*` profile collapses correctly** — proves profile API key, base URL, and model override flow through the `openaiCompatible` adapter
  3. **Explicit ChatGPT model is overlaid and reaches OpenAI adapter** — proves `selectedChatgptModel` overlay works with `createOpenAI`
  4. **Summary path (no explicit model) is unchanged** — proves default settings produce the same model/config as before (no regression)
  5. **Cerebras overlay** — proves `selectedCerebrasModel` overlay works (important for Phase 2's provider-independent fallback)
  6. **Explicit model reaches `streamText` in streaming path** — proves the overlay works for the streaming code path too

### 2. Code Audit (no changes)

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)
- Confirmed `getAISDKModel` derives model from `settings.selected*Model` for all 9 provider cases (lines 74–175)
- Confirmed Gemini auto-fallback seeds from the overlaid `selectedGeminiModel` (line 84)
- No code changes needed — the adapter already correctly reads the overlay

#### [providerRegistry.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/providers/providerRegistry.js)
- Confirmed `resolveAdapterCall` sets `settings[legacyModelField] = modelId` for standard providers (line 328) and `settings.selectedOpenAICompatibleModel = modelId` for profiles (line 326)
- No code changes needed

### 3. Plan Item Resolved as Obsolete

The plan's Phase 1 Verify list asks for a test proving that "an explicit
reasoning-capable chatgpt model still triggers the GPT-5/o* temperature-skip
path in `mapGenerationConfig`". **That path no longer exists.**
`mapGenerationConfig` ([aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js) line 182)
now returns only `{ maxOutputTokens: 4000 }` — it has no temperature logic and
no model-family branching for any provider, so there is no skip behavior left to
regress. The plan item was written against code that has since been simplified.

Test 3 covers what remains true for that scenario: it uses the reasoning-capable
model `o3-mini` and asserts the model routing reaches the OpenAI adapter. No
temperature assertion was added because asserting the absence of a field that no
code path can ever set would lock in nothing.

This item is therefore **not** a coverage gap and needs no follow-up. If
temperature handling is ever reintroduced, the assertion should come back with it.

## Verification Results

### 1. Test Suite

Ran `npx vitest run tests/chat/aiSdkAdapter.test.js`:

```sh
npx vitest run tests/chat/aiSdkAdapter.test.js
```

Output:

```
 ✓ tests/chat/aiSdkAdapter.test.js (18 tests) 22ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  11:34:04
   Duration  272ms (transform 76ms, setup 30ms, import 114ms, tests 22ms, environment 0ms)
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] All 18 tests pass (12 existing + 6 new model-routing contract tests)
- [x] Explicit model via `resolveAdapterCall` reaches `generateText` as the constructed model
- [x] Dynamic `openai-compatible-*` profile collapses to `openaiCompatible` adapter with correct API key, base URL, and model overlay
- [x] Explicit ChatGPT model is overlaid and reaches the OpenAI adapter correctly
- [x] Summary path (no resolveAdapterCall overlay) produces the same model/config as default settings
- [x] Cerebras model overlay works correctly
- [x] Explicit model reaches `streamText` in the streaming path
- [x] No source code changes to `aiSdkAdapter.js` or `providerRegistry.js` — contract verified as-is
- [x] The plan's GPT-5/o* temperature-skip item is obsolete, not skipped — `mapGenerationConfig` no longer has temperature logic (see "Plan Item Resolved as Obsolete" above)

### Still-Required Manual Verification (To Be Done by User)
- [ ] None — Phase 1 is a verification-only phase with no behavioral changes

## Known Follow-ups

- **Phase 2** will add `resolveConversationModel()` to `chatService.js` for provider-independent conversation-model fallback
- **Phase 3** will add per-tab model state (`modelOverride`) and the Chat settings quick-models manager
