# Walkthrough - Phase 1: Make the estimate trustworthy

This phase of the [Chat Context Budget & Warning Quality — V1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-context-budget-v1.md) plan corrects the token estimation under-estimation defects. It implements a script-aware token estimator for CJK and Accented Latin scripts, updates the budgeter to calculate wrapper-inclusive costs for grounding sources, user requests, and skills, and adds a residual safety reserve.

## Changes Made

### 1. Context Pipeline Budgeting

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)
- Replaced the naive `chars / 4` token estimator with a script-aware regex-matching tokenizer. Calibrated CJK characters to 1 token/char, Accented Latin characters (like in Vietnamese) to 1.5 tokens/char, and other characters to 4 characters/token.
- Added `ESTIMATOR_SAFETY_FRACTION = 0.05` to provide a safety margin on the overall context budget.
- Refactored `selectedSourceContent` to budget content size against a computed `contentAllowance` (the total remaining budget minus the source's formatted empty wrapper cost).
- Rewrote the truncation loop in `selectedSourceContent` to adaptively shrink character slices using calculated ratios until the estimated token size of the source (with the truncation marker and formatting wrapper) fits the allowance.
- Refactored `budgetContext` to use formatting wrappers when estimating current user requests and active skills, ensuring that system, requests, and skill definitions do not overflow the remaining token budget.

### 2. Unit Tests

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)
- Imported `formatSource` to correctly estimate expected source tokens with wrapper overhead.
- Adjusted context window tokens for the history trimming and diagnostics tests to account for wrapper size overhead and safety reserves.
- Added new tests:
  - `does not under-estimate CJK content`: asserts CJK characters are estimated at roughly 1 token per character.
  - `does not under-estimate accented Vietnamese`: asserts accented Vietnamese text is estimated at ~1.4x the naive English ratio.
  - `leaves plain English estimates unchanged`: asserts English ASCII text matches the original `chars / 4` estimation.
  - `charges the source wrapper to the budget`: verifies that a source which would fit based on raw content size but exceeds budget once formatted wrappers are included is correctly truncated to fit the allowance.

---

## Verification Results

### 1. Type Checks & Compilation
Ran `npm run check`:
```sh
npm run check
```
```Output
svelte-check found 0 errors and 17 warnings in 9 files
```

### 2. Unit Tests
Ran the context pipeline tests using `npx vitest run tests/chat/contextPipeline/`:
```sh
npx vitest run tests/chat/contextPipeline/
```
```Output
 RUN  v4.1.10 /Users/nguyenle/Documents/GitHub/Summarizerrrr

 ✓ tests/chat/contextPipeline/sourceResolver.test.js (2 tests) 3ms
 ✓ tests/chat/contextPipeline/contextPipeline.test.js (24 tests) 8ms
 ✓ tests/chat/contextPipeline/systemInstruction.test.js (15 tests) 5ms

 Test Files  3 passed (3)
      Tests  41 passed (41)
   Start at  15:19:06
   Duration  203ms (transform 122ms, setup 106ms, import 133ms, tests 15ms, environment 0ms)
```

---

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] All 41 tests in the `contextPipeline` suite pass successfully.
- [x] Full workspace type checking (`npm run check`) reports 0 errors.
- [x] Script-aware estimator correctly calibrates for CJK (1:1), Vietnamese accented Latin (1:1.5), and English (1:4) scripts.
- [x] Wrapper overheads and safety margins are correctly accounted for in both the budgeting pipeline and test assertions.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Deploy to dev/staging and monitor actual `promptTokens` on live provider requests using Chinese/Vietnamese content to confirm the pipeline's token estimate is $\ge$ real and within ~30%.
