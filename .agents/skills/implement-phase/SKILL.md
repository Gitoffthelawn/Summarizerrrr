---
name: implement-phase
description: Implement a single phase from a phased implementation plan in the current repo, then write a walkthrough (with verification) to docs/<plan-name>/walkthrough-Phase-N.md. Use when the user mentions a plan file or plan name and asks to implement, build, do, complete, or continue a specific phase (e.g. "implement phase 3", "do phase 4.1", "next phase"). Front-load keywords: phase, plan, walkthrough, implement phase, verify.
---

# Implement a Plan Phase + Write its Walkthrough

Implement exactly the requested phase of a phased plan, run the verify steps that
phase specifies, then record it in a walkthrough under `docs/`.

Never implement more than that phase — boundaries are deliberate, and a later
phase may replace this one's scaffolding. Never write a walkthrough for something
you didn't actually run: no invented commands, no idealized output. A failing
check gets fixed before the walkthrough, or recorded honestly as failing.
Anything you can't run yourself (browser flows, real OAuth, prod deploys) goes
under manual verification for the user.

Don't commit, push, or deploy. Don't touch the plan or an earlier walkthrough.

## Where the walkthrough goes

`docs/<dir>/walkthrough-Phase-<N>.md`, one new file. Pick `<dir>`: an existing
`docs/*/walkthrough-*.md` dir for this plan wins, whatever it's named; else the
plan's sibling dir (`docs/<x>/<x>-plan.md` → `docs/<x>/`); else the plan filename
stem. Match the casing already in that dir (`Phase` vs `PHASE`) and keep
decimals: `walkthrough-Phase-4.1.md`. "next phase" = the lowest-numbered phase
with no walkthrough yet.

## Walkthrough shape

```markdown
# Walkthrough - Phase <N>: <Phase Title from plan>

<1–3 sentences, past tense, naming the plan.>

## Changes Made

### 1. <Area>

#### [<file.ext>](file:///<abs-path-from-git-rev-parse---show-toplevel>)
- <the concrete change>

## Verification Results

### 1. <Category>
- Ran `<command>` → <real result>.  (or the command + its real output, fenced)

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] <what you verified>

### Still-Required Manual Verification (To Be Done by User)
- [ ] <what the user must do, with numbered steps>
```

Add `## Local Setup`, `## Deploy Phase <N>`, `## Production Smoke After Deploy`,
`## Rollback`, `## Known Follow-ups` only when the phase actually calls for them.
Match the heading depth of the other walkthroughs in the dir.

Then reply in under four lines: plan + phase, the headline verify result, the
walkthrough path. The walkthrough is the recap — don't repeat it in chat.
