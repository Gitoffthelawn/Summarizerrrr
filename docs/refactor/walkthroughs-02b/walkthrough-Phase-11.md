# Walkthrough - Phase 11: Lock it in: Rules 5 + 6, docs, cleanup

Implemented Phase 11 of the [Full Component Reorg plan](../02b-full-reorg-plan.md) — the only phase that writes logic rather than moving files. Added Rules 5 and 6 to the architecture guard (`tests/architecture/layering.test.js`), updated `CLAUDE.md`'s component-placement rule and stale testing section, and confirmed the tree has no leftover empty directories or stale pre-reorg import paths.

## Changes Made

### 1. Guard test — Rule 5 (no cross-surface component imports)

#### [tests/architecture/layering.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/architecture/layering.test.js)
- Added `SURFACE_ALIAS = { popop: 'settings' }` next to the other allowlists, documenting why: `popop/App.svelte` has no `components/` of its own and mounts settings' `Setting.svelte` directly.
- Added `canonicalSurface(entrypointsRel)`, a helper that maps any `entrypoints/...`-relative path to its owning surface: every top-level `*.content.js` script collapses to `content` (two of them, `global.content.js` and `firefox.content.js`, literally `import { main } from './content/main.js'`), `background.js` maps to `background`, `popop` maps to `settings` via the alias, everything else keeps its own top-level folder name.
- Added the `Rule 5` test using the existing `findViolations(['entrypoints'], ...)` helper (reused verbatim, no parallel resolver): for every import under `entrypoints/` whose target resolves to `entrypoints/<B>/components/...`, it compares `canonicalSurface` of the importer against `canonicalSurface` of `<B>` and fails on mismatch.

### 2. Guard test — Rule 6 (2+-owner reachability for `src/components/`)

#### [tests/architecture/layering.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/architecture/layering.test.js)
- Added `resolveToRealFile(abs)` — extends the existing `resolveSpec` (reused, not replaced) with real filesystem resolution: tries the path as-is, then `.js`/`.ts`/`.svelte`/`.json`, then `index.js`/`index.ts`. Needed because Rules 1–4 only ever classified a resolved path by its top-level folder and never had to actually read the target file; Rule 6 has to keep walking the graph.
- Added `buildImportGraph()` — walks every `.js`/`.ts`/`.svelte` file under `src/` once (via the existing `walkDir`/`extractImports`/`resolveSpec`), building an in-memory adjacency map from each file to the real files its imports resolve to. Built once so the six-plus BFS traversals below don't each re-read the ~320-file source tree from disk.
- Added `reachableFrom(root, graph)` — plain iterative BFS/DFS over the prebuilt graph.
- Added `enumerateEntrypointRoots()` — enumerates roots from disk rather than a hardcoded list: `entrypoints/{sidepanel,archive,settings,popop,prompt,content}/main.js` (whichever exist), `entrypoints/background.js`, and every `entrypoints/*.content.js` found by `readdirSync`.
- Added the `Rule 6` test: builds the graph once, BFS's from every root, and for each file reached that lives under `src/components/`, records `canonicalSurface(relToSrc(root))` as an owner. Any `src/components/` file with fewer than 2 distinct owners (0 = unreachable/dead, 1 = single-owner) is reported by name with its actual owner list.

### 3. Documentation

#### [CLAUDE.md](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/CLAUDE.md)
- Replaced the "Where components go" paragraph with the measured rule: `src/components/*` is only for 2+ surfaces, currently exactly 6 folders / 32 files (`buttons` 9, `icons` 5, `inputs` 3, `markdown` 3, `ui` 6, `welcome` 6); everything else lives in `src/entrypoints/<surface>/components/`.
- Added the sentence recording that `settings` and `popop` count as one owner, and why (`popop/App.svelte` has no `components/` of its own and mounts settings' `Setting.svelte` directly).
- Added a sentence noting the guard now enforces Rules 1–6, describing what Rules 5 and 6 check, and stating that Rule 6 is why a new shared component needs a second real consumer before it can live in `src/components/`.
- Fixed the stale "Type checking" command comment in the Build & Development Commands block: `npm check` → `npm run check` (the former is a different built-in npm command; the repo's script is `check`, invoked as `npm run check`).
- Replaced the stale "Testing" section's "Currently no explicit test configuration in package.json" claim with the actual state: `npm test` runs `vitest run`, 50 test files including the architecture guard.

### 4. Cleanup (11.3)

- Ran `find src/components -type d -empty -delete` — no empty directories were present (Phases 2–10 already cleaned up after each move).
- Confirmed both stale-path greps return nothing:
  - `rg -n "@/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests` → no matches.
  - `rg -n "src/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests` → no matches.

## Sanity Checks (Rules 5 and 6 must actually fail when violated)

Per the phase brief, both rules were deliberately violated and reverted before finalizing, using `git mv` only (never `checkout`/`stash`/`reset`, to avoid touching Phases 1–10's uncommitted work).

### Rule 5 sanity check

Temporarily added `import __RULE5_SANITY_CHECK__ from '@/entrypoints/archive/components/TOCArchive.svelte'` to `src/entrypoints/sidepanel/App.svelte` (a sidepanel file importing an archive-owned component).

```sh
npx vitest run tests/architecture/layering.test.js
```
Output (relevant excerpt):
```
 ❯ tests/architecture/layering.test.js (7 tests | 1 failed) 186ms
     × Rule 5: no cross-surface component imports 62ms

AssertionError: Rule 5 — cross-surface component import:

entrypoints/sidepanel/App.svelte:7 (static) → @/entrypoints/archive/components/TOCArchive.svelte
    entrypoints/sidepanel/ imported a component owned by entrypoints/archive/components/. A component used by 2+ surfaces belongs in src/components/, not in another surface's components/ (see "Where components go" in CLAUDE.md).

 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```
Rule 5 caught the violation with a message naming both surfaces, as required. Reverted by removing the added import line; confirmed `npx vitest run tests/architecture/layering.test.js` was back to 7/7 passing and `git diff src/entrypoints/sidepanel/App.svelte` showed no residue beyond the pre-existing Phase 10 diff (`@/components/ui/Tooltip.svelte` → `@/entrypoints/sidepanel/components/Tooltip.svelte`, from an earlier phase, already present before this sanity check).

### Rule 6 sanity check

Temporarily `git mv src/entrypoints/sidepanel/components/Tooltip.svelte src/components/ui/Tooltip.svelte` (a sidepanel-only component moved into the shared tree), and updated its 4 importers' specifiers to match (`ActionButtons.svelte`, `ActionButtonsMini.svelte`, `SettingButton.svelte`, `sidepanel/App.svelte`) so the failure reflects "single-owner" rather than "broken import."

```sh
npx vitest run tests/architecture/layering.test.js
```
Output (relevant excerpt):
```
 ❯ tests/architecture/layering.test.js (7 tests | 1 failed) 180ms
     × Rule 6: every file in src/components/ is reachable from 2+ entrypoint surfaces 69ms

AssertionError: Rule 6 — single-owner (or unreachable) file in src/components/:

components/ui/Tooltip.svelte — reachable from 1 surface(s) (sidepanel). src/components/ is only for 2+ surfaces (CLAUDE.md); move it into its owner's src/entrypoints/<surface>/components/, or delete it if nothing reaches it.

 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```
Rule 6 caught the violation, correctly identifying the single owner as `sidepanel`. Reverted with `git mv src/components/ui/Tooltip.svelte src/entrypoints/sidepanel/components/Tooltip.svelte` and restored the 4 importers' specifiers; confirmed `find src/components -type f` was back to its pre-check state and `npm test` returned to 496 passed.

## Verification Results

### 1. Rule sanity — both rules bite

- [x] Rule 5 fails when a cross-surface component import is introduced (see above); passes on the clean tree.
- [x] Rule 6 fails when a single-owner component is moved into `src/components/` (see above); passes on the clean tree.

### 2. Automated Tests

```sh
npm test
```
Output:
```
 Test Files  50 passed (50)
      Tests  496 passed (496)
```
496 = the plan's baseline 494 + the 2 new Rule 5/Rule 6 tests, 0 failures.

### 3. Type Checks & Compilation

```sh
npm run check
```
Output (tail):
```
1785232615103 COMPLETED 1622 FILES 0 ERRORS 14 WARNINGS 8 FILES_WITH_PROBLEMS
```
0 errors; the same 14 pre-existing warnings documented in the plan's baseline (a11y label + unused CSS selector in `AppearanceSettings`, `ChatSettings`, `DataSyncSettings`, `DeepDiveToolSettings`, `SummarySettings`, `cat.svelte`, plus `ToolEnableToggle`'s non-reactive-update warning and `AIProviderSettings`' label warning).

### 4. Builds

```sh
npm run build
npm run build:firefox
```
Output:
```
Σ Total size: 12.92 MB
✔ Finished in 17.2 s   (chrome-mv3)
Σ Total size: 12.93 MB
✔ Finished in 16.4 s   (firefox-mv2)
```

### 5. Final verification checklist (from the plan) — runnable items

```sh
find src/components -type f | wc -l   # → 32 (33 raw count includes a git-ignored .DS_Store, not a source file)
ls src/components                     # → buttons icons inputs markdown ui welcome
find src/entrypoints/sidepanel/components -type f | wc -l   # → 48
find src/entrypoints/settings/components -type f | wc -l    # → 41
find src/entrypoints/archive/components -type f | wc -l     # → 15
find src/entrypoints/content/components -type f | wc -l     # → 21 (7 pre-existing + 14 new: 7 flat + 7 in displays/)
find src/entrypoints/prompt/components -type f | wc -l      # → 3
rg -n "@/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests   # → nothing
rg -n "src/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests # → nothing
rg -o "(from |import\()['\"]\.[^'\"]*['\"]" -g '*.svelte' -g '*.js' -g '*.ts' src/components | wc -l                # → 0
```
All match the plan's expected counts exactly. The two `package.json` exceptions from Phase 1/9 (`AboutSettings.svelte`, `ReleaseNote.svelte`) now live under `src/entrypoints/settings/components/`, not `src/components/`, so the "0 relative imports in `src/components/`" check is a clean 0 (not 2) — the exceptions moved out of scope for that specific grep in Phase 9, as the plan's own Phase 9 text anticipated.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Rule 5 (no cross-surface component imports) added to `tests/architecture/layering.test.js`, reusing `findViolations`/`extractImports`/`resolveSpec`/`relToSrc`/`walkDir` — no parallel resolver written.
- [x] Rule 6 (2+-owner reachability for `src/components/`) added, reusing the same helpers plus a small BFS built on top of `resolveSpec`.
- [x] `settings`+`popop` treated as one owner via `SURFACE_ALIAS`, used consistently by both Rule 5 and Rule 6 through the shared `canonicalSurface` helper.
- [x] Rule 5 confirmed to fail on a deliberately introduced cross-surface import, then reverted cleanly.
- [x] Rule 6 confirmed to fail on a deliberately `git mv`'d single-owner component, then reverted cleanly (file moved back, 4 importer specifiers restored).
- [x] `CLAUDE.md` "Where components go" paragraph replaced with the measured 6-folder/32-file rule.
- [x] `CLAUDE.md` records the settings+popop one-owner carve-out.
- [x] `CLAUDE.md` notes Rules 1–6 and that Rule 6 requires a second consumer before a component can live in `src/components/`.
- [x] `CLAUDE.md` "Testing" section and the `npm check` typo fixed.
- [x] `find src/components -type d -empty -delete` run; no empty directories found.
- [x] Both stale-pre-reorg-path greps return nothing.
- [x] `npm test` → 50 files / 496 tests passed (494 baseline + 2 new rule tests), 0 failures.
- [x] `npm run check` → 0 errors, 14 pre-existing warnings (matches baseline).
- [x] `npm run build` → succeeds.
- [x] `npm run build:firefox` → succeeds.
- [x] All "Final verification checklist" file-count and grep items from the plan re-checked and match.

### Still-Required Manual Verification (To Be Done by User)
- [ ] The plan's final checklist item is a manual five-surface smoke test from an unpacked build, which this agent cannot perform (no browser). Steps:
  1. `npm run build` (already run above; output in `.output/chrome-mv3`).
  2. Load `.output/chrome-mv3` as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
  3. Open the **side panel** on a YouTube video or web page and summarize — confirm it renders and streams/produces a result.
  4. Trigger the **floating panel** on the same page (FAB or shortcut) and summarize — confirm it renders independently of the side panel.
  5. Open **settings** and change a provider/model selection — confirm the settings UI renders and the change persists.
  6. Open the **archive** and view a saved entry — confirm history/tag UI renders.
  7. Open the **popup** (extension icon click) — confirm it renders (it reuses `settings/components/Setting.svelte` per the popop/settings one-owner note).
  A bad import path in any of the five surfaces would show as a blank panel, which no build or type-check catches — this is the reason the plan calls this out as the final gate.
