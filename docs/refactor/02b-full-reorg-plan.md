# Full Component Reorg — executable plan

> **How to use this doc:** Self-contained execution plan, intended to be run in a
> fresh session. Start at Phase 1 and go in order. Each phase ends with a verify
> step — don't move on until it passes. One phase = one commit.

**Precondition:** [`01-cleanup-and-rule.md`](./01-cleanup-and-rule.md) is complete
(commits `134f978`…`73d61c7`). The layering guard exists at
[layering.test.js](tests/architecture/layering.test.js) with Rules 1–4.

This plan supersedes the file-level claims in
[`02-full-reorg-direction.md`](./02-full-reorg-direction.md). That doc supplies
the *principle* (§2) and the *method* (§5); its §4 file assignments were derived
by eyeballing folders and are **wrong in ~10 places**. §"Corrections to 02 §4"
below lists them. **When the two disagree, this document wins.**

---

## Context

`src/components/` is organized by *what kind of thing this is* (`buttons/`,
`inputs/`, `ui/`, `displays/`) but the real ownership boundary in this extension
is *which surface uses it*. When the type-taxonomy has no slot for something,
people drop it in `ui/` — which is how `ui/` reached 22 files, and
`displays/` ended up split on three incompatible axes at once (layer: `core`/`ui`;
surface: `archive`/`floating-panel`; content-type: `platform`).

### Measured starting state

An import-graph BFS from every entrypoint root (`src/entrypoints/*/main.js`, every
top-level `*.content.js`, and `background.js`), following **static and dynamic**
imports and resolving `@/` → `src/`:

| Metric | Value |
|---|---|
| Files under `src/components/` | **153** |
| Used by exactly 1 surface | **121** (79%) |
| Used by 2+ surfaces | **32** (21%) |
| Unreachable / orphaned | **0** |
| Relative imports *inside* `src/components/` | **135** (64 `./`, 33 `../`, 33 `../../`, 5 `../../../`) |
| Relative imports from outside `components/` *into* it | **0** |
| `@/components/…` specifiers in `src/` + `tests/` | **150**, across 50 files |
| Test files referencing components | **10** (8 via relative `../../src/components/…`) |

`settings` and `popop` count as **one owner**: `popop/App.svelte:4` and
`settings/App.svelte` both mount the same `@/components/settings/Setting.svelte`.

### Baseline (verified before writing this plan — all green)

```
npm test           → 50 files, 494 tests passed
npm run check      → 1622 files, 0 ERRORS, 14 warnings, 8 files with problems
npm run build      → ✔ Finished in 19.2 s
npm run build:firefox → ✔ Finished in 18.5 s
```

**The 14 warnings are pre-existing** (a11y label + unused CSS selector, in
`AppearanceSettings`, `ChatSettings`, `DataSyncSettings`, `DeepDiveToolSettings`,
`SummarySettings`, `cat.svelte`). `npm run check` exits non-zero on **errors**
only. The bar for every phase is **0 errors** — do not chase the warnings, and do
not treat their count changing to 14-at-a-new-path as a regression.

### Goal & scope decision (confirmed with user)

- **Moves only.** Do **not** merge, dedupe, or refactor any of the duplicate
  pairs in 02 §6 (`Noti`↔`NotiFP` 95%, the TOC family, `ApiKeyInput`↔`Multi`, the
  `*Display` matrix, …). Mixing "move a file" with "change behavior" makes a
  regression impossible to bisect. The reorg *exposes* those pairs; a later plan
  fixes them.
- **No renames.** A file keeps its basename, including the misspelled
  `FoooterDisplay.svelte`. Renaming is a separate decision.
- **`src/components/` = 2+ surfaces, enforced by test.** Phase 11 adds Rule 5
  (from 02 §5.3) *and* Rule 6 (new): every file under `src/components/` must be
  reachable from 2+ entrypoint roots. Rule 6 is the one that makes this
  permanent — without it nothing stops the next single-owner component from
  landing in `components/ui/` again.
- **No new dependencies. No changes to `lib/`, `services/`, `stores/`, manifest,
  or `wxt.config.ts`.** Top-level `*.content.js` paths are manifest-load-bearing
  and stay exactly where they are.
- **Non-blocking note, not a phase:** 02 §7 flags two divergent generic web
  extractors — [semanticPageExtractor.js](src/lib/content/semanticPageExtractor.js)
  uses Defuddle, while `ContentExtractorService.extractGenericContent()` in
  [content/extractors](src/entrypoints/content/extractors) does
  `document.body.innerText`. Extraction quality therefore depends on which
  surface you summarize from — likely a real user-visible bug. It is **out of
  scope here** (this plan touches no logic) and deserves its own investigation.

### Target shared tree (32 files, 6 folders)

```
src/components/
  buttons/    (9)  ButtonFont ButtonIcon ButtonSet CopyButton CopyMarkdownButton
                   DownloadButton SaveToArchiveButton SummarizeButton QuestionChip
  icons/      (5)  unchanged
  inputs/     (3)  LanguageSelect ReusableSelect ShadowDOMLanguageSelect
  markdown/   (3)  StreamingMarkdownV2 TableRenderer TimestampLink      ← NEW folder
  ui/         (6)  ApiKeySetupPrompt HoverTooltip TabNavigation
                   ErrorDisplay FoooterDisplay ModelStatusDisplay
  welcome/    (6)  unchanged (incl. shared/ and steps/)
```

Nine folders disappear from `src/components/`: `chat/`, `displays/`, `feedback/`,
`modals/`, `navigation/`, `providerConfigs/`, `settings/`, `skills/`, `tools/`.

### Target per-surface trees (121 files)

```
src/entrypoints/
  sidepanel/components/  (48)  11 flat + chat/ (26) + deepdive/ (6) + displays/ (5)
  archive/components/    (15)   9 flat + displays/ (6)
  settings/components/   (41)  13 flat + inputs/ (11) + ui/ (10) + cloudsync/ (3)
                                        + buttons/ (2) + tools/ (2)
  content/components/    (14)   7 flat (joining 7 that already live there)
                                        + displays/ (7)
  prompt/components/      (3)   flat
  popop/                        no components dir — keeps importing from
                                @/entrypoints/settings/components/Setting.svelte
```

Subfolder convention: flat by default; a subfolder once a cohesive group exceeds
~6 files. `content/components/` is already flat with 7 files, so incoming
singletons join it flat.

### Corrections to 02 §4 (why this doc overrides it)

| 02 §4 said | Import graph says |
|---|---|
| shared `ui/` ← Tooltip, ShadowTooltip, HoverTooltip, ConfirmDialog, ActionDropdownMenu, ApiKeySetupPrompt, PermissionWarningPrompt | **5 of 7 are single-owner.** Only `HoverTooltip` (3) and `ApiKeySetupPrompt` (2) are shared. `Tooltip`→sidepanel, `ShadowTooltip`→content, `ConfirmDialog`→settings, `ActionDropdownMenu`→archive, `PermissionWarningPrompt`→sidepanel |
| shared `inputs/` ← …, Switch, TextInput | `Switch` and `TextInput` are **settings-only** |
| shared `buttons/` ← 6 files | 6 confirmed, **plus 2 it missed**: `SaveToArchiveButton` (archive+sidepanel), `SummarizeButton` (content+sidepanel) |
| — (unassigned) | 5 genuinely-shared files 02 never placed: `ErrorDisplay`, `FoooterDisplay`, `ModelStatusDisplay`, `TabNavigation`, `QuestionChip` |
| "the 9 settings-only files from `inputs/`" | **10** |
| settings-only from `ui/`: 8 files | **10** — it missed `ConfirmDialog` and `ToolIcon96` |
| `navigation/` — "each TOC belongs to exactly one entrypoint" | True for the 4 TOCs, but `TabNavigation` is archive+sidepanel → shared |
| `chat/` 29 files, `ui/` 24 files | **26** and **22** (plan 01 deleted the rest) |

---

## The move helper

Every phase from 2 onward is mechanical. Define this once per shell session:

```bash
mv_component() {  # $1 = path under src/ (from), $2 = path under src/ (to)
  local from="$1" to="$2" files
  mkdir -p "src/$(dirname "$to")"
  git mv "src/$from" "src/$to" || return 1
  # alias form used throughout src/ and two tests
  files=$(rg -l --fixed-strings "@/$from" -g '*.svelte' -g '*.js' -g '*.ts' src tests || true)
  [ -n "$files" ] && echo "$files" | xargs sed -i '' "s|@/$from|@/$to|g"
  # repo-root form used by the 8 relative chat tests (../../src/components/…)
  files=$(rg -l --fixed-strings "src/$from" -g '*.js' -g '*.ts' tests || true)
  [ -n "$files" ] && echo "$files" | xargs sed -i '' "s|src/$from|src/$to|g"
  return 0
}
```

Notes:
- `sed -i ''` is the BSD/macOS form — this repo is developed on darwin.
- The relative test imports (`../../src/components/chat/X.svelte`) are safe to
  rewrite as a plain substring: the `../../` prefix depends only on the *test
  file's* location, which never changes, and everything after it is a full
  path from the repo root.
- Rewriting is only this simple because **Phase 1 removed every relative import
  inside `components/`**. Do not skip Phase 1.

After the last `mv_component` of a phase, remove any directory left empty:

```bash
find src/components -type d -empty -delete
```

---

## Phase 1 — Normalize every relative import inside `src/components/` to `@/`

No files move. This is pure de-risking: 71 of the 135 relative imports inside
`components/` point outside their own folder and would break the moment their
file moves, and 02 §5.2's "grep them out and fix manually" is the step most
likely to be got wrong. Convert them all to absolute `@/` first and every later
phase becomes a string substitution.

**Do:** in every file under `src/components/`, rewrite each relative specifier to
its `@/`-prefixed equivalent. `@/` maps to `src/` (see `.wxt/tsconfig.json`
`paths`). Examples, all real:

| File | Before | After |
|---|---|---|
| `components/chat/ChatShell.svelte` | `./ChatMessageList.svelte` | `@/components/chat/ChatMessageList.svelte` |
| `components/displays/core/SummaryContent.svelte` | `../ui/StreamingMarkdownV2.svelte` | `@/components/displays/ui/StreamingMarkdownV2.svelte` |
| `components/settings/SummarySettings.svelte` | `../inputs/Switch.svelte` | `@/components/inputs/Switch.svelte` |
| `components/buttons/CopyButton.svelte` | `../../lib/utils/slideScaleFade.js` | `@/lib/utils/slideScaleFade.js` |
| `components/displays/platform/YouTubeSummaryDisplay.svelte` | `../../../stores/summaryStore.svelte.js` | `@/stores/summaryStore.svelte.js` |
| `components/ui/Field.svelte` | `./paths` | `@/components/ui/paths` |

Include `./`-siblings (64 of them). Yes, siblings that move together would
survive — but normalizing all of them means no later phase has to reason about
which case it is.

**Two deliberate exceptions — leave these relative:**

- `components/settings/AboutSettings.svelte` → `../../../package.json`
- `components/settings/ReleaseNote.svelte` → `../../../package.json`

They resolve to the **repo-root** `package.json`, outside `src/`, so `@/` cannot
express them. The `@@/` alias exists in `.wxt/tsconfig.json` but is unverified at
build time here — don't gamble on it. Phase 9 adjusts their depth by hand when
those two files move.

**Do not** touch relative imports anywhere outside `src/components/` (there are
none pointing into `components/` — verified — and the rest are not this plan's
business).

**Verify:**
```bash
# expect exactly 2 hits, both ../../../package.json
rg -o "(from |import\()['\"]\.[^'\"]*['\"]" -g '*.svelte' -g '*.js' -g '*.ts' src/components | wc -l
rg -n "\.\./\.\./\.\./package\.json" src/components   # the 2 known exceptions
npm test && npm run check && npm run build && npm run build:firefox
```
`npm test` → 494 passed. `npm run check` → **0 errors**. Both builds finish.
`git diff --stat` should show only files under `src/components/`, imports only.

---

## Phase 2 — `feedback/` → 3 surfaces (folder disappears)

The easiest possible case, chosen to validate the process: 3 files, zero overlap,
one toast per surface.

```bash
mv_component components/feedback/ModelToast.svelte  entrypoints/sidepanel/components/ModelToast.svelte
mv_component components/feedback/CustomToast.svelte entrypoints/prompt/components/CustomToast.svelte
mv_component components/feedback/ShadowToast.svelte entrypoints/content/components/ShadowToast.svelte
find src/components -type d -empty -delete
```

**Verify:** `src/components/feedback/` no longer exists; `rg -c '@/components/feedback'
src tests` finds nothing; then the four commands. Commit.

---

## Phase 3 — `navigation/` → 3 surfaces + 1 shared (folder disappears)

```bash
mv_component components/navigation/TOC.svelte           entrypoints/sidepanel/components/TOC.svelte
mv_component components/navigation/TOCArchive.svelte    entrypoints/archive/components/TOCArchive.svelte
mv_component components/navigation/TOCSidebar.svelte    entrypoints/archive/components/TOCSidebar.svelte
mv_component components/navigation/TabArchive.svelte    entrypoints/archive/components/TabArchive.svelte
mv_component components/navigation/TOCMobile.svelte     entrypoints/content/components/TOCMobile.svelte
mv_component components/navigation/TabNavigation.svelte components/ui/TabNavigation.svelte
find src/components -type d -empty -delete
```

`TOCSidebar` is **archive's**, not the sidepanel's — the name misleads, but do not
rename it (out of scope). `TabNavigation` is genuinely shared (archive+sidepanel),
which is why `navigation/` collapses to a single file and is better absorbed into
`components/ui/` than kept as a one-file folder.

**Verify:** as Phase 2. Commit.

---

## Phase 4 — `chat/` (26 files) → sidepanel (folder disappears)

Largest folder in the tree, single owner, so it is bulk work rather than
judgment. All 26 go to `entrypoints/sidepanel/components/chat/`:

```
ChatComposer ChatComposerInput ChatContextBar ChatContextGauge ChatContextWarning
ChatDeepDive ChatFavicon ChatHeader ChatMessage ChatMessageEditor ChatMessageList
ChatModelSelect ChatRichTextInput ChatShell ChatSkillChip ChatSourceDrawer
ChatSourceIcon ChatTabTitleBar ChatUserBubble ChatUserHeading ChatUserHr
ChatUserLink ChatUserMarkdown ConversationMenu SkillPicker TabMentionMenu
```

```bash
for n in ChatComposer ChatComposerInput ChatContextBar ChatContextGauge \
  ChatContextWarning ChatDeepDive ChatFavicon ChatHeader ChatMessage \
  ChatMessageEditor ChatMessageList ChatModelSelect ChatRichTextInput ChatShell \
  ChatSkillChip ChatSourceDrawer ChatSourceIcon ChatTabTitleBar ChatUserBubble \
  ChatUserHeading ChatUserHr ChatUserLink ChatUserMarkdown ConversationMenu \
  SkillPicker TabMentionMenu; do
  mv_component "components/chat/$n.svelte" "entrypoints/sidepanel/components/chat/$n.svelte"
done
find src/components -type d -empty -delete
```

**This phase moves 8 test files' targets.** These import via relative paths and
are handled by `mv_component`'s second rewrite — confirm afterwards:

```
tests/chat/ChatUserBubble.test.svelte.js
tests/chat/composer/{ChatContextBar,ChatMessageEditor,ChatModelSelect,
                     ChatRichTextInput,ChatUserMarkdown,SkillPicker,
                     TabMentionMenu}.test.svelte.js
```

**Verify:** `rg -c 'src/components/chat' tests` → no matches;
`rg -c '@/components/chat' src tests` → no matches; then the four commands.
`npm test` must still report **494 passed** — a dropped chat test would show as a
lower count, not a failure. Commit.

---

## Phase 5 — `displays/` (24 files) dissolves entirely

The worst folder: three axes at once. It splits five ways.

```bash
# → sidepanel (core + platform)
for n in GenericSummaryDisplay SummaryContent SummaryWrapper; do
  mv_component "components/displays/core/$n.svelte" "entrypoints/sidepanel/components/displays/$n.svelte"
done
for n in CourseSummaryDisplay YouTubeSummaryDisplay; do
  mv_component "components/displays/platform/$n.svelte" "entrypoints/sidepanel/components/displays/$n.svelte"
done

# → archive
for n in ConversationList ConversationTranscript SummaryDisplay TagManagement; do
  mv_component "components/displays/archive/$n.svelte" "entrypoints/archive/components/displays/$n.svelte"
done
mv_component components/displays/history/HistoryTagFilter.svelte    entrypoints/archive/components/displays/HistoryTagFilter.svelte
mv_component components/displays/ui/DisplaySettingsControls.svelte  entrypoints/archive/components/displays/DisplaySettingsControls.svelte

# → content (floating panel)
for n in CourseSummaryDisplayFP FloatingPanelContent FloatingPanelFooter \
         GenericSummaryDisplayFP SummaryContentFP SummaryWrapperFP \
         YouTubeSummaryDisplayFP; do
  mv_component "components/displays/floating-panel/$n.svelte" "entrypoints/content/components/displays/$n.svelte"
done

# → shared: new markdown/ folder
for n in StreamingMarkdownV2 TableRenderer TimestampLink; do
  mv_component "components/displays/ui/$n.svelte" "components/markdown/$n.svelte"
done

# → shared: ui/
for n in ErrorDisplay FoooterDisplay ModelStatusDisplay; do
  mv_component "components/displays/ui/$n.svelte" "components/ui/$n.svelte"
done
find src/components -type d -empty -delete
```

`platform/` holds the **sidepanel** variants while their twins sit in
`floating-panel/` — same axis, two names. That's why both land under their own
surface's `displays/`.

Touches `tests/displays/StreamingMarkdownV2.test.svelte.js:5` (`@/` form,
handled by the helper).

**Verify:** `src/components/displays/` gone; `rg -c '@/components/displays' src
tests` → no matches; `src/components/markdown/` has exactly 3 files; then the
four commands. Commit.

---

## Phase 6 — `tools/`, `modals/`, `skills/`, `providerConfigs/` (14 files, all 4 folders disappear)

```bash
# deepdive → sidepanel (6)
for n in ChatProviderSelect CustomQuestionInput DeepDiveContent DeepDiveDialog \
         DeepDiveFAB InlineDeepDiveQuestions; do
  mv_component "components/tools/deepdive/$n.svelte" "entrypoints/sidepanel/components/deepdive/$n.svelte"
done
# deepdive → archive (1)
mv_component components/tools/deepdive/DeepDiveQuestionsArchive.svelte entrypoints/archive/components/DeepDiveQuestionsArchive.svelte
# deepdive → shared (1): used by archive + content + sidepanel
mv_component components/tools/deepdive/QuestionChip.svelte components/buttons/QuestionChip.svelte

# cloudsync → settings (3)
for n in CloudSyncUserCard SettingsConflictDialog SyncDebugLogs; do
  mv_component "components/tools/cloudsync/$n.svelte" "entrypoints/settings/components/cloudsync/$n.svelte"
done

mv_component components/modals/AssignTagsModal.svelte              entrypoints/archive/components/AssignTagsModal.svelte
mv_component components/skills/SkillList.svelte                    entrypoints/prompt/components/SkillList.svelte
mv_component components/providerConfigs/ProviderModelSelect.svelte entrypoints/settings/components/inputs/ProviderModelSelect.svelte
find src/components -type d -empty -delete
```

`QuestionChip` is shared by three surfaces and is a clickable chip, so it joins
`components/buttons/`. `modals/` held exactly one file while dialogs live in five
other places (02 §5) — that inconsistency is real but resolving it is a later
plan's job; here `AssignTagsModal` simply follows its owner.

**Verify:** all four source folders gone; `rg -c '@/components/(tools|modals|skills|providerConfigs)'
src tests` → no matches; then the four commands. Commit.

---

## Phase 7 — `buttons/` (10 of 18 move, 9 stay shared)

```bash
# → sidepanel
for n in ActionButtons ActionButtonsMini SettingButton; do
  mv_component "components/buttons/$n.svelte" "entrypoints/sidepanel/components/$n.svelte"
done
# → content
for n in ActionButtonsFP ActionButtonsMiniFP SaveToArchiveButtonFP; do
  mv_component "components/buttons/$n.svelte" "entrypoints/content/components/$n.svelte"
done
# → archive
for n in ExportMarkdownFAB SaveToArchiveFromHistoryButton; do
  mv_component "components/buttons/$n.svelte" "entrypoints/archive/components/$n.svelte"
done
# → settings
for n in ButtonRate ButtonSupport; do
  mv_component "components/buttons/$n.svelte" "entrypoints/settings/components/buttons/$n.svelte"
done
```

**Staying in `src/components/buttons/`** (9): `ButtonFont`, `ButtonIcon`,
`ButtonSet` (content+settings+sidepanel); `CopyButton`, `CopyMarkdownButton`,
`DownloadButton` (archive+content+sidepanel); `SaveToArchiveButton`
(archive+sidepanel); `SummarizeButton` (content+sidepanel); `QuestionChip`
(arrived in Phase 6).

Note the 40–80% overlap across `ActionButtons`/`Mini`/`FP`/`MiniFP` and the three
`SaveToArchiveButton` variants (02 §6). They now sit in different surfaces, which
is the point — **do not merge them.**

**Verify:** `ls src/components/buttons | wc -l` → **9**; then the four commands.
Commit.

---

## Phase 8 — `inputs/` (10 of 13 move, 3 stay shared)

```bash
for n in ApiKeyInput ApiKeyInputMulti EnableToggle FeatureModelPicker \
         ReusableCombobox Switch SwitchPermission TextInput ToolEnableToggle \
         UILanguageSelect; do
  mv_component "components/inputs/$n.svelte" "entrypoints/settings/components/inputs/$n.svelte"
done
```

**Staying in `src/components/inputs/`** (3): `LanguageSelect` and `ReusableSelect`
(content+settings+sidepanel), `ShadowDOMLanguageSelect` (content+sidepanel).

Touches `tests/settings/FeatureModelPicker.test.svelte.js:51` (`@/` form).

**Verify:** `ls src/components/inputs | wc -l` → **3**;
`ls src/entrypoints/settings/components/inputs | wc -l` → **11** (10 + the
`ProviderModelSelect` that arrived in Phase 6); then the four commands. Commit.

---

## Phase 9 — `settings/` (16 files → settings + prompt; folder disappears)

```bash
for n in AIProviderSettings AboutSettings AppearanceSettings ChatSettings \
         DataSyncSettings ExportImport FABSettings FirefoxPermissionOverlay \
         OpenAICompatibleProfileConfig ProviderKeyConfig ReleaseNote Setting \
         SummarySettings; do
  mv_component "components/settings/$n.svelte" "entrypoints/settings/components/$n.svelte"
done
for n in CloudSyncToolSettings DeepDiveToolSettings; do
  mv_component "components/settings/tools/$n.svelte" "entrypoints/settings/components/tools/$n.svelte"
done
mv_component components/settings/Logdev.svelte entrypoints/prompt/components/Logdev.svelte
find src/components -type d -empty -delete
```

**Then fix the two Phase-1 exceptions by hand.** Both files moved one directory
deeper relative to the repo root:

- `src/entrypoints/settings/components/AboutSettings.svelte`
- `src/entrypoints/settings/components/ReleaseNote.svelte`

change `'../../../package.json'` → `'../../../../package.json'` in each. (Old
location `src/components/settings/` was 3 levels below the root; the new one is
4.) Getting this wrong fails the **build**, not the type check — so don't skip
the build in this phase's verify.

`Logdev.svelte` lives in `settings/` today but is imported only by the **prompt**
entrypoint.

**Verify:**
```bash
test ! -d src/components/settings && echo "gone"
rg -n "package\.json'" src/entrypoints/settings/components/{AboutSettings,ReleaseNote}.svelte
npm test && npm run check && npm run build && npm run build:firefox
```
Commit.

---

## Phase 10 — `ui/` (20 of 22 move, 2 stay + 4 arrived earlier)

The dumping ground, last because it's the most mixed.

```bash
# → settings (10)
for n in ConfirmDialog Field Logo Logo-color Pivot Preview PreviewData ToolIcon96 version; do
  mv_component "components/ui/$n.svelte" "entrypoints/settings/components/ui/$n.svelte"
done
mv_component components/ui/paths.ts entrypoints/settings/components/ui/paths.ts

# → sidepanel (6)
for n in Noti cat PermissionWarningPrompt SidepanelTabBar TabTitleBar Tooltip; do
  mv_component "components/ui/$n.svelte" "entrypoints/sidepanel/components/$n.svelte"
done

# → archive (2)
for n in ActionDropdownMenu TagActionDropdownMenu; do
  mv_component "components/ui/$n.svelte" "entrypoints/archive/components/$n.svelte"
done

# → content (2)
mv_component components/ui/ShadowTooltip.svelte              entrypoints/content/components/ShadowTooltip.svelte
mv_component components/ui/shadowTooltipState.svelte.js      entrypoints/content/components/shadowTooltipState.svelte.js
```

Careful: `paths.ts` is the one non-`.svelte` file in this folder, which is why it
gets its own line instead of joining the loop. `shadowTooltipState.svelte.js` is
likewise a `.js` file, not a component — it holds `ShadowTooltip`'s state and is
content-only, so the two move together.

**Staying in `src/components/ui/`** (6): `ApiKeySetupPrompt`, `HoverTooltip`, plus
`TabNavigation` (Phase 3) and `ErrorDisplay`, `FoooterDisplay`,
`ModelStatusDisplay` (Phase 5).

`ActionDropdownMenu` ↔ `TagActionDropdownMenu` are 73% identical and share a
folder today; both are archive-only, so they move together and stay unmerged.

**Verify:** `ls src/components/ui | wc -l` → **6**;
`ls src/components` → exactly `buttons icons inputs markdown ui welcome`;
`find src/components -type f | wc -l` → **32**; then the four commands. Commit.

---

## Phase 11 — Lock it in: Rules 5 + 6, docs, cleanup

Without this phase the tree rots back within months and Phases 2–10 are wasted.

**11.1 — Extend [tests/architecture/layering.test.js](tests/architecture/layering.test.js).**
Reuse its existing helpers (`walkDir`, `relToSrc`, `extractImports`, `resolveSpec`,
`layerOf`, `findViolations`) — do not write a parallel resolver. Note
`resolveSpec` handles `@/` + relative only; that is sufficient (`rg` confirms
**0** uses of the `~/` alias in `src/`).

**Rule 5 — no cross-surface component imports** (02 §5.3):

> A file under `src/entrypoints/<A>/components/` must not be imported by any file
> under `src/entrypoints/<B>/` where `A !== B`.

Scan `entrypoints`; for each import resolving to
`entrypoints/<B>/components/…`, compare `<B>` against the importer's own surface
and fail on mismatch. Failure message should name both surfaces and point at the
"2+ entrypoints" rule in CLAUDE.md.

**Rule 6 — nothing single-owner in the shared tree** (new, agreed with user):

> Every file under `src/components/` must be reachable from **2 or more**
> entrypoint roots.

Implementation: BFS from each root following both static and dynamic imports,
resolving `@/` → `src/`; report any `src/components/` file reached by fewer than
2 surfaces (0 owners = dead code, 1 owner = belongs next to that surface).

Roots — enumerate, don't hardcode a stale list:
- `src/entrypoints/{sidepanel,archive,settings,popop,prompt}/main.js`
- `src/entrypoints/content/main.js`
- every top-level `src/entrypoints/*.content.js` (glob it)
- `src/entrypoints/background.js`

**`settings` and `popop` must count as one owner** (`popop/App.svelte` mounts
settings' `Setting.svelte`; without the alias, all 41 settings components look
2-owner and Rule 6 silently passes on them). Cost is one BFS over ~1600 files —
negligible next to the existing suite.

Sanity-check both rules actually bite before committing: temporarily add an
import of `@/entrypoints/archive/components/TOCArchive.svelte` to a sidepanel
file (Rule 5 must fail), and temporarily `git mv` one sidepanel-only component
into `src/components/ui/` (Rule 6 must fail). Revert both.

**11.2 — Update [CLAUDE.md](CLAUDE.md).** In "Code Layering & Component Rules":
- Replace the "Where components go" paragraph with the measured rule: `src/components/*`
  is only for 2+ surfaces, currently 6 folders / 32 files; everything else lives
  in `src/entrypoints/<surface>/components/`.
- Record that `settings` + `popop` are one owner, and why.
- Note the guard now has Rules 1–6, and that Rule 6 is why a new shared
  component needs a second consumer before it can live in `src/components/`.
- Fix the stale "Testing / Currently no explicit test configuration in
  package.json" section — there are 50 test files and `npm test` is `vitest run`.
  Also correct `npm check` → `npm run check`.

**11.3 — Cleanup.** `find src/components -type d -empty -delete`; confirm nothing
references a pre-reorg path:

```bash
rg -n "@/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests
rg -n "src/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests
```
Both must return nothing.

**Verify:**
```bash
npm test && npm run check && npm run build && npm run build:firefox
```
`npm test` → 494 + the new rule tests, **0 failures**. Commit.

---

## Out of scope

- **Merging any duplicate pair from 02 §6** — `Noti`↔`NotiFP` (95%),
  `DeepDivePanelFP`↔`Mobile` (72%), the 4-file TOC family (1509 lines, no shared
  base), `ApiKeyInput`↔`Multi` (88%), `ActionButtons`×4, `SaveToArchiveButton`×3,
  `EnableToggle`↔`ToolEnableToggle`, `Switch`↔`SwitchPermission`,
  `LanguageSelect`↔`ShadowDOMLanguageSelect`, `ActionDropdownMenu`↔`Tag…` (73%),
  `Preview`↔`PreviewData`. The reorg's job is to *expose* these by putting them
  in different surfaces. A later plan merges them.
- **The `*Display` copy-paste matrix.** Generic/Content/Wrapper/YouTube/Course
  re-implemented per surface with no shared base. Low line-overlap because the
  copies *diverged* — these are forks, not thin variants. That's a redesign.
- **Consolidating the `marked` importers** into `components/markdown/`.
  Phase 5 creates the folder; it does not rewrite `ChatMessage`,
  `ConversationTranscript`, `SummaryDisplay`, `SummaryContent`, or
  `SummaryContentFP` to use it.
- **Renaming anything**, including `FoooterDisplay.svelte` and the misleading
  `TOCSidebar` (archive's, not the sidepanel's).
- **The two summarize stacks** (`stores/summaryStore.svelte.js` 1602 lines vs
  `content/composables/useSummarization.svelte.js` 913 +
  `content/services/SummarizationService.js` 421) — 02 §7, the largest remaining
  behavioral divergence. Untouched here.
- **The two generic web extractors** — see the note in "Goal & scope" above.
  Likely a real bug; needs its own investigation, not a move.
- **`lib/`, `services/`, `stores/`, `wxt.config.ts`, the manifest, and the
  top-level `*.content.js` files.**

---

## Final verification checklist

- [ ] `find src/components -type f | wc -l` → **32**
- [ ] `ls src/components` → exactly `buttons icons inputs markdown ui welcome`
- [ ] Per-surface counts: sidepanel **48**, settings **41**, archive **15**,
      content **14** (7 pre-existing + 7 new flat + 7 in `displays/`  = 21 total
      files in that dir), prompt **3**
- [ ] `rg -n "@/components/(chat|displays|feedback|modals|navigation|providerConfigs|settings|skills|tools)/" src tests` → nothing
- [ ] `rg -o "(from |import\()['\"]\.[^'\"]*['\"]" src/components | wc -l` → **0**
      (the 2 `package.json` exceptions left `components/` in Phase 9)
- [ ] `npm test` → **494+ passed, 0 failed**
- [ ] `npm run check` → **0 ERRORS** (14 warnings is the accepted baseline)
- [ ] `npm run build` and `npm run build:firefox` both finish
- [ ] Rules 5 and 6 fail when deliberately violated, pass otherwise (11.1)
- [ ] Manual smoke, unpacked from `.output/chrome-mv3`: summarize a web page from
      the **side panel**; summarize from the **floating panel** on the same page;
      open **settings** and change a provider; open the **archive** and view an
      entry; open the **popup**. These are the five surfaces the reorg partitions —
      a bad import path in any of them is a blank panel, which no build catches.

## Notable files

- [tests/architecture/layering.test.js](tests/architecture/layering.test.js) — gains
  Rules 5 and 6 in Phase 11. The only file in the plan where logic is *written*
  rather than moved.
- [CLAUDE.md](CLAUDE.md) — component-placement rule, the settings+popop
  one-owner note, and the stale "no test configuration" section.
- `src/components/**` — 129 of 153 files move; 24 stay. Full table in Phases 2–10.
- `src/entrypoints/{sidepanel,archive,settings,prompt}/components/` — created by
  this plan. `content/components/` already exists and gains 14 files.
- [src/entrypoints/popop/App.svelte](src/entrypoints/popop/App.svelte) — its
  `Setting.svelte` import is rewritten in Phase 9; the shell itself doesn't move.
- 10 test files under `tests/chat/`, `tests/displays/`, `tests/settings/` — import
  paths rewritten in Phases 4, 5, and 8.
- Two `package.json` importers (`AboutSettings.svelte`, `ReleaseNote.svelte`) —
  the only hand-edited import depths, Phase 9.
