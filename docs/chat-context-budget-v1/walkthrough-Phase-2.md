# Walkthrough - Phase 2: Invert the budget: source-side reserves

This phase of the [Chat Context Budget & Warning Quality — V1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-context-budget-v1.md) plan refactors the budgeting system to invert the context allocation by withholding absolute token reserves for history and the current turn. This allows sources to scale into unused context window space on large-context models (such as Gemini/Claude) while maintaining small-context local models' performance.

## Changes Made

### 1. Context Pipeline Budgeting

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)
- Removed the static `SOURCE_BUDGET_FRACTION` constraint.
- Defined absolute reserves:
  - `HISTORY_RESERVE_TOKENS = 8_000` (capped at `HISTORY_RESERVE_MAX_FRACTION = 0.25` of the input budget).
  - `CURRENT_TURN_RESERVE_TOKENS = 2_000` (capped at `CURRENT_TURN_RESERVE_MAX_FRACTION = 0.1` of the input budget).
- Refactored `sourceBudgetTokens` allocation in `budgetContext` to deduct these reserves and safety reserve from the overall input budget, allowing grounding sources to consume all remaining space up to the reserves threshold.

### 2. Unit Tests

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)
- Adjusted the `charges the source wrapper to the budget` test content length from 300 to 340 characters to match the expanded budget limit of 118 tokens under the new reserves calculations.
- Added two new unit tests:
  - `lets a source use the window that history is not using on turn 1`: asserts that under turn 1 (empty history), a large source can consume budget beyond the old static 60% cap.
  - `reserves budget for history while letting sources exceed the old 60% cap`: asserts that even when a large source goes beyond the 60% threshold, the reserved history budget remains protected and history is not trimmed.

---

## Verification Results

### 1. Stash Failure Verification (Tier A)
Before restoring the updated `contextBudgeter.js` code, the new test cases were run against the old budgeting logic to prove they assert correct new constraints. Both tests failed as expected:
```sh
# Running tests with contextBudgeter.js changes stashed:
npx vitest run tests/chat/contextPipeline/
```
```Output
  × lets a source use the window that history is not using on turn 1 0ms
  × reserves budget for history while letting sources exceed the old 60% cap 0ms
```

### 2. Type Checks & Compilation
Ran `npm run check`:
```sh
npm run check
```
```Output
svelte-check found 0 errors and 17 warnings in 9 files
```

### 3. Unit Tests
Ran the full test suite with the restored implementation:
```sh
npx vitest run tests/chat/contextPipeline/
```
```Output
 RUN  v4.1.10 /Users/nguyenle/Documents/GitHub/Summarizerrrr

 ✓ tests/chat/contextPipeline/sourceResolver.test.js (2 tests) 3ms
 ✓ tests/chat/contextPipeline/systemInstruction.test.js (15 tests) 4ms
 ✓ tests/chat/contextPipeline/contextPipeline.test.js (26 tests) 9ms

 Test Files  3 passed (3)
      Tests  43 passed (43)
   Start at  15:24:38
   Duration  172ms (transform 92ms, setup 70ms, import 115ms, tests 16ms, environment 0ms)
```

---

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Baseline and new tests in `contextPipeline` suite pass successfully (43/43).
- [x] New Phase 2 tests successfully validated to fail on stashed pre-Phase-2 code.
- [x] Zero type checking errors reported by `svelte-check`.
- [x] Verified `SOURCE_BUDGET_FRACTION` is completely removed from the source files.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Perform a manual check by sending a large document on a large-context model (e.g. Claude) and observing the context donut in the side panel. Verify that the source tokens exceed 60% of the input budget on turn 1.
