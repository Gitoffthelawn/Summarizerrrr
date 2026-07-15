# Walkthrough - Phase 2: Summary

Phase 2 of the `feature-reasoning-control-v1` plan added a user-facing Reasoning control
(`Off / Low / Medium`, default `Off`) to the Summary Settings UI and threaded the selected
level through all 6 AI SDK call sites in `api.js`.

## Changes Made

### 1. Settings Store

#### [settingsStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/settingsStore.svelte.js)
- Added `reasoningLevel: 'off'` to the `summarize` settings block default

### 2. API Layer — Provider Resolution & Reasoning Threading

#### [api.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/api.js)
- Added imports for `buildReasoningRequestOptions` and `normalizeTaskReasoningLevel` from `reasoningConfig.js`
- Extended `resolveSummarizeProvider()` return type to include `featureProviderId` and `modelId` alongside the adapter-level `providerId`. This avoids the trap where OpenAI-compatible profiles collapse to `openaiCompatible` — reasoning lookup needs the original feature provider id
- Threaded reasoning options into all 6 call sites:
  1. `summarizeContent` (line ~149) — non-streaming summary
  2. `summarizeContentStream` (line ~255) — streaming summary
  3. `enhancePrompt` (line ~312) — prompt enhancement
  4. `summarizeChapters` (line ~351) — chapter summary non-streaming
  5. `summarizeChaptersStream` (line ~394) — chapter summary streaming
  6. `summarizeContentStreamEnhanced` (line ~525) — enhanced streaming
- **Bonus fix:** replaced 5 references to undefined `selectedProviderId` in catch blocks with the correct `providerId` local. This was a pre-existing bug documented in the plan where `console.error` would throw a `ReferenceError` masking the real error

### 3. Summary Settings UI

#### [SummarySettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/SummarySettings.svelte)
- Imported `TASK_REASONING_CHOICES` from `reasoningConfig.js`
- Added a new "Reasoning" section after Tone, using the data-driven `{#each}` pattern with `ButtonSet` components in a 3-column grid
- Uses `updateFeatureSettings('summarize', { reasoningLevel })` to persist via the nested key path (avoids `sanitizeSettings()` stripping flat keys)
- Labels use i18n with `{ default: option.label }` fallback

### 4. Internationalization

#### [en.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/en.json)
- Added `settings.summary.reasoning` block with `title`, `off`, `off_desc`, `low`, `low_desc`, `medium`, `medium_desc`

#### [vi.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/vi.json), [zh-CN.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/zh-CN.json), [fr.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/fr.json), [de.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/de.json), [es.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/es.json), [ja.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ja.json), [ko.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ko.json)
- Added translated `settings.summary.reasoning` blocks for all 7 remaining locales

### 5. Test Update

#### [featureModelMigration.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/settings/featureModelMigration.test.js)
- Updated assertion to include `reasoningLevel: 'off'` in the expected `settings.summarize` object after cloud sync ingress

## Verification Results

### 1. Full test suite

Ran `npx vitest run`:

```
 Test Files  40 passed (40)
      Tests  386 passed (386)
   Duration  6.24s
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npx vitest run` — full suite: 40 files, 386 tests pass, no regressions

### Still-Required Manual Verification (To Be Done by User)
- [ ] `npm run dev` → load `.output/chrome` as unpacked extension
  1. Settings › Summary → confirm "Reasoning" section appears after Tone with `Off / Low / Medium` buttons, defaulting to `Off`
  2. Change reasoning to `Medium` → reload extension → confirm it persists
  3. Summarize a page with Gemini → Network tab: `Off` produces `thinkingConfig: { thinkingBudget: 0 }` (Gemini 2.5) or `{ thinkingLevel: 'minimal' }` (Gemini 3 Flash); `Medium` produces `thinkingBudget: 8000` or `thinkingLevel: 'medium'`
  4. Switch Summary provider to OpenRouter → confirm `reasoning.effort` appears in the request body

## Known Follow-ups
- Phase 3 adds the same Reasoning control to Deep Dive
- Phase 4 removes the old Thinking Level from provider config and adds migration
