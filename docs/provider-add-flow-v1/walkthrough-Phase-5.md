# Walkthrough - Phase 5: Retire the Basic/Advanced runtime forcing

Phase 5 of the `provider-add-flow-v1` plan removes all runtime logic that forced Gemini when `isAdvancedMode` was false. Provider resolution now always honors the feature block (`settings[feature].provider/model`), and custom prompts apply based purely on their per-item selection, not on any advanced-mode flag. The `isAdvancedMode` / `isSummaryAdvancedMode` keys remain in the schema and mirror writes as vestigial sync keys.

## Changes Made

### 1. Feature Model Resolver

#### [featureModelResolver.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/providers/featureModelResolver.js)
- Deleted the `if (settings.isAdvancedMode === false) { providerId = 'gemini' }` branch
- The resolver now always reads `settings[feature].provider/model` first, then falls back to legacy derivation (`selectedProvider` + `selected*Model`), then the existing "unconfigured → Gemini" fallback
- Renumbered comments from "1/2/3" to "1/2" after removing the force-Gemini step

### 2. Summary Store

#### [summaryStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/summaryStore.svelte.js)
- Removed all **5** `if (!userSettings.isAdvancedMode) { selectedProviderId = 'gemini' }` blocks at lines ~311, ~503, ~639, ~1307, ~1496
- Each site now simply uses `let selectedProviderId = userSettings.selectedProvider || 'gemini'` — the mirrors in `applyFeatureModelMirrors` keep `selectedProvider` correct

### 3. API Module — Custom Prompt Gating

#### [api.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/api.js)
- Dropped `userSettings.isSummaryAdvancedMode &&` from the condition at **3** custom-prompt sites (`summarizeContent`, `summarizeContentStream`, `summarizeContentStreamEnhanced`)
- Custom prompts now apply when `userSettings[selectionKey] && userSettings[customPromptKey]` — purely based on per-item selection + content
- Updated 2 debug log strings to remove the obsolete "Advanced mode" reference

### 4. API Key Validation (bonus find)

#### [useApiKeyValidation.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/composables/useApiKeyValidation.svelte.js)
- Removed the `if (!settings.isAdvancedMode) { actualProvider = 'gemini' }` block — the same force-Gemini pattern existed here too

## Verification Results

### 1. Grep — No Dead References

```sh
grep -rn "Force Gemini in basic mode" src/
```

```
(no output — zero hits)
```

### 2. Type Checks

```sh
npm run check
```

```
svelte-check found 0 errors and 20 warnings in 10 files
```

### 3. Production Build

```sh
npm run build
```

```
Total size:  2,040.10 kB
Gzip size:     457.58 kB
✓ built in 3.87s
```

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] `grep -rn "Force Gemini in basic mode" src/` — zero hits
- [x] `npm run check` — 0 errors
- [x] `npm run build` — succeeds

### Still-Required Manual Verification (To Be Done by User)

- [ ] With `isAdvancedMode` absent or false in storage, configure a non-Gemini provider (e.g. OpenAI) and trigger a summarization — verify the network call goes to the non-Gemini provider (confirming the force is truly retired)
- [ ] Enable a custom prompt for a custom action (e.g. Analyze) and verify it applies at runtime regardless of advanced mode

## Known Follow-ups

- Phase 6 will delete the dead `GeminiBasicConfig.svelte` and `ProvidersSelect.svelte` components, and add i18n keys for the new "Add provider" / "Remove" strings across all 8 locales
- `isAdvancedMode` / `isSummaryAdvancedMode` remain as vestigial sync keys in `DEFAULT_SETTINGS`, `VALID_SETTING_KEYS`, and mirror writes — they will be removed in a future release
