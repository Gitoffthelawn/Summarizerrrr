# Full Reorg Direction — surface-first

> **Status:** direction for a LATER plan. Not yet executed.
> **Precondition:** assumes [`01-cleanup-and-rule.md`](./01-cleanup-and-rule.md) is complete — dead code deleted, name collisions resolved, layering rule written down and guarded by a test.
> **Do not reorg before the rule exists.** Without the guard test the tree will rot again within months and the move work is wasted.

Survey date: 2026-07-27, branch `v3.0-NewSettingUI-2` (commit `ad75f1c`).

---

## 1. The root problem

The tree is organized by **"what kind of thing this is"** (`buttons/`, `inputs/`, `ui/`, `displays/`), but the real boundary in this extension is **"which surface owns it"** (sidepanel / archive / settings / content / prompt).

That is why `src/components/ui/` and `src/components/displays/ui/` became dumping grounds: when a type-based taxonomy has no slot for a thing that belongs to one surface, people drop it in `ui/`.

## 2. The principle

`src/components/*` contains **only** things used by **2 or more entrypoints**. Anything used by a single surface lives next to that entrypoint.

WXT only scans the **top level** of `entrypoints/` for entrypoints; subdirectories are ordinary code. `entrypoints/content/` already has `components/ composables/ extractors/ services/ styles/` sitting next to `main.js` — so this model is **already proven inside this repo**, not a new invention.

## 3. Supporting data

From an import-graph survey (BFS from each entrypoint's `main.js`, plus every `*.content.js`):

- **26** leaf component folders. **13** are consumed by exactly **1** entrypoint.
- Only **4** are genuinely shared at the file level: `icons/`, `welcome/` (+2 subfolders), `displays/ui/`, and part of `buttons/`.
- **5** folders are **fake-shared**: `ui/`, `navigation/`, `feedback/`, `inputs/`, `tools/deepdive/` — they look shared at the folder level, but per-file they partition almost perfectly by entrypoint.

| Folder | Reality |
|---|---|
| `chat/` (29 files) | **sidepanel only**. Largest folder in the tree, single owner. |
| `feedback/` (3 files) | Zero overlap: `ModelToast`→sidepanel, `CustomToast`→prompt, `ShadowToast`→content. One toast per surface. |
| `navigation/` (6 files) | Each TOC belongs to exactly one entrypoint. `TOCSidebar` is **not** the sidepanel's — it is archive-only. The name actively misleads. |
| `displays/core/` | Named "core" but consumed by **sidepanel only**. |
| `ui/` (24 files) | 9 settings-only, 6 sidepanel-only, 2 archive-only, 1 content-only. Only 2 files genuinely cross a surface boundary. |

**Important caveat:** `popop/` is a 117-line shell that mounts the same `components/settings/Setting.svelte` that `settings/` mounts. So **`settings` + `popop` count as one owner**, not two.

## 4. Target layout

```
src/
  entrypoints/
    background.js
    *.content.js                    # unchanged — the manifest depends on these paths
    sidepanel/
      main.js  index.html  App.svelte
      messageHandler.js  initialization.js   # already moved in plan 01
      components/     ← chat/ (29) · displays/core/ · displays/platform/ (2)
                        navigation/TOC.svelte · feedback/ModelToast
                        ui/{SidepanelTabBar,TabTitleBar,Noti}
                        tools/deepdive/ (6 sidepanel-only files)
    archive/
      components/     ← displays/archive/ (survivors) · displays/history/HistoryTagFilter
                        navigation/{TOCArchive,TOCSidebar,TabArchive}
                        modals/AssignTagsModal · ui/TagActionDropdownMenu
                        displays/ui/DisplaySettingsControls
                        tools/deepdive/DeepDiveQuestionsArchive
    settings/
      components/     ← settings/ (14) · settings/tools/ (2) · tools/cloudsync/ (3)
                        providerConfigs/ · the 9 settings-only files from inputs/
                        ui/{Field,Pivot,Preview,PreviewData,paths.ts}
                        ui/{Logo,Logo-color,version}      # art, not primitives
    popop/            # keep the shell; it imports from settings/components/
    prompt/
      components/     ← skills/SkillList · settings/Logdev · feedback/CustomToast
    content/
      components/     ← already correct; also receives displays/floating-panel/ (7)
                        navigation/TOCMobile · feedback/ShadowToast

  components/         # ONLY things genuinely used by 2+ surfaces
    ui/               ← Tooltip · ShadowTooltip · HoverTooltip · ConfirmDialog
                        ActionDropdownMenu · ApiKeySetupPrompt · PermissionWarningPrompt
    inputs/           ← LanguageSelect · ReusableSelect · ShadowDOMLanguageSelect
                        Switch · TextInput
    buttons/          ← ButtonFont · ButtonIcon · ButtonSet
                        CopyButton · CopyMarkdownButton · DownloadButton
    markdown/         ← StreamingMarkdownV2 · TableRenderer · TimestampLink  (from displays/ui)
    icons/            ← unchanged
    welcome/          ← unchanged (sidepanel + content — the cleanest folder in the current tree)
```

Three folders **disappear**:

- **`displays/`** — currently split on three incompatible axes at once: layer (`core`, `ui`), surface (`archive`, `floating-panel`, `mobile`), and content-type (`platform`). Worse, `platform/` actually holds the *sidepanel* variants while their FP twins live in `floating-panel/` — the same axis expressed two different ways.
- **`feedback/`** — 3 toasts sharing nothing; one goes to each surface.
- **`modals/`** — 1 file, while dialogs/sheets/drawers are scattered across 5 other locations (`ui/ConfirmDialog`, `tools/cloudsync/SettingsConflictDialog`, `tools/deepdive/DeepDiveDialog`, `chat/ChatSourceDrawer`, `entrypoints/archive/Dialog.svelte`, `entrypoints/content/components/{BlacklistConfirmModal,MobileSheet}`).

## 5. How to execute

1. **One folder per commit.** No big-bang. Start with `feedback/` (3 files, zero overlap — the easiest possible case) to validate the process, then `navigation/`, then `chat/` (large but single-owner, so it's straightforward).
2. **Codemod the imports.** 538 imports use the `@/` alias, so most of this is string rewriting. But **41 imports use `../../`** and **5 use `../../../`** — grep those out **before** moving anything; they need manual fixing.
3. **Extend the guard test** from plan 01 §5.2 with a fifth rule. This is what makes the reorg stick:

   > A file under `entrypoints/<A>/components/` must not be imported by any file under `entrypoints/<B>/`.

   With that in place, components sliding back into the shared tree is blocked automatically — nobody has to remember.
4. Verify after **every** commit:
   ```bash
   npm test && npm run check && npm run build && npm run build:firefox
   ```

## 6. What the reorg will expose — save for yet another plan

Moving files will surface the duplicate pairs the current folder structure hides. **Do not merge them while moving.** Mixing "move a file" with "change behavior" means you won't know which one broke things.

| Pair | Overlap | Note |
|---|---|---|
| `ui/Noti` ↔ `content/components/NotiFP` | **95%** | Worst offender. After the reorg they sit in two different surfaces → obvious candidate for `components/ui/`. |
| `DeepDivePanelFP` ↔ `DeepDivePanelMobile` | **72%** | ~930 lines total, both under content. |
| TOC family (`TOC`/`TOCSidebar`/`TOCArchive`/`TOCMobile`) | 27–64% | **1509 lines across 4 files, no shared base.** |
| `ApiKeyInput` ↔ `ApiKeyInputMulti` | 88% | |
| `ActionButtons` ↔ `Mini` ↔ `FP` ↔ `MiniFP` | 40–80% | |
| `SaveToArchiveButton` × 3 variants | 58–59% | |
| `EnableToggle` ↔ `ToolEnableToggle` | 70% | |
| `Switch` ↔ `SwitchPermission` | 64% | |
| `LanguageSelect` ↔ `ShadowDOMLanguageSelect` | 63% | |
| `ui/ActionDropdownMenu` ↔ `ui/TagActionDropdownMenu` | 73% | Same folder. |
| `ToolIcon64` ↔ `ToolIcon96` | 29 diff lines / 219 | Same SVG at two sizes. |
| `Preview` ↔ `PreviewData` | 6 diff lines / 34 | |

Two more things worth recording:

- **The `*Display` copy-paste matrix.** The same 4–5 concepts (Generic / Content / Wrapper / YouTube / Course) are re-implemented per surface with **no shared base**. Line-overlap is *low* precisely because each copy has drifted far apart — these are **diverged forks**, not thin variants. Fixing this is a redesign, not a dedup. Don't underestimate it.
- **Several files independently `import { marked }`** and render markdown themselves: `chat/ChatMessage`, `displays/archive/{ConversationTranscript,SummaryDisplay}`, `displays/core/SummaryContent`, `displays/floating-panel/SummaryContentFP`, `displays/ui/StreamingMarkdownV2` (a few more existed but were deleted in plan 01). The survivors should consolidate into `components/markdown/`.

## 7. What's left — the logic layers

A component reorg doesn't touch `lib/ services/ stores/`. After plan 01 those layers are **correctly directed and test-guarded**, but two problems remain:

- **Two parallel summarize stacks.** `stores/summaryStore.svelte.js` (1602 lines, for the sidepanel) and `entrypoints/content/composables/useSummarization.svelte.js` (913) + `content/services/SummarizationService.js` (421) do the same job and call the same `lib/api/api.js`, but are two separate implementations. This is the **largest remaining source of behavioral divergence** in the repo.
- **Two generic web extractors of different quality.** `lib/content/semanticPageExtractor.js` uses Defuddle; `content/extractors/ContentExtractorService.extractGenericContent()` just does `document.body.innerText` with a `textContent` fallback. **Extraction quality changes depending on which UI surface you summarize from** — this is likely a user-visible bug, not merely a structural wart. **Worth investigating before the reorg, not after.**

---

## See also

- [`01-cleanup-and-rule.md`](./01-cleanup-and-rule.md) — the prerequisite cleanup + layering rule
- [`03-god-files.md`](./03-god-files.md) — seams for splitting the four oversized files
