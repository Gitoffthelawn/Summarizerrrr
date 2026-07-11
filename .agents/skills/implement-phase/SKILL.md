---
name: implement-phase
description: "Implement a single phase from a phased implementation plan in the current repo, then write a walkthrough (with verification) to docs/<plan-name>/walkthrough-Phase-N.md. Use when the user mentions a plan file or plan name and asks to implement, build, do, complete, or continue a specific phase (e.g. 'implement phase 3', 'do phase 4.1', 'next phase'). Front-load keywords: phase, plan, walkthrough, implement phase, verify."
---

# Implement a Plan Phase + Write its Walkthrough

This skill is **project-agnostic**: it works in any repo that uses **phased
implementation plans**. A plan is broken into numbered phases that are
independently codeable, and every completed phase is documented by a
**walkthrough** file under `docs/`. Your job, when this skill triggers, is to:
(1) locate the plan and the requested phase, (2) implement exactly that phase's
changes, (3) run the real verification commands *for this repo*, and (4) write
the walkthrough with those real verification results.

Never implement more than the requested phase. Never write a walkthrough for
changes you did not actually make and verify.

## Step 0 — Orient yourself in this repo (do this first)

Because the skill must run in any project, start by discovering the repo's
shape instead of assuming it. Gather, with a few quick tool calls:

1. **Repo root** — `git rev-parse --show-toplevel`. Use this absolute path for
   the `file:///` links in the walkthrough. Never hardcode a path.
2. **Project conventions** — read `CLAUDE.md` / `CLAUDE.local.md` /
   `AGENTS.md` / `README` at the root if present. These usually state the
   build/lint/type-check/test commands, the package manager, and the layout
   (monorepo workspaces, subprojects, etc.). Treat them as authoritative.
3. **Verify commands** — derive them from the project, do not invent them:
   - Read the root `package.json` `scripts` (and per-workspace `package.json`
     in a monorepo) for `build` / `lint` / `type-check` / `check` / `test`.
   - Note the package manager from the lockfile / `packageManager` field
     (`pnpm-lock.yaml` → pnpm, `package-lock.json` → npm, `yarn.lock` → yarn)
     and any task runner (Turborepo, Nx, Make, etc.).
   - For non-JS stacks, look for the equivalent (`Cargo.toml`, `go.mod`,
     `pyproject.toml`/`Makefile`, `*.csproj`, `wrangler.toml`, etc.).
   - If `CLAUDE.md` explicitly says something like "there is no test runner",
     respect that — do not fabricate a test command.

Hold onto the repo root, the verify commands, and the layout; you will reuse
them in steps 3–5.

## Inputs to collect

You need three things before writing any code. Use the `question` tool when
any of them is ambiguous.

1. **Plan** — a path or short name. Resolve it per "Locating the plan" below.
2. **Phase number** — an integer (`1`, `2`, …), a decimal sub-phase (`4.1`),
   or the word "next" (meaning the lowest-numbered phase that has no
   walkthrough yet).
3. **Walkthrough directory** — `docs/<dir>/`. Resolve per "Locating the
   walkthrough directory" below. Ask the user only if it cannot be derived
   and no existing dir is found.

If the user gives both plan and phase, proceed without asking. Only ask when
genuinely ambiguous.

## Locating the plan

Search in this order. First match wins. Use Glob + Grep against the current
repo — do not rely on remembered filenames from any other project.

1. An explicit path the user gave (e.g. `docs/foo/bar-plan.md`).
2. Root-level `*.md` files whose title or body contains a phase heading
   (`## Phase` / `### Phase`). Find them with
   `rg -l '^#+\s*Phase\s+\d' *.md`.
3. `docs/**/*plan*.md` and `docs/**/*phase*.md`, and any `docs/**/*.md`
   containing a `## Phase` heading.

If the short name the user gave matches part of a filename, prefer that match.
If two candidates both look plausible, list them with the `question` tool and
let the user pick. Do not guess.

## Locating the walkthrough directory

Each plan has a walkthrough directory under `docs/`. Resolve in this order:

1. **Existing dir**: Glob `docs/*/walkthrough-*.md` and find the directory
   that already contains walkthroughs for this plan. Reuse it. The dir name
   does not have to match the plan filename — reuse whatever exists.
2. **Sibling dir for `docs/<x>/<x>-plan.md`**: if the plan lives at
   `docs/<seg>/<seg>-plan.md`, the walkthrough dir is `docs/<seg>/`.
3. **Derived from a root-level `<Name>.md`**: use the plan filename stem as
   the dir name (e.g. `My-Feature.md` → `docs/My-Feature/`).

If step 3 produces a name and you are unsure whether the user wants a shorter
form, ask once with the `question` tool, offering the derived name and a
short-form alternative. Do not silently invent a new short name.

## Filename casing

Match the casing already used in the chosen walkthrough directory:

- `walkthrough-Phase-1.md` (title-case `Phase`).
- `walkthrough-PHASE-1.md` (upper-case `PHASE`).

For sub-phases, keep the decimal in the stem: `walkthrough-Phase-4.1.md`.

For a brand-new directory (no existing walkthroughs), default to title-case
`walkthrough-Phase-N.md`.

## Phase heading patterns to match

Plans do not agree on heading syntax. Match any of these with a single regex
search (`rg -n '^#+\s*Phase\s+<N>\b'`):

- `### Phase 1 — ...` (em-dash)
- `## Phase 1 — ...` (em-dash)
- `## Phase 1: ...` (colon)
- `## Phase 1 - ...` (hyphen)

The phase body extends from its heading until the next `## Phase` / `### Phase`
heading or end of document. Read that whole span — it contains **Goal**,
**Changes**, **Test**/**verification**, and **Done when** subsections that you
must satisfy.

## Workflow

Follow these steps in order.

### 1. Confirm scope

Before editing anything, restate to the user in one short line: which plan,
which phase, and which walkthrough dir you are targeting. If the user already
gave all three explicitly, skip the restatement and just start.

### 2. Read the phase thoroughly

Read the full phase section plus any plan-level context it depends on (shared
types, a "Behavior Spec to Preserve" section, prior phases' walkthroughs if the
current phase references them). Identify:

- Every file the phase says to create or edit.
- Every env var, binding, migration, or external resource it requires.
- The exact "Test" / "verification" / "Done when" criteria.

### 3. Track the work

Create a todo list with `todowrite` — one item per distinct change the phase
requires, plus one item each for "run verification" and "write walkthrough".
Keep exactly one item `in_progress` at a time. This phase's changes are the
only items; do not pull in scope from other phases.

### 4. Implement

Edit only the files the phase lists (plus their direct imports if the phase
requires a new symbol). Follow the conventions you found in step 0 and in the
surrounding file:

- Match the existing code's style (formatter config, quote/semicolon/indent
  rules, naming, framework idioms). When in doubt, mimic the neighboring file
  rather than imposing a different convention.
- In a **monorepo**, scope changes to the workspace(s) the phase names, and
  use the task runner's filter when verifying (e.g. a `--filter` / `--scope`
  flag) so you only build what you touched.
- Do not commit. Do not deploy unless the phase explicitly says "deploy" and
  the user has asked for it.

### 5. Run the real verification (REQUIRED)

This is the core of the walkthrough — **run the commands yourself and capture
real output**. Use the verify commands you derived in step 0; do not paste
commands you did not run, and do not paste output you did not observe.
Verification has two tiers:

**Tier A — Agent-verified (you must run these):**

- The project's type-check / lint / build commands (and per-workspace variants
  in a monorepo). Examples by stack — use whatever this repo actually has:
  - JS/TS: `pnpm type-check`, `pnpm lint`, `pnpm build` (or the npm/yarn
    equivalent; add the Turbo/Nx `--filter` for one workspace). Use
    `node --check <file>` for plain JS files.
  - Rust: `cargo check`, `cargo clippy`, `cargo test`.
  - Go: `go build ./...`, `go vet ./...`, `go test ./...`.
  - Python: `ruff check`, `mypy`, `pytest`.
  - Cloudflare Workers: `wrangler deploy --dry-run`.
- Any phase-specific probe or test script the plan references.
- `curl` smoke requests against a locally running dev server when the phase
  adds an HTTP endpoint. Start the server, run the curl, record the real
  response, then stop the server.
- DB migration dry-runs when the phase adds migrations.

If this repo genuinely has no automated check for a change (e.g. `CLAUDE.md`
says there's no test runner and the change is not type-checkable), say so
plainly rather than inventing a command.

**Tier B — User-verified (you cannot run these, list them as TODO):**

- Flows requiring a browser, real OAuth, or a logged-in session.
- Production deploys and post-deploy production smoke (real access tokens).
- Anything requiring secrets you do not have.

If a Tier A check fails, **stop and fix it before writing the walkthrough**.
Do not write "passes" for something that failed. If it cannot be made to pass,
tell the user and record the failure honestly in the walkthrough.

### 6. Write the walkthrough

Create `docs/<walkthrough-dir>/walkthrough-Phase-<N>.md` (or `PHASE-<N>.md` to
match existing casing). Use this structure:

```markdown
# Walkthrough - Phase <N>: <Phase Title from plan>

<1–3 sentence summary of what this phase accomplished. Past tense,
factual. Reference the plan name in the first sentence.>

## Changes Made

### 1. <Area, e.g. "Shared Module" / "API Route">

#### [<file.ext>](file:///<abs-path-to-repo-file>)
- <bullet describing the concrete change>
- <bullet describing another change>

### 2. <Next area>
...

## Verification Results

### 1. <Category, e.g. "Type Checks & Compilation">
- Ran `<the command you actually ran>` → <real result>.

### 2. <Category, e.g. "Local Smoke">
<the exact command(s) you ran in a fenced block>
<the real output you observed in a fenced block>

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] <thing you verified>

### Still-Required Manual Verification (To Be Done by User)
- [ ] <Tier B item the user must do, with numbered steps>
```

Add any of these sections **only when the phase actually calls for them** —
do not invent them:

- **`## Local Setup`** — if the phase needs a local dev server / services.
- **`## Run the Probe`** — if a probe script exists for this phase.
- **`## Deploy Phase <N>`** — if the phase ends in a deploy step.
- **`## Production Smoke After Deploy`** — Tier B; show the curl shape.
- **`## Rollback`** — for any phase that changes production traffic.
- **`## Known Follow-ups`** — for hand-offs to later phases.

### Formatting rules for the walkthrough

- **File links** are absolute `file:///` URLs built from the repo root you got
  in step 0 (`git rev-parse --show-toplevel`), e.g.
  `file:///<repo-root>/<path>`. Never hardcode another project's path.
- **Commands** go in fenced blocks with the shell actually used (`sh`).
- **Expected output** goes in a separate fenced block immediately under the
  command, labelled `Expected:` or `Output:`. Use the real output you got,
  not an idealized version.
- **Tables** for config/env values, plan limits, etc.
- **Status date** line (`Status date: YYYY-MM-DD`) under the title is
  optional; include it only if the plan file has one.
- Keep heading depth consistent (`##` for top sections, `###` for files,
  `####` for sub-areas) and match any existing walkthroughs in the dir so the
  docs render uniformly.

## Anti-patterns (do not do these)

- Do not implement changes from a different phase to "finish the story".
- Phase boundaries are deliberate; later phases may replace scaffolding from
  earlier ones.
- Do not write the walkthrough before verifying. The "Verification Results"
  section must reflect commands you actually ran.
- Do not paste generic or idealized command output. If you did not run it,
  it goes under "Still-Required Manual Verification" as a Tier B item.
- Do not assume another project's commands or paths. Always derive them from
  the repo you are in (step 0).
- Do not commit or push. The user commits when they choose.
- Do not deploy to production unless the phase's "Done when" requires a
  production deploy AND the user explicitly approved it.
- Do not edit a plan file or a prior phase's walkthrough. You only create one
  new file: this phase's walkthrough.
- Do not add the walkthrough to `CLAUDE.md`, `README`, or any index unless an
  index already exists and lists walkthroughs.

## When you are done

Reply to the user with a short summary (under 4 lines):

1. Which phase was implemented (plan + phase number).
2. The one verification command + its pass/fail headline.
3. The walkthrough file path you wrote.

Do not recap every change in chat — that is what the walkthrough is for.
