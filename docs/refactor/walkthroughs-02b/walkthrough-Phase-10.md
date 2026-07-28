# Walkthrough - Phase 10: `ui/` (20 of 22 move, 2 stay + 4 arrived earlier)

Implemented Phase 10 of the [Full Component Reorg plan](../02b-full-reorg-plan.md): 20 of the 22 files in `src/components/ui/` — the dumping-ground folder — were moved to their single owning surface (10 to `entrypoints/settings/components/ui/`, 6 to `entrypoints/sidepanel/components/`, 2 to `entrypoints/archive/components/`, 2 to `entrypoints/content/components/`) using the plan's `mv_component` helper, leaving exactly 6 genuinely-shared files behind. One import the helper's fixed-string rewrite couldn't catch — an extension-less specifier `@/components/ui/paths` in `Field.svelte` referencing the moved `paths.ts` — was fixed by hand.

## Changes Made

### 1. `ui/` → `entrypoints/settings/components/ui/` (10 files)

#### [src/entrypoints/settings/components/ui/ConfirmDialog.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/ConfirmDialog.svelte)
- Moved from `src/components/ui/ConfirmDialog.svelte`.

#### [src/entrypoints/settings/components/ui/Field.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/Field.svelte)
- Moved from `src/components/ui/Field.svelte`.
- Hand-fixed an import the helper missed: `import { fieldPaths } from '@/components/ui/paths'` → `'@/entrypoints/settings/components/ui/paths'`. See "Unplanned fix" below.

#### [src/entrypoints/settings/components/ui/Logo.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/Logo.svelte)
- Moved from `src/components/ui/Logo.svelte`.

#### [src/entrypoints/settings/components/ui/Logo-color.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/Logo-color.svelte)
- Moved from `src/components/ui/Logo-color.svelte`.

#### [src/entrypoints/settings/components/ui/Pivot.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/Pivot.svelte)
- Moved from `src/components/ui/Pivot.svelte`.

#### [src/entrypoints/settings/components/ui/Preview.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/Preview.svelte)
- Moved from `src/components/ui/Preview.svelte`.

#### [src/entrypoints/settings/components/ui/PreviewData.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/PreviewData.svelte)
- Moved from `src/components/ui/PreviewData.svelte`.

#### [src/entrypoints/settings/components/ui/ToolIcon96.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/ToolIcon96.svelte)
- Moved from `src/components/ui/ToolIcon96.svelte`.

#### [src/entrypoints/settings/components/ui/version.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/version.svelte)
- Moved from `src/components/ui/version.svelte`.

#### [src/entrypoints/settings/components/ui/paths.ts](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/settings/components/ui/paths.ts)
- Moved from `src/components/ui/paths.ts`, on its own `mv_component` line per the phase text (the one non-`.svelte` file in the folder, so it doesn't fold into the `.svelte` loop).

### 2. `ui/` → `entrypoints/sidepanel/components/` (6 files)

#### [src/entrypoints/sidepanel/components/Noti.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/Noti.svelte)
- Moved from `src/components/ui/Noti.svelte`.

#### [src/entrypoints/sidepanel/components/cat.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/cat.svelte)
- Moved from `src/components/ui/cat.svelte`.

#### [src/entrypoints/sidepanel/components/PermissionWarningPrompt.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/PermissionWarningPrompt.svelte)
- Moved from `src/components/ui/PermissionWarningPrompt.svelte`.

#### [src/entrypoints/sidepanel/components/SidepanelTabBar.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/SidepanelTabBar.svelte)
- Moved from `src/components/ui/SidepanelTabBar.svelte`.

#### [src/entrypoints/sidepanel/components/TabTitleBar.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/TabTitleBar.svelte)
- Moved from `src/components/ui/TabTitleBar.svelte`.

#### [src/entrypoints/sidepanel/components/Tooltip.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/components/Tooltip.svelte)
- Moved from `src/components/ui/Tooltip.svelte`.

### 3. `ui/` → `entrypoints/archive/components/` (2 files)

#### [src/entrypoints/archive/components/ActionDropdownMenu.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/archive/components/ActionDropdownMenu.svelte)
- Moved from `src/components/ui/ActionDropdownMenu.svelte`.

#### [src/entrypoints/archive/components/TagActionDropdownMenu.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/archive/components/TagActionDropdownMenu.svelte)
- Moved from `src/components/ui/TagActionDropdownMenu.svelte`. 73%-identical twin of `ActionDropdownMenu`; both are archive-only and move together, staying unmerged per the plan's out-of-scope list.

### 4. `ui/` → `entrypoints/content/components/` (2 files)

#### [src/entrypoints/content/components/ShadowTooltip.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/ShadowTooltip.svelte)
- Moved from `src/components/ui/ShadowTooltip.svelte`.

#### [src/entrypoints/content/components/shadowTooltipState.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/content/components/shadowTooltipState.svelte.js)
- Moved from `src/components/ui/shadowTooltipState.svelte.js`, on its own `mv_component` line per the phase text (holds `ShadowTooltip`'s state; content-only, moves together with its component).

### 5. Staying in `src/components/ui/` (6 files, unchanged)

`ApiKeySetupPrompt.svelte`, `HoverTooltip.svelte` (genuinely 2+ surface shared), plus `TabNavigation.svelte` (arrived in Phase 3), `ErrorDisplay.svelte`, `FoooterDisplay.svelte`, `ModelStatusDisplay.svelte` (arrived in Phase 5). Confirmed none of these 6 basenames' importers changed — a grep for `@/components/ui/` across `src` and `tests` after the moves shows only these 6 names remaining, each still referenced from their existing multi-surface consumers (e.g. `HoverTooltip` from `components/buttons/{DownloadButton,SaveToArchiveButton,CopyMarkdownButton,CopyButton}.svelte` and `entrypoints/{archive,content}/components/...`; `TabNavigation`/`ErrorDisplay`/`FoooterDisplay`/`ModelStatusDisplay` from the sidepanel/archive/content display trees; `ApiKeySetupPrompt` from `entrypoints/{sidepanel,content}/...`).

### 6. Unplanned fix: extension-less absolute import missed by the helper

`mv_component`'s alias rewrite does `sed s|@/$from|@/$to|g`, matching the **full** `from`/`to` strings including the `.ts` extension. `Field.svelte` imported `paths` without its extension:

```js
import { fieldPaths } from '@/components/ui/paths'
```

Since the literal string `@/components/ui/paths.ts` never appears in `Field.svelte`, the sed substitution for the `paths.ts` move never matched this line, leaving it pointing at the now-deleted `src/components/ui/paths.ts`. Caught by grepping the moved files for any surviving reference to `@/components/ui/` after the moves (per the phase brief's instruction to check for import breaks the helper couldn't catch). Fixed by hand:

```js
import { fieldPaths } from '@/entrypoints/settings/components/ui/paths'
```

No relative-import depth issues were found in any of the 20 moved files themselves (Phase 1 had already normalized all of them to `@/`-absolute, and this folder has no `package.json`-style repo-root exceptions like Phase 9's).

### 7. Cleanup

- Ran `find src/components -type d -empty -delete` after the moves. `src/components/ui/` still exists (6 files remain), so nothing was deleted at that path; no other empty directories were left.

### Method

Used the plan's `mv_component` shell helper exactly as specified, running the four groups (settings loop + `paths.ts` line, sidepanel loop, archive loop, content's two individual lines) in the order written in the plan. All 20 `mv_component` calls succeeded on the first pass.

## Verification Results

### 1. Structural check (plan's Phase 10 verify step)
```sh
ls src/components/ui | wc -l
ls src/components
find src/components -type f | wc -l
```
Output:
```
6
buttons
icons
inputs
markdown
ui
welcome
32
```
Matches the plan exactly: 6 files remain in `src/components/ui/`, the top-level `src/components` listing is exactly `buttons icons inputs markdown ui welcome`, and the shared tree totals 32 files.

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
1785231766932 WARNING "src/entrypoints/settings/components/tools/DeepDiveToolSettings.svelte" ...
1785231766932 WARNING "src/entrypoints/sidepanel/components/cat.svelte" 225:3 "Unused CSS selector \"#fur4\"..."
1785231766932 COMPLETED 1622 FILES 0 ERRORS 14 WARNINGS 8 FILES_WITH_PROBLEMS
```
0 errors; the 14 warnings are the same pre-existing set documented in the plan's baseline — `cat.svelte`'s warning now reports at its new `src/entrypoints/sidepanel/components/cat.svelte` path, the expected "14 warnings at a new path," not a regression.

### 4. Builds
```sh
npm run build
npm run build:firefox
```
First attempt (before the `Field.svelte` fix described above) was not run standalone — the extension-less `paths` import was caught by grepping for stale `@/components/ui/` references before building, so both builds below are the post-fix, passing run:
```
Σ Total size: 12.92 MB
✔ Finished in 18.8 s   (chrome-mv3)
Σ Total size: 12.93 MB
✔ Finished in 20.3 s   (firefox-mv2)
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `src/components/ui/` reduced to exactly 6 files: `ApiKeySetupPrompt.svelte`, `ErrorDisplay.svelte`, `FoooterDisplay.svelte`, `HoverTooltip.svelte`, `ModelStatusDisplay.svelte`, `TabNavigation.svelte`.
- [x] `src/components/` top level is exactly `buttons icons inputs markdown ui welcome`.
- [x] `find src/components -type f | wc -l` → 32.
- [x] All 20 moved files landed at their planned destination path (10 settings, 6 sidepanel, 2 archive, 2 content).
- [x] `paths.ts` and `shadowTooltipState.svelte.js` each moved on their own line, not folded into the `.svelte` loops, per the phase's explicit instruction.
- [x] Stale extension-less import in `Field.svelte` (`@/components/ui/paths` → `@/entrypoints/settings/components/ui/paths`) found and fixed.
- [x] No relative-import depth breaks found in any of the 20 moved files.
- [x] No empty directories left under `src/components/`.
- [x] `npm test` → 50 files / 494 tests passed (matches baseline).
- [x] `npm run check` → 0 errors, 14 pre-existing warnings (matches baseline).
- [x] `npm run build` → succeeds.
- [x] `npm run build:firefox` → succeeds.

### Still-Required Manual Verification (To Be Done by User)
- [ ] None specific to this phase. The final plan-wide manual smoke test (summarize from side panel, floating panel, settings, archive, popup) is deferred to Phase 11 per the plan's "Final verification checklist," once Rules 5/6 are in place.
