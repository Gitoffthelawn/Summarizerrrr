# Walkthrough - Phase 3: Separate render order from priority order

This phase of the [Chat Context Budget & Warning Quality — V1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-context-budget-v1.md) plan decouples the prompt priority calculation from the physical render layout. This prevents active tab state changes from breaking provider prompt caching by ensuring grounding sources are rendered in stable caller order.

## Changes Made

### 1. Context Pipeline Budgeting

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)
- Decoupled priority-based budgeting and rendering order by associating each source group with its original caller index.
- Sorted a copy of the source groups by priority (`isActive`) to determine which sources fit and to deduct their estimated tokens from the remaining budget.
- Outputted the selected sources in their original caller order, populating warnings, diagnostics, and final output arrays (`budgetedConversationSources` and `budgetedAttachmentSources`) deterministically.

### 2. Unit Tests

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)
- Added the unit test `renders sources in caller order regardless of which one is active`. It executes `budgetContext` with different active sources and asserts that the resulting order of conversation sources always matches the stable caller sequence.

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

 ✓ tests/chat/contextPipeline/sourceResolver.test.js (2 tests) 3ms
 ✓ tests/chat/contextPipeline/systemInstruction.test.js (15 tests) 5ms
 ✓ tests/chat/contextPipeline/contextPipeline.test.js (27 tests) 9ms

 Test Files  3 passed (3)
      Tests  44 passed (44)
   Start at  15:25:39
   Duration  186ms (transform 114ms, setup 76ms, import 134ms, tests 17ms, environment 0ms)
```

Ran the full chat test suite:
```sh
npx vitest run tests/chat/
```
```Output
 Test Files  31 passed (31)
      Tests  287 passed (287)
   Start at  15:25:41
   Duration  4.88s (transform 10.82s, setup 719ms, import 15.12s, tests 1.01s, environment 7.39s)
```

---

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Baseline and new tests in `contextPipeline` suite pass successfully (44/44).
- [x] Full chat test suite passes successfully (287/287).
- [x] Zero type checking errors reported by `svelte-check`.
- [x] Source sorting algorithm tested and verified to keep render order independent of `isActive` flags.

### Still-Required Manual Verification (To Be Done by User)
- [ ] In the running extension, verify that changing the active tab between turns does not invalidate the prompt cache prefix on models supporting prompt caching (such as Anthropic or Gemini).
