# Walkthrough - Phase 4: Refuse impossible requests instead of 400-ing

This phase of the [Chat Context Budget & Warning Quality — V1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-context-budget-v1.md) plan implements a pre-flight validation mechanism to reject user inputs that are too large to fit into the AI model's context window. This replaces silent failures (or provider 400s) with structured error reporting before calling the LLM APIs.

## Changes Made

### 1. Context Pipeline Budgeting

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)
- Introduced a `minimumRequired` token calculation (system prompt + user message + skill instruction + safety reserve).
- Added a rejection check where if `minimumRequired` exceeds `inputBudgetTokens`, a structured `rejected` payload is returned instead of proceeding with generation.
- Preserved the existing warning-based clamp only for the recoverable case (where the current request can fit if we drop/trim sources).

#### [index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/index.js)
- Propagated the `rejected` field from the budget object through `buildContextPipeline`.

### 2. Chat Service Integration

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- Checked for a `pipeline.rejected` state after building the context pipeline.
- Threw a clear descriptive error before initiating `streamRequest` or calling the provider, preventing unnecessary API calls and displaying the limit error directly to the user.

### 3. Unit Tests

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)
- Added the unit test `rejects a request that cannot fit even with every source dropped`. It sets a small context window (`1000` tokens) and a large user message (`5000` chars), asserting that `budgetContext` successfully returns a rejected status with code `input_too_large`.

---

## Verification Results

### 1. Type Checks & Compilation
Ran `npm run check` to verify TypeScript and Svelte diagnostics:
```sh
npm run check
```
```Output
svelte-check found 0 errors and 17 warnings in 9 files
```

### 2. Unit Tests
Ran the context pipeline test suite:
```sh
npx vitest run tests/chat/contextPipeline/
```
```Output
 RUN  v4.1.10 /Users/nguyenle/Documents/GitHub/Summarizerrrr

 ✓ tests/chat/contextPipeline/sourceResolver.test.js (2 tests) 4ms
 ✓ tests/chat/contextPipeline/systemInstruction.test.js (15 tests) 5ms
 ✓ tests/chat/contextPipeline/contextPipeline.test.js (28 tests) 10ms

 Test Files  3 passed (3)
      Tests  45 passed (45)
   Start at  15:34:38
   Duration  304ms (transform 155ms, setup 93ms, import 184ms, tests 20ms, environment 0ms)
```

Ran the full chat test suite:
```sh
npx vitest run tests/chat/
```
```Output
 Test Files  31 passed (31)
      Tests  288 passed (288)
   Start at  15:34:40
   Duration  5.47s (transform 11.81s, setup 875ms, import 16.58s, tests 1.17s, environment 8.44s)
```

---

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Baseline and new tests in `contextPipeline` suite pass successfully (45/45).
- [x] Full chat test suite passes successfully (288/288).
- [x] Zero type checking errors reported by `svelte-check`.
- [x] Context rejection logic correctly stops execution before network calls are made.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Paste a huge body of text (~500k characters) into the chat composer while using a model with a small context window (e.g. local Ollama model at 4k/8k tokens). Verify that the request is immediately blocked, displaying a clean error message in the UI, and checking the Network tab to ensure zero network requests are dispatched to the provider.
