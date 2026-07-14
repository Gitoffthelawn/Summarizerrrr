# Walkthrough - Phase 2: "Model AI" settings: added-list + Add provider button

Phase 2 of the **provider-add-flow-v1** plan rewrites the Model AI settings section to replace the Basic/Advanced toggle with a dynamic provider list driven by `addedProviders`, and adds an "Add provider" dropdown and per-card remove controls.

## Changes Made

### 1. AI Provider Settings

#### [AIProviderSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/AIProviderSettings.svelte)
- **Removed** the Basic/Advanced `Switch`, `TextScramble`, `handleAdvancedModeToggle`, the `GeminiBasicConfig` import, `Label`/`Switch` imports from `bits-ui`, and the entire `{#if settings.isAdvancedMode}` / `{:else}` split.
- Now renders one `ProviderKeyConfig` per id in `settings.addedProviders` using `getProvider(id)`, keeping the existing single-open accordion state (`expandedProviderId` / `toggleProvider`).
- Added an **"Add provider"** dropdown menu below the list: shows not-yet-added providers (`PROVIDER_LIST.filter(p => !addedProviders.includes(p.id))`); selecting one calls `addProvider(id)` and auto-expands it.
- Passes `removable` and `onRemove` props to each `ProviderKeyConfig` (Gemini is never removable).
- Keeps the streaming/non-streaming `ButtonSet` (now always shown) and the setup-guide link.

### 2. Provider Key Config

#### [ProviderKeyConfig.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/ProviderKeyConfig.svelte)
- Added optional `removable` and `onRemove` props.
- Added a remove (×) button in the accordion header, visible only for non-Gemini cards; click calls `onRemove()` with `stopPropagation` so it doesn't toggle the accordion.
- Made the label `flex-1 text-left` so the remove button sits on the right.
- Imported `ButtonSet` component.
- Added a **Gemini-only** thinking-level block (`{#if isExpanded && entry.id === 'gemini'}`) with 3 `ButtonSet`s writing `geminiThinkingLevel` (`minimal` / `medium` / `high`), ported from `GeminiBasicConfig.svelte` using the same i18n keys.

## Verification Results

### 1. Unit Tests

```sh
npm test
```

Output:
```
 Test Files  35 passed (35)
      Tests  249 passed (249)
   Duration  5.71s
```

### 2. Type Checks

```sh
npm run check
```

Output:
```
svelte-check found 0 errors and 20 warnings in 9 files
```

2 new warnings are from the backdrop `div` with event handlers (a11y pattern for dropdown dismiss); pre-existing warnings unchanged.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm test` — all 249 tests pass
- [x] `npm run check` — 0 errors

### Still-Required Manual Verification (To Be Done by User)
- [ ] `npm run dev` → load `.output/chrome`:
  1. Only Gemini shows initially in the provider list
  2. "Add provider" shows a dropdown of remaining providers
  3. Adding a provider creates a new card that persists across settings reload
  4. Removing a non-Gemini provider drops its card but keeps its API key on re-add
  5. Gemini has no remove button and shows thinking-level buttons that persist
  6. Streaming toggle still works

## Known Follow-ups
- Phase 6 will delete `GeminiBasicConfig.svelte` (now unreferenced from this file but still exists) and add proper i18n keys for `add_provider` / `remove_provider`.
