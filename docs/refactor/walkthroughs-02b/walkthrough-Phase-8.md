# Walkthrough - Phase 8: `inputs/` (10 of 13 move, 3 stay shared)

Implemented Phase 8 of the [Full Component Reorg plan](../02b-full-reorg-plan.md): 10 of the 13 files in `src/components/inputs/` were moved to `src/entrypoints/settings/components/inputs/` — their single owning surface — using the plan's `mv_component` helper. The remaining 3 genuinely shared inputs (`LanguageSelect`, `ReusableSelect`, `ShadowDOMLanguageSelect`) stay in `src/components/inputs/`.

## Changes Made

### 1. `inputs/` → settings (10 files)

#### [src/entrypoints/settings/components/inputs/ApiKeyInput.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/ApiKeyInput.svelte)
- Moved from `src/components/inputs/ApiKeyInput.svelte`.

#### [src/entrypoints/settings/components/inputs/ApiKeyInputMulti.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/ApiKeyInputMulti.svelte)
- Moved from `src/components/inputs/ApiKeyInputMulti.svelte`.

#### [src/entrypoints/settings/components/inputs/EnableToggle.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/EnableToggle.svelte)
- Moved from `src/components/inputs/EnableToggle.svelte`.

#### [src/entrypoints/settings/components/inputs/FeatureModelPicker.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/FeatureModelPicker.svelte)
- Moved from `src/components/inputs/FeatureModelPicker.svelte`.

#### [src/entrypoints/settings/components/inputs/ReusableCombobox.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/ReusableCombobox.svelte)
- Moved from `src/components/inputs/ReusableCombobox.svelte`.

#### [src/entrypoints/settings/components/inputs/Switch.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/Switch.svelte)
- Moved from `src/components/inputs/Switch.svelte`.

#### [src/entrypoints/settings/components/inputs/SwitchPermission.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/SwitchPermission.svelte)
- Moved from `src/components/inputs/SwitchPermission.svelte`.

#### [src/entrypoints/settings/components/inputs/TextInput.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/TextInput.svelte)
- Moved from `src/components/inputs/TextInput.svelte`.

#### [src/entrypoints/settings/components/inputs/ToolEnableToggle.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/ToolEnableToggle.svelte)
- Moved from `src/components/inputs/ToolEnableToggle.svelte`.

#### [src/entrypoints/settings/components/inputs/UILanguageSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/UILanguageSelect.svelte)
- Moved from `src/components/inputs/UILanguageSelect.svelte`.

`entrypoints/settings/components/inputs/` already held `ProviderModelSelect.svelte`, which arrived there in Phase 6 — it was left untouched, bringing the directory's total to 11 files as the plan's verify step expects.

### 2. Staying in `src/components/inputs/` (3 files, unchanged)

`LanguageSelect.svelte`, `ReusableSelect.svelte` (content+settings+sidepanel); `ShadowDOMLanguageSelect.svelte` (content+sidepanel) — left in place, per the plan's shared-ownership list.

### 3. Importers rewritten (`@/components/inputs/{moved-name}` → new paths)

The helper's `@/`-alias rewrite updated every specifier across `src/`. Confirmed by grepping for the 10 moved basenames outside their own new files:

- [src/components/settings/SummarySettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/SummarySettings.svelte) — `Switch`, `FeatureModelPicker` rewritten to `@/entrypoints/settings/components/inputs/...`.
- [src/components/settings/OpenAICompatibleProfileConfig.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/OpenAICompatibleProfileConfig.svelte) — `ApiKeyInputMulti` rewritten.
- [src/components/settings/DataSyncSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/DataSyncSettings.svelte) — `SwitchPermission` rewritten.
- [src/components/settings/ChatSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/ChatSettings.svelte) — `FeatureModelPicker` rewritten.
- [src/components/settings/tools/DeepDiveToolSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/tools/DeepDiveToolSettings.svelte) — `ToolEnableToggle`, `FeatureModelPicker` rewritten.
- [src/components/settings/tools/CloudSyncToolSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/tools/CloudSyncToolSettings.svelte) — `ToolEnableToggle`, `EnableToggle`, `TextInput`, `ApiKeyInput` rewritten.
- [src/components/settings/AppearanceSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/AppearanceSettings.svelte) — `UILanguageSelect` rewritten.
- [src/components/settings/ExportImport.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/ExportImport.svelte) — `SwitchPermission` rewritten.
- [src/components/settings/ProviderKeyConfig.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/ProviderKeyConfig.svelte) — `ApiKeyInputMulti` rewritten.
- [src/entrypoints/settings/components/inputs/ProviderModelSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/inputs/ProviderModelSelect.svelte) (already at this path since Phase 6) — its own `ReusableCombobox` import rewritten to the new sibling path.

- [tests/settings/FeatureModelPicker.test.svelte.js:51](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/settings/FeatureModelPicker.test.svelte.js) — the `@/`-form import the plan calls out by name was rewritten to `@/entrypoints/settings/components/inputs/FeatureModelPicker.svelte`.

(`tests/chat/composer/ChatRichTextInput.test.svelte.js` and `src/entrypoints/sidepanel/components/chat/ChatComposer.svelte` matched a substring search for `TextInput.svelte` only because `ChatRichTextInput.svelte` ends in that string — neither actually imports the moved `TextInput.svelte`; both were left untouched, correctly.)

No relative (repo-root form, `src/components/inputs/...`) test imports existed for these 10 files, so the helper's second rewrite made no changes this phase.

### 4. Cleanup

- Ran `find src/components -type d -empty -delete` after the moves. `src/components/inputs/` was not left empty (it still holds its 3 shared files), so no directory was removed.

### Method

Used the plan's `mv_component` shell helper exactly as specified in "The move helper" section, running the single `for` loop over the 10 names in the order written in the plan. All 10 `mv_component` calls succeeded on the first pass (no `FAILED` output).

## Verification Results

### 1. Structural check (plan's Phase 8 verify step)
```sh
ls src/components/inputs | wc -l
ls src/entrypoints/settings/components/inputs | wc -l
```
Output:
```
3
11
```
Matches the plan's required counts exactly: 3 shared files remain in `src/components/inputs/` (`LanguageSelect`, `ReusableSelect`, `ShadowDOMLanguageSelect`); 11 files now in `src/entrypoints/settings/components/inputs/` (the 10 moved this phase + `ProviderModelSelect` from Phase 6).

- `git status --short` shows all 10 moved files as git renames (`R`, or `RM` for `FeatureModelPicker.svelte` and `UILanguageSelect.svelte`, which already carried a pre-existing unstaged Phase 1 import-normalization edit — same benign pattern documented in the Phase 7 walkthrough).
- `rg` for the 10 moved basenames anywhere in `src`/`tests` outside their own new files finds only the 10 importer files listed above, all pointing at the correct new `@/entrypoints/settings/components/inputs/...` paths — no stale `@/components/inputs/...` references remain for the moved files.

### 2. Automated Tests
```sh
npm test
```
Output:
```
 Test Files  50 passed (50)
      Tests  494 passed (494)
```
Matches the plan's baseline exactly (50 files / 494 tests) — no test was dropped or added by the move.

### 3. Type Checks & Compilation
```sh
npm run check
```
Output (tail):
```
1785230913837 START "/Users/nguyenle/Documents/GitHub/Summarizerrrr"
...
1785230913843 COMPLETED 1622 FILES 0 ERRORS 14 WARNINGS 8 FILES_WITH_PROBLEMS
```
0 errors; the 14 warnings are the same pre-existing set documented in the plan's baseline (one of them, the `non_reactive_update` warning in `ToolEnableToggle.svelte`, now reports at its new path `src/entrypoints/settings/components/inputs/ToolEnableToggle.svelte` — this is the expected "14 warnings at a new path," not a regression).

### 4. Builds
```sh
npm run build
npm run build:firefox
```
Output (tail):
```
Σ Total size: 12.93 MB
✔ Finished in 15.5 s   (chrome-mv3)
Σ Total size: 12.93 MB
✔ Finished in 16.4 s   (firefox-mv2)
```
Both builds completed successfully with no errors.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `ls src/components/inputs | wc -l` → 3, matching the exact shared-file list in the plan.
- [x] `ls src/entrypoints/settings/components/inputs | wc -l` → 11 (10 moved + `ProviderModelSelect` from Phase 6).
- [x] All 10 moves recorded as git renames; no orphaned old paths.
- [x] No empty directories left under `src/components/`.
- [x] `npm test` → 50 files / 494 tests passed (matches baseline).
- [x] `npm run check` → 0 errors, 14 pre-existing warnings (matches baseline).
- [x] `npm run build` → succeeds.
- [x] `npm run build:firefox` → succeeds.

### Still-Required Manual Verification (To Be Done by User)
- [ ] None specific to this phase. The final plan-wide manual smoke test (summarize from side panel, floating panel, settings, archive, popup) is deferred to Phase 11 per the plan's "Final verification checklist," once all moves are complete.
