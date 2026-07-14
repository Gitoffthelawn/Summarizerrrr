# Walkthrough - Phase 1: New `addedProviders` state + migration

Phase 1 of the **provider-add-flow-v1** plan introduces the `addedProviders` setting — a new array that tracks which providers the user has explicitly added to their settings UI. Existing users are automatically seeded with every provider they have already configured (keyed), while fresh installs start with `['gemini']` only.

## Changes Made

### 1. Settings Store

#### [settingsStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/settingsStore.svelte.js)
- Added `addedProviders: ['gemini']` to `DEFAULT_SETTINGS` (line 158).
- Imported `listConfiguredProviders` from `providerRegistry.js` (line 6).
- Added migration logic in `normalizeStoredSettings()`: when `addedProviders` is absent, seeds it to `['gemini', ...configuredProviderIds]` — idempotent, only runs when key is missing (lines 384–390).
- Added `addProvider(id)` — dedupe-appends a provider to `addedProviders` via `updateSettings` (lines 937–949).
- Added `removeProvider(id)` — removes a provider from `addedProviders`; refuses to remove `'gemini'`; does NOT clear the provider's API key (non-destructive) (lines 951–965).

### 2. Settings Schema

#### [settingsSchema.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/config/settingsSchema.js)
- Added `'addedProviders'` to `VALID_SETTING_KEYS` in the Provider Configuration section (line 39). Without this, `sanitizeSettings()` would strip the key on every load/save.

### 3. Tests

#### [addedProvidersMigration.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/settings/addedProvidersMigration.test.js)
- 9 new test cases covering:
  - Fresh install → `addedProviders === ['gemini']`
  - Legacy with `deepseekApiKey` → contains both `gemini` and `deepseek`
  - Legacy with `groqApiKey` + `ollamaEndpoint` → all three present
  - Idempotency — running migration twice yields the same result
  - Existing `addedProviders` is not overwritten by migration
  - `addProvider` appends and deduplicates
  - `removeProvider` removes non-gemini providers
  - `removeProvider` refuses to remove gemini
  - `removeProvider` is non-destructive (API key preserved)

## Verification Results

### 1. Unit Tests

```sh
npm test
```

Output:
```
 ✓ tests/settings/addedProvidersMigration.test.js (9 tests) 24ms
 ✓ tests/settings/featureModelMigration.test.js (8 tests) 12ms
 ... (33 more suites)

 Test Files  35 passed (35)
      Tests  249 passed (249)
   Duration  5.64s
```

### 2. Type Checks

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 18 warnings in 8 files
```

All 18 warnings are pre-existing (deprecated Svelte event directives in `Drawer.svelte`), unrelated to this change.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm test` — all 249 tests pass (35 suites), including 9 new migration tests
- [x] `npm run check` — 0 errors

### Still-Required Manual Verification (To Be Done by User)
- [ ] `npm run dev` → load `.output/chrome` as unpacked extension → open settings → confirm `addedProviders` is populated correctly in storage (DevTools → Application → Local Storage)
- [ ] For an existing profile with multiple API keys set: confirm migration seeds all configured providers into `addedProviders`

## Known Follow-ups
- Phase 2 will consume `addedProviders` in `AIProviderSettings.svelte` to render provider cards and the "Add provider" button.
