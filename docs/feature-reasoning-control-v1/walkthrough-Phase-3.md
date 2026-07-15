# Walkthrough - Phase 3: Deep Dive

Phase 3 of the `feature-reasoning-control-v1` plan added a user-facing Reasoning control
(`Off / Low / Medium`, default `Off`) to the Deep Dive Tool Settings UI and replaced the
hardcoded `buildNoThinkingProviderOptions` with the shared `buildReasoningRequestOptions`
from `reasoningConfig.js`.

## Changes Made

### 1. Settings Store

#### [settingsStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/settingsStore.svelte.js)
- Added `reasoningLevel: 'off'` to the `tools.deepDive` default block

### 2. Deep Dive Service — Replace Hardcoded Logic

#### [deepDiveService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/tools/deepDiveService.js)
- Added imports for `buildReasoningRequestOptions` and `normalizeTaskReasoningLevel` from `reasoningConfig.js`
- Replaced both call sites (lines ~100, ~129) from `{ providerOptions: noThinkingOptions, abortSignal }` to `{ abortSignal, ...reasoningOptions }` — fixing the return shape mismatch noted in the plan (old helper returned the *inside* of `providerOptions`, the new one returns the full options object to spread)
- Both call sites are question generation (initial + retry), so both use the user's `settings.tools.deepDive.reasoningLevel` — default `'off'` preserves existing behaviour
- Deleted the `buildNoThinkingProviderOptions` function (57 lines of duplicated family-detection logic)

### 3. Deep Dive Settings UI

#### [DeepDiveToolSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/tools/DeepDiveToolSettings.svelte)
- Imported `TASK_REASONING_CHOICES` from `reasoningConfig.js` and `updateToolSettings` from the settings store
- Added a new "Reasoning" section after the Auto Generate Mode block, using the same data-driven `{#each}` + `ButtonSet` pattern as `SummarySettings.svelte`
- Uses `updateToolSettings('deepDive', { reasoningLevel })` for persistence via the nested tool settings path

### 4. Internationalization

#### [en.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/en.json)
- Added `settings.tools.deepdive.reasoning_*` keys: `reasoning_title`, `reasoning_description`, `reasoning_off`, `reasoning_off_desc`, `reasoning_low`, `reasoning_low_desc`, `reasoning_medium`, `reasoning_medium_desc`

#### [vi.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/vi.json), [zh-CN.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/zh-CN.json), [fr.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/fr.json), [de.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/de.json), [es.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/es.json), [ja.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ja.json), [ko.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ko.json)
- Added translated `settings.tools.deepdive.reasoning_*` blocks for all 7 remaining locales

## Verification Results

### 1. Full test suite

Ran `npx vitest run`:

```
 Test Files  40 passed (40)
      Tests  386 passed (386)
   Duration  7.19s
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npx vitest run` — full suite: 40 files, 386 tests pass, no regressions

### Still-Required Manual Verification (To Be Done by User)
- [ ] `npm run dev` → load `.output/chrome` as unpacked extension
  1. Settings › Tools › Deep Dive → confirm "Reasoning" section appears after Auto Generate Mode with `Off / Low / Medium` buttons, defaulting to `Off`
  2. Change reasoning to `Medium` → reload extension → confirm it persists
  3. Summarize a page → open Deep Dive → Network tab: default model `gemma-4-26b-a4b-it` with `Off` sends `thinkingLevel: 'minimal'` (**not** `thinkingBudget` — that's the SDK mis-mapping the plan warns about)
  4. Switch to `Medium` → confirm the request body changes to `thinkingLevel: 'medium'`

## Known Follow-ups
- Phase 4 removes the old Thinking Level from provider config, adds migration from `geminiThinkingLevel`, and cleans up dead i18n keys
