# Walkthrough - Phase 1: Extend the shared reasoning vocabulary

Phase 1 of the `feature-reasoning-control-v1` plan moved the reasoning configuration
module to a neutral home (`src/lib/api/`), extended it with `'off'` level support and
task-specific choice set, and taught the Gemini branch to handle `modelId`-aware routing
through `geminiThinkingConfig.js`.

## Changes Made

### 1. Module relocation

#### [reasoningConfig.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/reasoningConfig.js)
- Moved from `src/lib/chat/reasoningConfig.js` → `src/lib/api/reasoningConfig.js`
- Updated module doc header to reflect dual-purpose (Chat + Tasks)
- Added import of `buildThinkingProviderOptions` from `geminiThinkingConfig.js`
- Added `TASK_REASONING_CHOICES` — `Off / Low / Medium` choice set for one-shot tasks
- Added `'off'` to `VALID_LEVELS` so both normalizers accept it
- Added `normalizeTaskReasoningLevel(value)` — falls back to `'off'` (vs chat's `'provider-default'`)
- Extended `buildReasoningRequestOptions(providerId, level, modelId = null)` with:
  - `'off'` handling per provider (Gemini → `buildThinkingProviderOptions`, OpenRouter → `effort: 'none'`, Cerebras → `reasoningEffort: 'none'`, portable → `reasoning: 'none'`)
  - Gemini `low`/`medium`/`high` now route through `buildThinkingProviderOptions` instead of portable `reasoning`, avoiding the SDK mis-mapping for Gemma 4 and 3 Pro

### 2. Import updates

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- Updated import path from `@/lib/chat/reasoningConfig.js` → `@/lib/api/reasoningConfig.js`

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)
- Updated import path from `@/lib/chat/reasoningConfig.js` → `@/lib/api/reasoningConfig.js`

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- Updated import path from `@/lib/chat/reasoningConfig.js` → `@/lib/api/reasoningConfig.js`

#### [chatStoreTabs.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/chatStoreTabs.test.js)
- Updated dynamic import path from `@/lib/chat/reasoningConfig.js` → `@/lib/api/reasoningConfig.js`

### 3. Gemini thinking config extension

#### [geminiThinkingConfig.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/utils/geminiThinkingConfig.js)
- Added `'off' → 'minimal'` alias at the top of `buildThinkingProviderOptions`
- Added `'low'` entry to every family's `levelMap`:
  - Gemini 2.5: `low → thinkingBudget: 2048`
  - Gemini 3 Flash: `low → thinkingLevel: 'low'`
  - Gemini 3 Pro: `low → thinkingLevel: 'medium'` (mapped up — Pro doesn't support low)
  - Gemma 4: `low → thinkingLevel: 'minimal'` (mapped down — Gemma has no low)
- Updated JSDoc and header table to document the new levels

### 4. Test relocation and expansion

#### [reasoningConfig.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/api/reasoningConfig.test.js)
- Moved from `tests/chat/` → `tests/api/` to match the module's new location
- Updated import path to `@/lib/api/reasoningConfig.js`
- Added `normalizeTaskReasoningLevel` tests (valid levels, fallback to `'off'`)
- Added `TASK_REASONING_CHOICES` tests (3 choices, frozen)
- Added `buildReasoningRequestOptions` + `'off'` tests for:
  - Portable providers (`chatgpt`, `deepseek`, `groq`, `ollama`) → `{ reasoning: 'none' }`
  - Gemini 2.5 + off → `thinkingBudget: 0`
  - Gemini 3 Flash + off → `thinkingLevel: 'minimal'`
  - Gemini 3 Pro + off → `thinkingLevel: 'medium'` (mapped up)
  - Gemma 4 + off → `thinkingLevel: 'minimal'`
  - OpenRouter + off → `effort: 'none'`
  - Cerebras + off → `reasoningEffort: 'none'`
  - Gemini + `low` levels
  - `geminiAdvanced` normalization through Gemini path
  - Gemini + off + unknown model / null modelId → `{}`

## Verification Results

### 1. Unit tests — new module

Ran `npx vitest run tests/api/reasoningConfig.test.js`:

```
 ✓ tests/api/reasoningConfig.test.js (83 tests) 10ms

 Test Files  1 passed (1)
      Tests  83 passed (83)
   Duration  230ms
```

### 2. Dependent test — chatStoreTabs

Ran `npx vitest run tests/chat/chatStoreTabs.test.js`:

```
 ✓ tests/chat/chatStoreTabs.test.js (4 tests) 3ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  404ms
```

### 3. Full test suite

Ran `npx vitest run`:

```
 Test Files  40 passed (40)
      Tests  386 passed (386)
   Duration  5.77s
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npx vitest run tests/api/reasoningConfig.test.js` — 83 tests pass, including all new `'off'` and Gemini family cases
- [x] `npx vitest run tests/chat/chatStoreTabs.test.js` — 4 tests pass (import re-point works)
- [x] `npx vitest run` — full suite: 40 files, 386 tests pass, no regressions

### Still-Required Manual Verification (To Be Done by User)
- [ ] `npm run dev` → load `.output/chrome` as unpacked extension → open Chat → send a message → confirm the reasoning dropdown next to Send still works after the module move
