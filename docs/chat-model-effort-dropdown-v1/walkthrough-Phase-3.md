# Walkthrough - Phase 3: Delete the obsolete component + its test

Phase 3 of the **chat-model-effort-dropdown-v1** plan deletes the now-unused `ChatReasoningSelect.svelte` component and its test file, completing the cleanup after the reasoning UI was merged into `ChatModelSelect.svelte` (Phase 1) and removed from `ChatComposer.svelte` (Phase 2).

## Changes Made

### 1. Deleted files

#### [DELETE] ChatReasoningSelect.svelte
- `src/components/chat/ChatReasoningSelect.svelte` — the standalone reasoning effort pill dropdown, superseded by the submenu inside `ChatModelSelect.svelte`.

#### [DELETE] ChatReasoningSelect.test.svelte.js
- `tests/chat/composer/ChatReasoningSelect.test.svelte.js` — test suite for the deleted component.

## Verification Results

### 1. Grep — no remaining references

```sh
grep -rn "ChatReasoningSelect" src tests
```

Output: empty (exit code 1 — no matches). ✅

### 2. Type Checks & Compilation

```sh
npm run check
```

```
svelte-check found 0 errors and 17 warnings in 9 files
```

### 3. Test Suite

```sh
npm test
```

```
 Test Files  46 passed (46)
      Tests  461 passed (461)
   Duration  6.64s
```

No "cannot find module ChatReasoningSelect" failure. ✅

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `grep -rn "ChatReasoningSelect" src tests` returns nothing
- [x] `npm run check` — 0 errors
- [x] `npm test` — 46 files, 461 tests pass

### Still-Required Manual Verification (To Be Done by User)
- [ ] None — this phase is purely deletion with no behavioral changes beyond what was verified in Phases 1–2.

## Known Follow-ups

- **Phase 4** updates the `ChatModelSelect` test with effort-suffix assertions and adds i18n keys for the "Reasoning" submenu label.
