# Walkthrough - Phase 4: `ChatContextDonut` (UI-3) + the composer action row

Phase 4 of the [chat-composer-ui-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-composer-ui-v1.md) plan replaced the horizontal context meter with an SVG donut and reorganized the composer layout into a proper action row below the input.

## Changes Made

### 1. New Component — ChatContextDonut

#### [ChatContextDonut.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatContextDonut.svelte)
- 18px SVG donut with track circle (`--blackwhite-5`) and progress circle filled from 12 o'clock
- Maths lifted verbatim from `ChatContextMeter.svelte`: `capacity = inputBudget || window`, `percent = clamp(round(used / capacity * 100), 0, 100)`, `level` bands at 80% (warning) and 95% (error)
- **Hover** → `Tooltip` showing `{percent}%`
- **Click** → bits-ui `Popover` (side=top, align=end) with label/value rows:
  - **Model** — resolved via `resolveProviderEntry(providerId, settings)` with warning state for deleted profiles
  - **Context window** — `used / window` (the full window)
  - **Input budget** — `used / capacity` (the donut's actual denominator)
  - **Input / Output / Cache** — from the enriched Phase 3 diagnostics; Cache row omitted when `null`
  - **Source** badge (`exact`/`catalog`/`curated`/`estimated`) from `SOURCE_LABELS`
- `usage: null` (before first send) renders the donut at 0% with an "unknown" aria-label and only the Model row in the popover
- `aria-label="Context window usage: {percent}%"`, keyboard-openable

### 2. Composer Action Row

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)
- Pulled `ChatReasoningSelect` **out** of the `absolute bottom-1.5 right-1.5` overlay (the round Send/Stop button stays untouched in that overlay)
- Added a right-aligned flex row **below** the input wrapper: `[ChatReasoningSelect] [ChatContextDonut]`, `gap-1.5`, vertically centered
- `ChatModelSelect` (Phase 5 placeholder) goes leftmost in the row — currently absent
- Moved the `pendingEstimate` derivation here (was in `ChatShell`)

### 3. Shell Cleanup & Deletion — Removed ChatContextMeter

#### [ChatShell.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatShell.svelte)
- Removed `ChatContextMeter` import and its `<ChatContextMeter>` element
- Removed the `pendingEstimate` `$derived` (moved to `ChatComposer`)
- `ChatContextWarning` remains untouched

#### [ChatContextMeter.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatContextMeter.svelte) [DELETE]
- Deleted the file after verifying it is no longer used or imported anywhere in the codebase.

### 4. i18n

#### All 8 locale files ([en](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/en.json), [de](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/de.json), [es](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/es.json), [fr](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/fr.json), [ja](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ja.json), [ko](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ko.json), [vi](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/vi.json), [zh-CN](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/zh-CN.json))
- Added `chat.context_donut.*` keys: `aria_usage`, `aria_unknown`, `model`, `unknown_provider`, `context_window`, `input_budget`, `input`, `output`, `cache`, `source`

### 5. Tests

#### [ChatContextDonut.test.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/composer/ChatContextDonut.test.svelte.js)
- `usage: null` renders without throwing and shows no stale numbers
- `percent` and `level` bands verified at 79% (normal), 80% (warning), 95% (error) — all against `inputBudget`, **not** `window`
- Explicit test proving `inputBudget` is the denominator (80K / 100K budget = warning, not 80K / 128K window = normal)
- Unresolvable `providerId` renders without throwing

## Verification Results

### 1. Donut-specific tests

```sh
npx vitest run tests/chat/composer/ChatContextDonut.test.svelte.js
```

```
 ✓ tests/chat/composer/ChatContextDonut.test.svelte.js (6 tests) 46ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  3.80s
```

### 2. Full test suite

```sh
npx vitest run
```

```
 Test Files  43 passed (43)
      Tests  440 passed (440)
   Duration  8.66s
```

### 3. Type check

```sh
npm run check
```

```
svelte-check found 0 errors and 17 warnings in 9 files
```

All warnings are pre-existing (unrelated a11y/CSS warnings in settings components).

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `percent` and `level` bands at 79/80/95 against `inputBudget`, not `window`
- [x] `usage: null` renders without throwing and shows no stale numbers
- [x] Unresolvable `providerId` renders warning state instead of throwing
- [x] `ChatReasoningSelect` moved from absolute overlay to action row below input
- [x] `ChatContextMeter` removed from `ChatShell`; `ChatContextWarning` preserved
- [x] `pendingEstimate` derivation moved from `ChatShell` to `ChatComposer`
- [x] Deleted `ChatContextMeter.svelte` after confirming it has zero imports/usages in the codebase
- [x] All 8 locale files updated with `chat.context_donut.*` keys
- [x] Full test suite (440 tests) passes with no regressions
- [x] `svelte-check` passes (0 errors)

### Still-Required Manual Verification (To Be Done by User)
- [ ] Load `.output/chrome` and verify the donut renders in the action row next to the reasoning selector
- [ ] Hover the donut → tooltip shows `%`; click → popover shows Model / Context window / Input budget / Output / Cache rows
- [ ] On a provider with no cache reporting, the Cache row is absent
- [ ] Donut turns warning at 80% and error at 95% of the input budget
- [ ] The action row does not wrap or clip at the 22.5rem min width (`ChatShell:48`)
