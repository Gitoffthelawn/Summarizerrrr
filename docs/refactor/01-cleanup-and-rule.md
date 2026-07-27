# Structure Cleanup + Layering Rule — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> verify step — don't move on until it passes.

Survey date: 2026-07-27, branch `v3.0-NewSettingUI-2` (commit `ad75f1c`). Line numbers are from that commit.

---

## Context

The `src/` tree is organized by **"what kind of thing this is"** (`buttons/`, `inputs/`, `ui/`, `displays/`), but the real boundary in this extension is **"which surface owns it"** (sidepanel / archive / settings / content / prompt).

Measured consequences:

- **13 of 26** component folders are consumed by exactly **one** entrypoint, yet live in the "shared" tree. Nothing signals which files are safe to change.
- `src/components/ui/` and `src/components/displays/ui/` have become dumping grounds. Only ~5 of 24 files in `ui/` are genuine shared primitives. The rest is decorative art (`cat.svelte`, `Logo.svelte`, `version.svelte`), sidepanel-only chrome (`SidepanelTabBar`, `TabTitleBar`, `Noti`), and files that aren't components at all (`paths.ts`, `shadowTooltipState.svelte.js`).
- **`lib/` vs `services/` has no rule.** Placement tracks *when* a feature was written, not what the code does. `lib/api/aiSdkAdapter.js` and `services/chat/chatService.js` do the same category of work but live in different trees.
- **There is a real circular import:** `lib/api/aiSdkAdapter.js:29` → `stores/summaryStore` → `lib/api/api.js:10` → `aiSdkAdapter`. Two files already use `await import()` to dodge it, and their comments say so explicitly — the layering is known to be broken and is being worked around per-file instead of fixed.
- 17 component files are dead (zero references), including the entire `displays/mobile/` folder.

The tree also has two same-name collisions where the two files are **different implementations**, imported side by side in the same folder.

### Goal & scope decision (confirmed with user)

- **This round does NOT mass-move files and does NOT split god files.** The goal is: delete what's dead, kill the ambiguity that causes real bugs, correct the dependency direction, then **write the rule down and add a test that blocks regression**.
- Keep `lib/` and `services/` as **two separate trees**, with an enforced dependency direction — do not merge them into one tree.
- The surface-first component reorg is a **separate, later plan** (see `02-full-reorg-direction.md`). It is deliberately sequenced *after* this one: without the guard test from Phase 5, moving ~150 files would just rot again within months.
- Splitting the four god files is also a **separate, later plan** (see `03-god-files.md`).
- **No new dependencies.** The guard test uses the existing `vitest` setup.
- Explicitly out of scope this round: merging the near-duplicate pairs (`Noti`/`NotiFP` at 95%, `DeepDivePanelFP`/`Mobile` at 72%, the 4-file 1509-line TOC family).

---

## Phase 1 — Delete dead code

All 17 files below were verified as **zero references** by grepping the identifier across all of `src/` — not just by walking the import graph.

```
src/components/chat/ChatUserHtml.svelte
src/components/chat/ChatContextDonut.svelte          # superseded by ChatContextGauge in commit ad75f1c
src/components/chat/ChatSourceChip.svelte
src/components/displays/archive/ArchiveSummaryHeader.svelte
src/components/displays/archive/ArchiveSummaryContent.svelte
src/components/displays/archive/ArchiveSummaryFooter.svelte
src/components/displays/core/BaseTabbedSummaryDisplay.svelte    # mutually-referencing orphan pair
src/components/displays/core/TabbedSummaryDisplay.svelte
src/components/displays/mobile/                                  # ENTIRE FOLDER (2 files), all dead
src/components/displays/ui/DisplaySettingsInline.svelte
src/components/inputs/MultiSelectCombobox.svelte
src/components/settings/Settingpopup.svelte
src/components/ui/Connected.svelte
src/components/ui/GroupVisual.svelte
src/components/ui/ToolIcon64.svelte
src/entrypoints/content/components/Drawer.svelte    # "Drawer" inside MobileSheet is only a local fn name
```

> `BaseTabbedSummaryDisplay` / `TabbedSummaryDisplay` and `MobileSummaryDisplay` / `MobileGenericSummaryDisplay` each reference *each other* but nothing else references either pair. A naive grep shows "1 reference" — they must be deleted as pairs.

Also clean up:
- Empty directory `src/components/providerConfigs/tools/`
- Any `.DS_Store` files under `src/` — `.gitignore:132` already covers the pattern, so just `git rm --cached` any that were previously tracked.

**Verify:**
```bash
npm test && npm run check && npm run build && npm run build:firefox
```
All four must pass. `git diff --stat` should show only deletions.

---

## Phase 2 — Kill the two filename collisions

These are real footguns, not cosmetics.

### 2.1 `ShadowTooltip.svelte` × 2 — two DIFFERENT implementations sharing a name

| File | Mechanism | Consumers |
|---|---|---|
| `src/lib/components/ShadowTooltip.svelte` (21 lines) | CSS `group-hover` only; no delay, no `side` prop | 6 files in `components/buttons/` |
| `src/components/ui/ShadowTooltip.svelte` (66 lines) | JS-driven; has `side`/`delay`; uses `getContext('shadow-tooltip-state')` | 3 files |

Both are imported **side by side from the same folder**: `src/components/buttons/CopyButton.svelte:5` takes the lib one, `src/components/buttons/ActionButtonsFP.svelte:4` takes the ui one.

The 6 consumers of the lib version:
`CopyButton.svelte:5`, `DownloadButton.svelte:7`, `CopyMarkdownButton.svelte:5`, `SaveToArchiveButton.svelte:10`, `SaveToArchiveFromHistoryButton.svelte:6` (all via `../../lib/components/...`), and `SaveToArchiveButtonFP.svelte:6` (via `@/lib/components/...`).

**Action — rename, do NOT merge.** The `ui/` version requires a context provider; the `lib/` version does not. Merging blindly would change behavior. Instead:
1. Rename the CSS-only version to `HoverTooltip.svelte` and move it to `src/components/ui/`.
2. Update the 6 imports above.
3. Delete the now-empty `src/lib/components/` directory (it existed solely for this one file).

Zero behavioral risk, collision gone. Genuine unification is deferred — noted in `02-full-reorg-direction.md`.

> Note there is also a third, unrelated `src/components/ui/Tooltip.svelte` (bits-ui based). Leave it alone; after this phase the three tooltips at least have three distinct names.

### 2.2 `SummaryWrapper.svelte` × 2

`displays/core/SummaryWrapper.svelte` (46 lines) vs `displays/floating-panel/SummaryWrapper.svelte` (44 lines). The entire diff is one wrapper `<div class="flex flex-col gap-3">` present in core and absent in FP.

Rename the floating-panel one to `SummaryWrapperFP.svelte`, matching the convention that folder already uses (`SummaryContentFP`, `GenericSummaryDisplayFP`, `YouTubeSummaryDisplayFP`). Rename only — no code changes.

**Verify:**
```bash
npm test && npm run check && npm run build && npm run build:firefox
```
Then load `.output/chrome` unpacked: open the sidepanel and the floating panel, and hover the copy/download buttons in **both** — tooltips must still appear.

---

## Phase 3 — Correct the dependency direction

### 3.1 Break the real cycle (`aiSdkAdapter` → `summaryStore`)

`src/lib/api/aiSdkAdapter.js:29` imports `updateModelStatus`, used at lines **345** and **632**. This is the link that closes the cycle.

Add `src/lib/api/modelStatusReporter.js` (~15 lines): holds a default no-op reporter plus `setModelStatusReporter()`. `aiSdkAdapter` calls the reporter instead of the store. `summaryStore` registers itself on init. Cycle broken, and `lib/` no longer knows `stores/` exists.

### 3.2 Settings port for `lib/` (2 files)

`lib/` must be pure, but two files read the store directly:
- `src/lib/api/api.js:2` — imports `settings` and `loadSettings`; `await loadSettings()` is called at lines 93, 183, 321, 366, 408, 485.
- `src/lib/prompts/builders/index.js:1` — imports `settings`, then reads `settings.*` at roughly 20 sites.

Add `src/lib/config/settingsPort.js` exposing `getSettings()` and `ensureSettingsLoaded()`, backed by a registered provider. `settingsStore` registers the adapter at module load. Convert the two files above to use the port.

> Build the port **for `lib/` only** (2–3 files). Do not push it across the whole app — per the Phase 5 rule, `services/` is still allowed to read `settingsStore` directly.

The default provider should fall back to a dynamic `import()` so nothing breaks if registration order is wrong — the same pattern already used at `src/lib/chat/skills/skillService.js:95`.

### 3.3 Move `lib/exportImport/` → `services/exportImport/`

`src/lib/exportImport/exportService.js:24` imports from `services/cloudSync`. But that file (691 lines) reads IndexedDB directly and triggers downloads — it is a **side-effecting orchestrator**, i.e. a service, not lib.

Move all 5 files in the folder to `src/services/exportImport/` and rewrite imports. **Change zero lines of logic** — this is purely putting it where it belongs, which also makes the import legal (services → services).

`tests/settings/exportImport.test.js` will catch breakage.

### 3.4 Return `messageHandler` + `initialization` to the sidepanel

Both have exactly **one** consumer each: `src/entrypoints/sidepanel/App.svelte:32` and `:38`. They are sidepanel wiring mislabeled as services.

Move both to `src/entrypoints/sidepanel/`. This removes 2 services→stores violations with no abstraction at all.

**Verify:**
```bash
npm test && npm run check && npm run build && npm run build:firefox
```
Then load `.output/chrome` unpacked and check the three paths this phase touched:
1. Summarize a YouTube video in **both** streaming and non-streaming mode — model status must still appear in the footer (that's the 3.1 reporter path).
2. Settings → export a ZIP, then re-import it (3.3 path).
3. Send a chat message in the sidepanel (3.4 path — confirms `messageHandler` still wires up after the move).

---

## Phase 4 — Collapse the micro-folders in `lib/`

Fewer folders means fewer "where does this file go?" decisions.

- **`lib/constants/` → `lib/config/`.** There is no real difference between them: `config/settingsSchema.js` exports *functions* (`sanitizeSettings`, `migrateLegacyGeminiAdvanced`), and `constants/initialStates.js` exports *factory functions*. Five files total — merge into one folder.
- **`lib/ui/` (3 files) → `lib/utils/`.** No real boundary exists: `lib/ui/` holds a Svelte transition, a scroll lock, and a text animation, while `lib/utils/` already holds `domUtils`, `toastUtils`, `videoSeeker`, and `rtlUtils` — equally DOM-bound. While moving, drop `slideScaleFade.js`'s import of `services/animationService` and read reduce-motion through the settings port instead (`isReduceMotionEnabled` is just `settings.reduceMotion ?? false`, defined at `src/services/animationService.js:9`).
- **`lib/components/`** — already gone in Phase 2.

Leave `lib/content/semanticPageExtractor.js` where it is (single file, but it has its own test at `tests/summary/semanticPageExtractor.test.js` and moving it gains nothing).

**Verify:**
```bash
npm test && npm run check && npm run build && npm run build:firefox
```
Then enable Reduce Motion in settings and confirm panel animations actually stop — that exercises the rewired `slideScaleFade`.

---

## Phase 5 — Write the rule down + add the regression guard

**This is the part that actually fixes the root cause.** Phases 1–4 are a one-time cleanup; this phase is what keeps it clean.

### 5.1 The rule → add to `CLAUDE.md`

**Layering (dependency direction):**

| Layer | May import |
|---|---|
| `src/lib/**` | `src/lib/**` only |
| `src/services/**` | `lib`, `services`, **and `stores/settingsStore` only** |
| `src/stores/**` | `lib`, `services`, `stores` |
| `src/components/**`, `src/entrypoints/**` | anything |
| everything | **never** import from `src/entrypoints/**` |

> The `settingsStore` carve-out is deliberate and named. Four services read it — `animationService`, `deepDiveService`, `toolProviderService`, and `cloudSyncService` (which also *writes* settings back via `updateSettings` / `updateSettingsFromCloud`). Building a port for all four just to avoid one import line would be over-engineering. One named, greppable exception with a test watching it beats a leaky abstraction.

**Where components go:** `src/components/*` is **only** for things used by **2 or more entrypoints**. Anything used by a single surface belongs next to that entrypoint (`src/entrypoints/<surface>/components/`, following the existing `entrypoints/content/components/` precedent). This round does not move the existing tree — but **new files must follow this rule**, otherwise Phases 1–4 only buy a few months.

### 5.2 `tests/architecture/layering.test.js`

No new tooling needed — `vitest` is already configured with the `@` alias in `vitest.config.js`. The test walks `src/`, parses imports, and asserts:

1. No file under `src/lib/**` imports `@/stores` or `@/services` *(locks in Phase 3)*
2. No file under `src/services/**` imports `@/stores`, except `stores/settingsStore` *(locks in 3.4)*
3. No file under `lib|services|stores` imports `@/entrypoints` *(already true today — lock it in)*
4. No two `.svelte` files share a basename across `src/components/**` and `src/lib/**` *(locks in Phase 2; prevents the ShadowTooltip situation recurring)*

Each failure must print **which file violated which rule**. If it doesn't, the next person will just delete the test.

**Verify:**
```bash
npm test
```
The new test must pass. Then deliberately break it to confirm it actually works: temporarily add `import { settings } from '@/stores/settingsStore.svelte.js'` to any file in `src/lib/`, re-run, confirm it fails with a useful message, then revert.

Finish with the full suite:
```bash
npm test && npm run check && npm run build && npm run build:firefox
```

---

## Out of scope (V1)

- **Surface-first component reorg** (~150 file moves) — see `02-full-reorg-direction.md`. Requires Phase 5's guard test to exist first.
- **Splitting the four god files** — `background.js` (2080), `summaryStore.svelte.js` (1602), `indexedDBService.js` (1317), `settingsStore.svelte.js` (1274). See `03-god-files.md`.
- **Merging near-duplicate components** — `Noti`/`NotiFP` (95%), `DeepDivePanelFP`/`DeepDivePanelMobile` (72%), the TOC family (4 files, 1509 lines, no shared base), and ~9 other pairs. Cataloged in `02-full-reorg-direction.md` §6.
- **The two parallel summarize stacks** (`summaryStore` vs `content/composables/useSummarization.svelte.js`) and **the two generic web extractors** of differing quality. Both noted in `02-full-reorg-direction.md` §7 — the extractor one may be a user-visible bug and is worth investigating on its own.

---

## Final verification checklist

- [ ] `npm test` passes (including the new `tests/architecture/layering.test.js`)
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:firefox` passes
- [ ] Guard test proven to actually fail when the rule is broken (then reverted)
- [ ] Sidepanel: summarize a YouTube video, streaming **and** non-streaming; model status shows in the footer
- [ ] Floating panel: enable the FAB on a regular web page, summarize, hover copy/download — tooltips appear
- [ ] Settings: export a ZIP and re-import it
- [ ] Archive: TOC and tag filter still render
- [ ] Chat: send a message in the sidepanel
- [ ] Reduce Motion toggle actually stops animations
- [ ] `CLAUDE.md` contains the layering table and the component-placement rule

---

## Notable files

**Created:**
- `src/lib/api/modelStatusReporter.js` — breaks the aiSdkAdapter↔summaryStore cycle
- `src/lib/config/settingsPort.js` — lets `lib/` read settings without importing the store
- `tests/architecture/layering.test.js` — the regression guard; the most important file in this plan

**Moved:**
- `src/lib/exportImport/` → `src/services/exportImport/` (5 files, no logic changes)
- `src/services/{messageHandler,initialization}.js` → `src/entrypoints/sidepanel/`
- `src/lib/ui/` (3 files) → `src/lib/utils/`; `src/lib/constants/` (3 files) → `src/lib/config/`
- `src/lib/components/ShadowTooltip.svelte` → `src/components/ui/HoverTooltip.svelte` (renamed)

**Modified:**
- `src/lib/api/aiSdkAdapter.js` — lines 29, 345, 632
- `src/lib/api/api.js` — line 2 plus 6 `loadSettings()` call sites
- `src/lib/prompts/builders/index.js` — line 1 plus ~20 `settings.*` reads
- `src/entrypoints/sidepanel/App.svelte` — lines 32, 38 (import paths)
- 6 files in `src/components/buttons/` — ShadowTooltip import paths
- `CLAUDE.md` — the rule

**Deleted:** 17 dead component files (listed in Phase 1) plus the empty `src/components/providerConfigs/tools/`.

---

## Execution notes

- **One commit per phase.** Phases 1, 2, and 4 are mechanical and revert cleanly. **Phase 3 is where the real behavioral risk lives** — do not batch it with anything else.
- The repo was on branch `v3.0-NewSettingUI-2` with a clean working tree (only `docs/research/` untracked) at survey time. **Create a dedicated branch** for this cleanup so it doesn't mix into in-progress feature work.
- 538 imports already use the `@/` alias, so most moves are string rewrites. But **41 imports use `../../` and 5 use `../../../`** — grep those out *before* each move; they need manual fixing.

## See also

- [`02-full-reorg-direction.md`](./02-full-reorg-direction.md) — surface-first component reorg (run after this plan)
- [`03-god-files.md`](./03-god-files.md) — seams for splitting the four oversized files
