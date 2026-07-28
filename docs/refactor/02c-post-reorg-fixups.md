# Post-Reorg Fixups — executable plan

> **How to use this doc:** Self-contained execution plan, intended to be run in a
> fresh session. Start at Phase 1 and go in order. Each phase ends with a verify
> step — don't move on until it passes.

**Precondition:** [`02b-full-reorg-plan.md`](./02b-full-reorg-plan.md) has been
implemented in full (all 11 phases) and reviewed. Its 11 walkthroughs live in
[`walkthroughs-02b/`](./walkthroughs-02b/). **Nothing from that work is
committed yet** — see Phase 2, which is the load-bearing phase of this plan.

---

## Context

The 02b reorg moved 129 of 153 files out of `src/components/` into
`src/entrypoints/<surface>/components/`, leaving a 32-file shared tree, and added
Rules 5 + 6 to [tests/architecture/layering.test.js](tests/architecture/layering.test.js).
An independent reviewer (fresh context, read-only) then rebuilt the import graph
from the pre-reorg tree, resolved every static/bare/dynamic specifier in all 374
source + test files on both sides, and mapped old→new through git's rename map:
**the import graph is identical — zero lost or gained edges.** All 450 changed
lines under `src/` are import specifiers, so the plan's "moves only" constraint
held. Rules 5 and 6 were probed with deliberate violations and both failed
correctly, including confirmation that the `settings` + `popop` one-owner alias
is load-bearing.

The reorg itself is therefore sound. What remains is one process hazard and three
documentation inaccuracies:

| # | Severity | Finding |
|---|---|---|
| 1 | **Major** | The git index is partially staged: `git mv` staged the 129 renames, but the import rewrites that accompany them are **unstaged**. A default (index-only) `git commit` would commit files at their *new* paths still carrying their *old* import specifiers — 171 unresolvable — and the committed tree would fail `npm run build`. Current `git status --short`: **68 `R`, 61 `RM`, 30 `M`**. The `RM`/`M` rows are the trap. |
| 2 | Minor | [walkthrough-Phase-1.md](./walkthroughs-02b/walkthrough-Phase-1.md) claims *every* relative import inside `src/components/` was normalized. Two multi-line `await import(\n  '../../services/…'\n)` calls in `ExportImport.svelte` survived, because the plan's own verify regex requires the quote on the same line as `import(`. They broke the build during Phase 9 and were fixed there. Net effect on the final tree: zero. |
| 3 | Minor | [walkthrough-Phase-10.md](./walkthroughs-02b/walkthrough-Phase-10.md) reports `find src/components -type f \| wc -l` → `32`. It returns **33**, because macOS Finder leaves a `src/components/.DS_Store` (gitignored — `.gitignore:132`). The tracked count is genuinely 32. Phase 11's walkthrough already catches and annotates this; only Phase 10's number is stated bare. |
| 4 | Minor | [walkthrough-Phase-5.md:55](./walkthroughs-02b/walkthrough-Phase-5.md) says "and its four subfolders" then lists six. |

Plus one item the reviewer could not run and neither can a fresh session: the
**manual five-surface smoke test** from an unpacked build. A wrong-but-existing
import target is the characteristic bug of a refactor like this, and a blank
panel is what it looks like — no build or type-check catches it. The reviewer's
import-graph equivalence proof makes this unlikely, not impossible.

### Goal & scope decision (confirmed with user)

- **One commit for the whole 02b reorg, staged with `git add -A`.** The plan's
  original "one phase = one commit" is unrecoverable: files like
  `src/entrypoints/sidepanel/App.svelte` were edited by six different phases
  (2, 3, 4, 5, 7, 10), so no pathspec split can separate them. Reconstructing
  per-phase commits would mean resetting to `ca95eab` and re-running ~1.5 h of
  already-reviewed work, with a real chance the second run diverges from the
  reviewed result. Not worth it.
- **Doc corrections only — no source changes.** Phase 1 edits three walkthrough
  files. It must not touch anything under `src/` or `tests/`. The reorg's source
  state is reviewed and verified; leave it alone.
- **Rule 5's residual gap is out of scope.** The reviewer noted Rule 5 scans only
  `src/entrypoints/`, so a `src/components/` → `entrypoints/` import would slip
  past it. That is exactly what 02b §11.1 specified — a design gap, not a
  deviation. Recorded under "Out of scope" as a follow-up.
- **No new dependencies. No changes to `lib/`, `services/`, `stores/`, the
  manifest, or `wxt.config.ts`.**

### Baseline (measured at the time of writing — all green)

```
npm test              → 50 files, 496 tests passed   (494 pre-reorg + 2 new rule tests)
npm run check         → 1622 files, 0 ERRORS, 14 warnings
npm run build         → ✔ chrome-mv3
npm run build:firefox → ✔ firefox-mv2
HEAD                  → ca95eab  (unchanged throughout the reorg)
```

**The 14 warnings are pre-existing** (a11y label + unused CSS selector). `npm run
check` exits non-zero on **errors** only. The bar in every phase below is **0
errors** — do not chase the warnings.

---

## Phase 1 — Correct the three walkthrough inaccuracies

Documentation only. **Do not touch any file under `src/` or `tests/`.**

### 1.1 — [walkthroughs-02b/walkthrough-Phase-1.md](./walkthroughs-02b/walkthrough-Phase-1.md)

Three places overstate completeness. The correction is to scope the claim to what
the plan's verify regex could actually see, and point at where the remainder was
fixed.

- **Line 3** ends `…with the two deliberate `package.json` exceptions left
  untouched. No files were moved or renamed.` Append a sentence noting that two
  **multi-line** `await import()` specifiers in
  `src/components/settings/ExportImport.svelte` were not caught by the plan's
  single-line verify regex and were fixed in Phase 9 when they broke the build.
- **Line 54** (`- Ran the plan's specified check … → **2** …`) — add that the
  regex requires the opening quote on the same line as `import(`, so multi-line
  dynamic imports are invisible to it. This is the *reason* for the miss and the
  most useful part of the correction.
- **Line 87** (`- [x] Exactly 2 relative-import hits remain …`) — reword so the
  checkbox describes what was measured (2 hits *by that check*) rather than
  asserting no relative imports remained.

Do not rewrite the walkthrough wholesale and do not soften the rest of it — the
phase's actual work was correct and independently verified.

### 1.2 — [walkthroughs-02b/walkthrough-Phase-10.md](./walkthroughs-02b/walkthrough-Phase-10.md)

- **Line 110** is inside a fenced `sh` block containing the plan's verify
  commands; **line 121** is the bare `32` in the `Output:` block below it; **line
  166** is the `- [x] find src/components -type f | wc -l → 32.` checkbox.
- Annotate both the output and the checkbox: the raw `find` returns **33** when a
  gitignored `src/components/.DS_Store` is present; the tracked count is **32**.
  Give the robust command that is stable either way:

  ```sh
  git ls-files src/components | wc -l   # → 32
  ```

  (`find src/components -type f -not -name '.DS_Store' | wc -l` also returns 32.)
- Leave the recorded `Output:` block honest — annotate it, don't silently rewrite
  observed output to a number that wasn't printed.

### 1.3 — [walkthroughs-02b/walkthrough-Phase-5.md](./walkthroughs-02b/walkthrough-Phase-5.md)

- **Line 55**: `(and its four subfolders \`core/\`, \`platform/\`, \`archive/\`,
  \`history/\`, \`ui/\`, \`floating-panel/\`)` → **six** subfolders. One-word fix.

**Verify:**

```bash
# 1. Only the three walkthroughs changed — nothing under src/ or tests/
git status --short docs/refactor/walkthroughs-02b/
git diff --stat -- src tests | tail -1   # must be identical to before this phase

# 2. The stale claims are gone
rg -n "Exactly 2 relative-import hits remain" docs/refactor/walkthroughs-02b/   # → no match
rg -n "four subfolders" docs/refactor/walkthroughs-02b/                          # → no match

# 3. The corrections landed
rg -n "ExportImport" docs/refactor/walkthroughs-02b/walkthrough-Phase-1.md       # → hits
rg -n "DS_Store|ls-files" docs/refactor/walkthroughs-02b/walkthrough-Phase-10.md # → hits
```

No source changed, so no build/test run is required in this phase.

---

## Phase 2 — Stage everything and commit the reorg (the load-bearing phase)

This is finding #1. The failure mode is silent: `git commit -m "…"` exits 0 and
produces a tree that does not build.

**Do, in this order:**

1. Re-confirm the working tree is green *before* committing — this is what you are
   about to freeze:

   ```bash
   npm test && npm run check && npm run build && npm run build:firefox
   ```

   `npm test` → 496 passed. `npm run check` → 0 errors (14 warnings OK). Both
   builds finish. **If any of these fail, stop — do not commit.** Report which
   one failed and its real output; something has drifted since the reorg was
   reviewed.

2. Stage **everything**, including the unstaged import rewrites:

   ```bash
   git add -A
   ```

   `-A` is not optional. Plain `git commit` (index-only) or `git add <paths>` on a
   subset reproduces the broken-tree bug.

3. Confirm the index now matches the working tree — this is the check that proves
   the trap is defused:

   ```bash
   git status --short
   ```

   Every row must be staged-only: `R`, `M`, `A` in **column 1** with a **blank
   column 2**. Any surviving `RM`, ` M`, or `??` (other than gitignored noise
   like `.DS_Store`) means something is still unstaged — do not commit until the
   list is clean.

4. Commit as one commit. Note that
   [docs/refactor/02-full-reorg-direction.md](./02-full-reorg-direction.md) has a
   pre-existing user-owned modification from before the reorg; `git add -A` picks
   it up, which is fine and intended here.

   Suggested message (adjust wording freely, keep the trailer):

   ```
   refactor(structure): reorganize components by owning surface

   Move 129 of 153 files out of src/components/ into
   src/entrypoints/<surface>/components/, leaving a 32-file shared tree
   (buttons, icons, inputs, markdown, ui, welcome) for components used by
   2+ surfaces. Nine folders retired: chat, displays, feedback, modals,
   navigation, providerConfigs, settings, skills, tools.

   Moves only — no merges, renames, or behavior changes. Import graph
   verified identical before and after.

   Add layering guard Rules 5 (no cross-surface component imports) and 6
   (nothing single-owner in the shared tree), with settings+popop counted
   as one owner.

   Implements docs/refactor/02b-full-reorg-plan.md.

   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   ```

**Verify:**

```bash
# 1. Working tree clean → the commit IS what you tested in step 1
git status --short          # → empty (or gitignored noise only)

# 2. The commit contains the renames AND the rewrites
git show --stat HEAD | tail -3          # ~161 files changed
git show --stat -M HEAD | rg -c '=>'    # renames present (~129)

# 3. The committed tree builds. Because the working tree is clean, HEAD == disk,
#    so this validates the commit itself, not just the worktree.
npm test && npm run check && npm run build && npm run build:firefox

# 4. Nothing references a pre-reorg path in the committed tree
git grep -n "@/components/\(chat\|displays\|feedback\|modals\|navigation\|providerConfigs\|settings\|skills\|tools\)/" HEAD -- src tests   # → nothing
```

**Do not push yet** — Phase 3 is the only check that can catch a
wrong-but-existing import target, and it needs a human.

---

## Phase 3 — Manual five-surface smoke test (user-executed)

**This phase cannot be done by an agent.** It needs a browser, a real profile,
and a pair of eyes. A fresh session executing this plan should build the
extension, then hand these steps to the user and stop.

The reorg partitioned the codebase along exactly five surfaces. A rewritten
import that resolves to a *different but existing* file passes both `npm run
check` and `npm run build`, and shows up only as a blank or broken panel at
runtime. These five clicks are the coverage.

**Setup:**

```bash
npm run build
```

Then load `.output/chrome-mv3` as an unpacked extension via
`chrome://extensions` → Developer mode → *Load unpacked*.

**The five checks** — on any ordinary article page:

| # | Surface | Do this | Expect |
|---|---|---|---|
| 1 | **Side panel** | Open the side panel and summarize the page | Summary streams in; header, TOC, action buttons (copy / download / save) all render |
| 2 | **Floating panel** | On the *same* page, toggle the floating panel (FAB or shortcut) and summarize | Panel renders inside its Shadow DOM; footer and mini action buttons present |
| 3 | **Settings** | Open settings; switch AI provider; change a toggle | Every settings section renders; provider/model dropdowns populate; the About tab shows a version number (this is the `package.json` import depth fixed in 02b Phase 9) |
| 4 | **Archive** | Open the archive; open a saved entry | List renders; entry body, TOC sidebar, and tag controls render |
| 5 | **Popup** | Click the extension icon | Popup renders the settings UI (it mounts settings' `Setting.svelte` — the one component shared across two entrypoints) |

Also glance at the DevTools console on each surface for
`Failed to resolve module` / `undefined is not a constructor` — those are the
signature of a bad import path.

**Verify:** all five surfaces render and function. If any is blank or throws,
capture the console error and the failing import specifier; the fix is a
follow-up commit on top of Phase 2's (do **not** amend — the reorg commit is
already verified green at build level, and a separate fix commit keeps the
bisect history honest).

Once all five pass, the reorg is safe to push.

---

## Out of scope

- **Reconstructing per-phase commits.** Decided against — see "Goal & scope".
- **Widening Rule 5 to catch `src/components/` → `entrypoints/` imports.** The
  reviewer flagged this as a residual gap: Rule 5 scans only `src/entrypoints/`,
  so that direction slips past it. 02b §11.1 specified it that way, so it is a
  design gap rather than a defect. Worth a small follow-up plan; not this one.
- **Merging any duplicate pair exposed by the reorg** — `Noti`↔`NotiFP` (95%),
  the 4-file TOC family, `ApiKeyInput`↔`Multi` (88%), `ActionButtons`×4,
  `SaveToArchiveButton`×3, `ActionDropdownMenu`↔`Tag…` (73%),
  `Preview`↔`PreviewData`, and the `*Display` fork matrix. The reorg's job was to
  *expose* these by separating them by surface. See
  [02-full-reorg-direction.md](./02-full-reorg-direction.md) §6.
- **The two generic web extractors** —
  [semanticPageExtractor.js](src/lib/content/semanticPageExtractor.js) uses
  Defuddle while `ContentExtractorService.extractGenericContent()` uses
  `document.body.innerText`, so extraction quality depends on which surface you
  summarize from. Likely a real user-visible bug; needs its own investigation.
- **The two summarize stacks** (`stores/summaryStore.svelte.js` vs
  `content/composables/useSummarization.svelte.js` +
  `content/services/SummarizationService.js`) — the largest remaining behavioral
  divergence.
- **Renaming anything**, including `FoooterDisplay.svelte` and the misleading
  `TOCSidebar` (archive's, not the sidepanel's).
- **Fixing the 14 pre-existing `npm run check` warnings.**

---

## Final verification checklist

- [ ] Three walkthroughs corrected; `git diff --stat -- src tests` unchanged by Phase 1
- [ ] `git status --short` → empty after the commit
- [ ] `git show --stat -M HEAD` → ~161 files, ~129 renames, in **one** commit
- [ ] `git ls-files src/components | wc -l` → **32**
- [ ] `ls src/components` → exactly `buttons icons inputs markdown ui welcome`
- [ ] `npm test` → **496 passed, 0 failed**
- [ ] `npm run check` → **0 ERRORS** (14 warnings is the accepted baseline)
- [ ] `npm run build` and `npm run build:firefox` both finish
- [ ] `git grep` for pre-reorg `@/components/…` paths in `HEAD` → nothing
- [ ] All five surfaces smoke-tested by the user (Phase 3) **before** pushing

## Notable files

- [walkthroughs-02b/walkthrough-Phase-1.md](./walkthroughs-02b/walkthrough-Phase-1.md)
  — lines 3, 54, 87: scope the completeness claim, name the regex blind spot.
- [walkthroughs-02b/walkthrough-Phase-10.md](./walkthroughs-02b/walkthrough-Phase-10.md)
  — the `32` in the `Output:` block and the line-166 checkbox: annotate the
  `.DS_Store` discrepancy, recommend `git ls-files`.
- [walkthroughs-02b/walkthrough-Phase-5.md](./walkthroughs-02b/walkthrough-Phase-5.md)
  — line 55: "four" → "six".
- **No source file is edited by this plan.** Phase 2 only stages and commits what
  the 02b reorg already produced; Phase 3 only observes it.
- [tests/architecture/layering.test.js](tests/architecture/layering.test.js) —
  not modified here. Holds Rules 1–6; Rules 5 and 6 were added by 02b Phase 11
  and verified to fail on deliberate violations.
