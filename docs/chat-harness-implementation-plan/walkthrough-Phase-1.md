# Walkthrough - Phase 1: Compatibility-Safe AI Request Layer

Status date: 2026-07-10

Phase 1 of `chat-harness-implementation-plan.md` added a compatibility-safe AI request layer without requiring existing summary callers to migrate. It establishes focused Vitest coverage and transports structured chat messages through the direct and Ollama proxy paths.

## Changes Made

### 1. Request contracts and adapter compatibility

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)

- Added the shared `GenerationRequest` JSDoc contract for JavaScript-first chat work.

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)

- Added `normalizeGenerationRequest`, `generateContentRequest`, `generateContentStreamRequest`, and `generateContentStreamEnhancedRequest`.
- Kept the three existing positional exports as prompt-based compatibility wrappers.
- Validated that exactly one of `prompt` or `messages` is supplied, and threaded message input through retries, fallbacks, direct generation, streaming, enhanced streaming, provider options, tools, and abort signals.

### 2. Ollama proxy message transport

#### [ollamaProxyModel.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/ollamaProxyModel.js)

- Sent structured-clone-safe `messages` alongside the legacy `userPrompt` field.
- Preserved the v1 one-complete-chunk proxy stream behavior.
- Raced runtime requests against `AbortSignal` because browser runtime messages cannot clone an abort signal.

#### [background.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background.js)

- Preserved message role/order in `OLLAMA_API_REQUEST` handling.
- Passed either `messages` or legacy `prompt` to the final Ollama provider boundary, retaining request generation options, tools, and provider options.

### 3. Test infrastructure and focused coverage

#### [package.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/package.json)

- Added `test` and `test:watch` scripts plus `vitest` and `fake-indexeddb` development dependencies.

#### [vitest.config.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/vitest.config.js)

- Configured the existing `@/` alias and a Node test environment.

#### [vitest.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/setup/vitest.js)

- Registered `fake-indexeddb` for the upcoming IndexedDB repository tests.

#### [aiSdkAdapter.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/aiSdkAdapter.test.js)

- Covered prompt compatibility, message order, invalid mixed input, Gemini fallback, direct/proxy abort handling, direct/proxy streaming, enhanced accumulation, and Firefox-mobile flush annotations.

#### [ollamaProxyModel.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/ollamaProxyModel.test.js)

- Covered legacy prompt and structured message payloads, fake streaming, and local proxy abort behavior.

## Verification Results

### 1. Automated test suite

```sh
npm test
```

Output:

```text
Test Files  2 passed (2)
Tests  10 passed (10)
```

### 2. Type checks

```sh
npm run check
```

Output:

```text
svelte-check found 0 errors and 20 warnings in 7 files
```

The warnings are pre-existing Svelte accessibility, deprecated event-directive, unused-selector, and reactive-state warnings outside this phase's files.

### 3. Production builds

```sh
npm run build
npm run build:firefox
```

Output:

```text
✔ Finished in 14.3 s
✔ Finished in 12.6 s
```

Both builds completed successfully. They retain the existing Svelte warnings and Rollup chunk-size warnings.

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] Positional prompt callers still create the same direct AI SDK configuration.
- [x] Direct and proxy paths preserve structured message order and content.
- [x] Mixed `prompt` and `messages` input fails before a provider call.
- [x] Fallback, abort, direct streaming, proxy fake streaming, enhanced accumulation, and Firefox-mobile flush annotations are covered by 10 focused tests.
- [x] Chrome and Firefox production builds complete successfully.

### Still-Required Manual Verification (To Be Done by User)

- [ ] Load the Chrome development extension, summarize or analyze a page with Gemini, and confirm the existing one-shot result still renders.
- [ ] Repeat an existing summarize or analyze flow with an OpenAI-compatible provider configured in Settings.
- [ ] Load the Firefox development extension and repeat one existing summary flow.

## Known Follow-ups

- Phase 2 will consume `GenerationRequest.messages` in the context pipeline; no chat UI or caller migration was introduced in this phase.
- Phase 3 can use the installed `fake-indexeddb` setup for version-upgrade and transaction tests.
