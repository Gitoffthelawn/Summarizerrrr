# Walkthrough - Phase 3: Feature picker auto-collapse

Phase 3 of the `provider-add-flow-v1` plan implements the "hide provider dropdown when ≤1 provider has a key" rule in `FeatureModelPicker.svelte`. When only zero or one provider is configured, the component now shows only the model selector — the provider dropdown appears only when two or more providers have keys/endpoints set.

## Changes Made

### 1. Feature Model Picker — auto-collapse logic

#### [FeatureModelPicker.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/inputs/FeatureModelPicker.svelte)
- Added `showProviderDropdown` derived flag: `configuredProviders.length >= 2`
- Added `effectiveProvider` derived value: when collapsed, uses the single configured provider's id (or `'gemini'` if none configured); when expanded, uses the bound `provider` prop as-is
- Added `$effect` to sync the bound `provider`/`model` when collapsed and the bound value drifts from `effectiveProvider` (e.g. user removed a second provider's key) — fires `onchange` to keep the feature block consistent
- Wrapped the provider `ReusableSelect` dropdown and its unconfigured warning inside `{#if showProviderDropdown}` so the entire provider section is hidden when ≤1 provider is configured
- Changed `currentProviderEntry`, `isCurrentUnconfigured`, and `staticItems` derivations to use `effectiveProvider` instead of the raw `provider` prop, ensuring the model control always reflects the correct provider in both collapsed and expanded states

## Verification Results

### 1. Type Checks

- Ran `npm run check` → **0 errors**, 20 pre-existing warnings (unrelated Svelte deprecated event directives in Drawer.svelte)

```sh
npm run check
```

```
svelte-check found 0 errors and 20 warnings in 9 files
```

### 2. Production Build

- Ran `npm run build` → **success** in 3.85s

```sh
npm run build
```

```
Total size:  2,045.62 kB
Gzip size:     459.28 kB
✓ built in 3.85s
```

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] `npm run check` — 0 errors
- [x] `npm run build` — succeeds

### Still-Required Manual Verification (To Be Done by User)

- [ ] With only Gemini keyed, open Summary/Chat settings — confirm **model-only** control is shown (no provider dropdown)
- [ ] Add + key a second provider (e.g. OpenAI) — confirm the **provider dropdown** now appears in Summary/Chat feature pickers
- [ ] Remove the second provider's key — confirm the picker collapses back to model-only and the feature block auto-syncs to the remaining configured provider

## Known Follow-ups

- Phase 4 will remove the per-feature `isAdvancedMode` / `isSummaryAdvancedMode` gates in `SummarySettings`, `ChatSettings`, and `DeepDiveToolSettings`, making the auto-collapsing `FeatureModelPicker` always visible
