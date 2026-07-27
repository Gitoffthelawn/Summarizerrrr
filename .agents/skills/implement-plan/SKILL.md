---
name: implement-plan
description: Execute an ENTIRE phased implementation plan end to end — one subagent per phase (each writing its own walkthrough), then a single fresh-context reviewer subagent reviewing the whole result. Use when the user asks to implement/run/execute a whole plan or all its phases ("implement docs/foo.md", "chạy hết plan", "thực thi plan này", "làm hết các phase", "run the whole plan"). For a SINGLE named phase use implement-phase instead.
---

# Implement a Whole Plan

You orchestrate; you don't write feature code directly. Use `invoke_subagent` to spawn one subagent per phase (clean context for each), then one reviewer subagent that never saw the implementation — an agent that watched itself work will confirm its own work.

For a single named phase → use `implement-phase` instead.

## Before starting

Resolve the plan, list its phases in order, and skip any that already has a walkthrough. Resolve the walkthrough dir once and pass it to every subagent so they all write to the same place.

On `main`/`master`/`staging`, say so and ask first. Sync with the integration branch now if needed (ask; `merge` by default), then record `BASE_SHA = git rev-parse HEAD` (or `git stash create` if uncommitted working changes exist). After that, nothing may move HEAD or the reviewer's diff is wrong.

## Phases

One at a time, in order, never parallel: call `invoke_subagent` with `Subagents: [{ TypeName: "self", Model: "pro", Role: "Phase <N> Implementer", Prompt: "..." }]`.

Each prompt stands alone and must specify:
- Repo root and plan path.
- **One** phase number N.
- The walkthrough directory.
- Instruction to read and follow `.agents/skills/implement-phase/SKILL.md` for phase N.
- Strict prohibition against implementing other phases, committing, or moving HEAD.

Have the subagent return PASS/FAIL, the list of files it modified, and the walkthrough path.

If a phase fails, encounters a blocker, or doesn't generate a walkthrough file → stop and ask the user. Otherwise collect its modified file list and proceed to the next phase without interrupting in between.

## Review

Once every phase passes: call `invoke_subagent` with `Subagents: [{ TypeName: "self", Model: "pro", Role: "Plan Reviewer", Prompt: "..." }]`.

The reviewer prompt must be read-only and contain raw material only:
- Plan path and walkthrough paths.
- `git diff <BASE_SHA> -- <collected files>`, plus the full content of any new untracked files.
- No implementation narrative or assurances that "verification already passed".

Ask the reviewer to check for:
- Phases done partially or off-spec.
- Real bugs with a failure scenario.
- Walkthroughs claiming verification that the diff does not support.
- Scope creep.
- Re-running the plan's verification steps and reporting findings with `file:line`.

## Then stop

Report phases + walkthrough paths + reviewer verdict to the user. Fix nothing, commit nothing — ask what the user wants fixed or executed next.
