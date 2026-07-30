# Walkthrough - Phase 7: `buttons/` (10 of 18 move, 9 stay shared)

Implemented Phase 7 of the [Full Component Reorg plan](../02b-full-reorg-plan.md): 10 of the 19 files then present in `src/components/buttons/` (18 from the plan's original count plus `QuestionChip.svelte`, which arrived in Phase 6) were moved to their single owning surface — sidepanel, content (floating panel), archive, or settings — using the plan's `mv_component` helper. The remaining 9 genuinely shared buttons stay in `src/components/buttons/`.

## Changes Made

### 1. `buttons/` → sidepanel (3 files)

#### [src/entrypoints/sidepanel/components/ActionButtons.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/ActionButtons.svelte)
- Moved from `src/components/buttons/ActionButtons.svelte`.

#### [src/entrypoints/sidepanel/components/ActionButtonsMini.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/ActionButtonsMini.svelte)
- Moved from `src/components/buttons/ActionButtonsMini.svelte`.

#### [src/entrypoints/sidepanel/components/SettingButton.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/SettingButton.svelte)
- Moved from `src/components/buttons/SettingButton.svelte`.

### 2. `buttons/` → content / floating panel (3 files)

#### [src/entrypoints/content/components/ActionButtonsFP.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/ActionButtonsFP.svelte)
- Moved from `src/components/buttons/ActionButtonsFP.svelte`.

#### [src/entrypoints/content/components/ActionButtonsMiniFP.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/ActionButtonsMiniFP.svelte)
- Moved from `src/components/buttons/ActionButtonsMiniFP.svelte`.

#### [src/entrypoints/content/components/SaveToArchiveButtonFP.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/SaveToArchiveButtonFP.svelte)
- Moved from `src/components/buttons/SaveToArchiveButtonFP.svelte`.

### 3. `buttons/` → archive (2 files)

#### [src/entrypoints/archive/components/ExportMarkdownFAB.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/archive/components/ExportMarkdownFAB.svelte)
- Moved from `src/components/buttons/ExportMarkdownFAB.svelte`.

#### [src/entrypoints/archive/components/SaveToArchiveFromHistoryButton.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/archive/components/SaveToArchiveFromHistoryButton.svelte)
- Moved from `src/components/buttons/SaveToArchiveFromHistoryButton.svelte`.

### 4. `buttons/` → settings (2 files, new `buttons/` subfolder)

#### [src/entrypoints/settings/components/buttons/ButtonRate.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/buttons/ButtonRate.svelte)
- Moved from `src/components/buttons/ButtonRate.svelte`. New directory `entrypoints/settings/components/buttons/` created by this move.

#### [src/entrypoints/settings/components/buttons/ButtonSupport.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/buttons/ButtonSupport.svelte)
- Moved from `src/components/buttons/ButtonSupport.svelte`.

### 5. Staying in `src/components/buttons/` (9 files, unchanged)

`ButtonFont.svelte`, `ButtonIcon.svelte`, `ButtonSet.svelte` (content+settings+sidepanel); `CopyButton.svelte`, `CopyMarkdownButton.svelte`, `DownloadButton.svelte` (archive+content+sidepanel); `SaveToArchiveButton.svelte` (archive+sidepanel); `SummarizeButton.svelte` (content+sidepanel); `QuestionChip.svelte` (arrived in Phase 6) — left untouched, per the plan's explicit "do not merge" note for the overlapping `ActionButtons`/`Mini`/`FP`/`MiniFP` and `SaveToArchiveButton` variants.

### 6. Importers rewritten (`@/components/buttons/{moved-name}` → new paths)

The helper's `@/`-alias rewrite updated every specifier across `src/`. Confirmed by grepping for the 10 moved basenames outside their own new files:

- [src/components/settings/AboutSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/AboutSettings.svelte) — `ButtonSupport`, `ButtonRate` rewritten to `@/entrypoints/settings/components/buttons/...`.
- [src/entrypoints/archive/SidePanel.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/archive/SidePanel.svelte) — `ExportMarkdownFAB` rewritten to `@/entrypoints/archive/components/ExportMarkdownFAB.svelte`.
- [src/entrypoints/sidepanel/App.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/App.svelte) — `SettingButton`, `ActionButtons`, `ActionButtonsMini` rewritten to their new `@/entrypoints/sidepanel/components/...` paths.
- [src/entrypoints/archive/components/displays/SummaryDisplay.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/archive/components/displays/SummaryDisplay.svelte) — `SaveToArchiveFromHistoryButton` rewritten to `@/entrypoints/archive/components/SaveToArchiveFromHistoryButton.svelte`.
- [src/entrypoints/content/components/MobileSheet.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/MobileSheet.svelte) — `ActionButtonsFP`, `ActionButtonsMiniFP` rewritten to `@/entrypoints/content/components/...`.
- [src/entrypoints/content/components/FloatingPanel.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/FloatingPanel.svelte) — `ActionButtonsFP`, `ActionButtonsMiniFP` rewritten to `@/entrypoints/content/components/...`.
- [src/entrypoints/content/components/displays/FloatingPanelFooter.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/displays/FloatingPanelFooter.svelte) — `SaveToArchiveButtonFP` rewritten to `@/entrypoints/content/components/SaveToArchiveButtonFP.svelte`.

No test files referenced any of these 10 components by relative path, so the helper's second (repo-root) rewrite made no changes this phase.

### 7. Cleanup

- Ran `find src/components -type d -empty -delete` after all moves. No directories under `src/components/` were left empty by this phase (`buttons/` still holds its 9 shared files).

### Note: two files also carried a pre-existing uncommitted Phase 1 fix

`ButtonRate.svelte` and `ButtonSupport.svelte` each import `services/animationService.js`. Before this phase ran, the working tree already had that specifier as `@/services/animationService.js` (Phase 1's relative-to-`@/` normalization, applied but not yet staged), while the git index still held the original `../../services/animationService.js`. `git mv` on an unstaged-but-modified file stages the rename using the index's (pre-Phase-1) content and leaves the working-tree fix as an unstaged diff on the new path — this shows up as `RM` in `git status` for these two files. The on-disk file content is correct (verified above); this is a benign byproduct of Phase 1 leaving an uncommitted, unstaged edit, not something introduced by Phase 7, and it resolves normally the next time these files are staged in full.

### Method

Used the plan's `mv_component` shell helper exactly as specified in "The move helper" section, running the four `for` loops in the order written in the plan (sidepanel, content, archive, settings). All 10 `mv_component` calls succeeded on the first pass (no `FAILED` output).

## Verification Results

### 1. Structural check (plan's Phase 7 verify step)
```sh
ls src/components/buttons | wc -l
```
Output:
```
9
```
Matches the plan's required count exactly, and the 9 remaining files are exactly the shared list named in the plan (`ButtonFont`, `ButtonIcon`, `ButtonSet`, `CopyButton`, `CopyMarkdownButton`, `DownloadButton`, `SaveToArchiveButton`, `SummarizeButton`, `QuestionChip`).

- `git status --short` shows all 10 moved files as git renames (`R`, or `RM` for the two files carrying the pre-existing Phase 1 unstaged edit described above — never delete+add).
- `rg` for the 10 moved basenames anywhere in `src`/`tests` outside their own new file finds only the 7 importer files listed above, all already pointing at the correct new `@/entrypoints/...` paths — no stale `@/components/buttons/...` references remain.

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
1785230624407 START "/Users/nguyenle/Documents/GitHub/Summarizerrrr"
...
1785230624414 COMPLETED 1622 FILES 0 ERRORS 14 WARNINGS 8 FILES_WITH_PROBLEMS
```
0 errors; the 14 warnings are the same pre-existing set documented in the plan's baseline (`ToolEnableToggle`, `AIProviderSettings`, `AppearanceSettings` ×5, `ChatSettings`, `DataSyncSettings`, `DeepDiveToolSettings` ×3, `SummarySettings`, `cat.svelte`) — none in the moved button files.

### 4. Builds
```sh
npm run build
npm run build:firefox
```
Output (tail):
```
Σ Total size: 12.93 MB
✔ Finished in 16.0 s   (chrome-mv3)
Σ Total size: 12.93 MB
✔ Finished in 16.4 s   (firefox-mv2)
```
Both builds completed successfully with no errors.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `ls src/components/buttons | wc -l` → 9, matching the exact shared-file list in the plan.
- [x] All 10 moves recorded as git renames; no orphaned old paths.
- [x] No empty directories left under `src/components/`.
- [x] `npm test` → 50 files / 494 tests passed (matches baseline).
- [x] `npm run check` → 0 errors, 14 pre-existing warnings (matches baseline).
- [x] `npm run build` → succeeds.
- [x] `npm run build:firefox` → succeeds.

### Still-Required Manual Verification (To Be Done by User)
- [ ] None specific to this phase. The final plan-wide manual smoke test (summarize from side panel, floating panel, settings, archive, popup) is deferred to Phase 11 per the plan's "Final verification checklist," once all moves are complete.
