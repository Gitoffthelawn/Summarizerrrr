# Walkthrough - Phase 2: Context Pipeline and Security Boundaries

Status date: 2026-07-10

Phase 2 of `chat-harness-implementation-plan.md` added a pure Context Pipeline that resolves source references, applies deterministic input budgets, and assembles ephemeral AI SDK messages. It has no Svelte, browser, or provider-SDK imports, allowing the behavior and injection defenses to be tested in Node.

## Changes Made

### 1. Pipeline contracts and model capabilities

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)

- Added JSDoc contracts for the independent pipeline input and returned assembly diagnostics.

#### [providerCapabilities.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/providerCapabilities.js)

- Added a provider/model capability resolver with known limits for models named by the repository and a documented 16,384-token fallback for unknown or custom models.
- Reserved output tokens before any source or history allocation.

### 2. Pure Context Pipeline

#### [sourceResolver.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/sourceResolver.js)

- Resolved source IDs through an injected repository interface.
- Added injected lazy capture for a missing active source and returned provenance, capture freshness metadata, and raw/condensed content availability.

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)

- Retained the system persona, current user request, and one-shot skill while enforcing the input budget.
- Preferred active source content over `@tab` sources, selected active raw content only when it fits, and otherwise used condensed or labeled truncated content.
- Kept `@tab` sources condensed and dropped them before active context under pressure.
- Retained recent history and removed older user/assistant pairs as whole units.

#### [sourceFormatter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/sourceFormatter.js)

- Added deterministic untrusted-source wrappers with escaped metadata and boundary-like source text.
- Added the system guardrail that documents are data rather than instructions and that omitted or truncated text must not be claimed as reviewed.

#### [contextAssembler.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextAssembler.js)

- Emitted the thin system instruction separately.
- Built model messages in the required order: synthetic conversation-source user message, chronological display history, then the expanded current user turn.
- Kept one-shot skills and new attachments ephemeral to the current model turn.

#### [index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/index.js)

- Connected resolution, capability lookup, budgeting, and assembly through `buildContextPipeline` with injected dependencies.
- Returned model messages plus input-token estimates, source inclusion/drop diagnostics, trimmed-turn counts, and warnings.

### 3. Fixtures and focused tests

#### [fixtures.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/fixtures.js)

- Added normal article, long YouTube transcript, and prompt-injection-like source fixtures.

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)

- Covered one-shot skill lifetime, immutable display history, synthetic source message role/order, source-wrapper escaping, source priority, whole-pair history trimming, fallback capabilities, and drop/truncation diagnostics.

#### [sourceResolver.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/sourceResolver.test.js)

- Covered lazy active-source capture and returned provenance.

## Verification Results

### 1. Automated test suite

```sh
npm test
```

Output:

```text
Test Files  4 passed (4)
Tests  19 passed (19)
```

### 2. Type checks

```sh
npm run check
```

Output:

```text
svelte-check found 0 errors and 20 warnings in 7 files
```

The warnings are the existing Svelte accessibility, deprecated event-directive, unused-selector, and reactive-state warnings outside the Phase 2 files.

### 3. JavaScript syntax and diff validation

```sh
git diff --check
node --check src/lib/chat/providerCapabilities.js
node --check src/lib/chat/contextPipeline/sourceFormatter.js
node --check src/lib/chat/contextPipeline/sourceResolver.js
node --check src/lib/chat/contextPipeline/contextBudgeter.js
node --check src/lib/chat/contextPipeline/contextAssembler.js
node --check src/lib/chat/contextPipeline/index.js
```

Output:

```text
All commands completed successfully with no output.
```

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] Pipeline functions run in Node without browser, Svelte, or provider SDK globals.
- [x] Identical fixture input produces deterministic model messages and diagnostics.
- [x] One-shot skill expansion is limited to the current model turn, and stored display history remains unchanged.
- [x] Source wrappers and the system guardrail identify source-controlled content as untrusted data.
- [x] Budget rules cover active-vs-`@tab` priority, whole-pair history trimming, unknown-model fallback, and source drop/truncation diagnostics.

### Still-Required Manual Verification (To Be Done by User)

- [ ] No browser UI is introduced in this phase. When Phase 5 connects the pipeline, inspect a long active-tab transcript, an `@tab` attachment, and a prompt-injection-like page to verify the UI surfaces the returned diagnostics appropriately.

## Known Follow-ups

- Phase 3 will provide the conversation/source repository implementation consumed by the resolver interface.
- Phase 4 will call this pipeline from chat send, retry, stream, and abort orchestration.
