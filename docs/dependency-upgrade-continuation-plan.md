# Dependency Upgrade Continuation Plan

Updated: 2026-07-13

## Handoff prompt for a new session

Copy this prompt into the new session:

> Read `AGENTS.md` and `docs/dependency-upgrade-continuation-plan.md` completely. Confirm that the repository is at or after checkpoint commit `3d9a7de` and that the worktree is clean. Implement **Phase 1 only**. Preserve all existing user changes, do not use `--force` or `--legacy-peer-deps`, run the phase verification, and stop for my manual test before committing or starting another phase. Do not upgrade to TypeScript 7.

For later phases, replace `Phase 1` in the prompt with the requested phase number.

## Objective

Finish the remaining dependency upgrades in small, reversible checkpoints without destabilizing the browser extension, Svelte 5 UI, content extraction, Markdown streaming, or AI providers.

Each phase must:

1. Start from a clean worktree and a known commit.
2. Change only the package(s) and compatibility code in that phase.
3. Avoid `npm install --force`, `--legacy-peer-deps`, and `npm audit fix --force`.
4. Pass automated verification.
5. Stop for user manual testing.
6. Be committed by the user before the next phase begins.

## Completed baseline

Checkpoint commit:

- `3d9a7de Upgrade AI SDK deps and add dynamic model discovery`

Already completed and manually verified:

- Svelte `5.56.4`.
- AI SDK `7.0.22` and model specification V4.
- `@ai-sdk/svelte` `5.0.22`.
- OpenAI, Gemini, Anthropic, Groq, Cerebras, DeepSeek, OpenAI-compatible, OpenRouter, and Ollama provider upgrades.
- Dynamic Groq and Cerebras model discovery with static fallback.
- AI SDK `system` option migrated to `instructions` at SDK boundaries.
- Old Svelte 4 `svelte-markdown` removed; current renderer is `@humanspeak/svelte-markdown` `0.8.17`.
- Node requirement set to `>=22`; current development environment used Node `24.10.0`.

Verified baseline:

- `158/158` tests passing.
- `npm run check`: zero errors and 21 pre-existing warnings.
- Chrome MV3 production build passing.
- Firefox MV2 production build passing.
- Development bundle rebuilt and manually tested across providers.

Do not redo the AI SDK migration unless a regression specifically points to it.

## Remaining outdated snapshot

Snapshot from `npm outdated --json` on 2026-07-13:

| Package | Installed | Latest | Treatment |
|---|---:|---:|---|
| `defuddle` | `0.19.0` | `0.19.1` | Safe patch; Phase 1 |
| `jsdom` | `26.0.0` | `29.1.1` | Test-only major; Phase 2 |
| `@humanspeak/svelte-markdown` | `0.8.17` | `1.7.10` | Runtime major; Phase 3 |
| `typescript` | `5.9.3` | `7.0.2` | Do not upgrade directly; Phase 4 policy |

All other direct dependencies were current within their declared ranges at the snapshot time.

## Standard verification gate

Run after every phase:

```bash
npm test
npm run check
npm run build
npm run build:firefox
git diff --check
git status --short
```

Expected baseline unless the phase intentionally adds tests:

- At least 158 tests pass.
- Svelte check has zero errors.
- The existing 21 warnings may remain, but the phase must not add new warnings.
- Both browser builds finish successfully.

If the user tests the development output, also run `npm run dev` until the initial `.output/chrome-mv3-dev` build completes, stop the watcher, reload the extension at `chrome://extensions`, then reload all test tabs.

## Phase 1 — Defuddle patch update

### Scope

Upgrade only:

```bash
npm install defuddle@0.19.1
```

Do not refactor the extraction pipeline in the same phase.

Relevant files:

- `src/lib/content/semanticPageExtractor.js`
- `src/services/contentService.js`
- `tests/summary/semanticPageExtractor.test.js`
- `tests/summary/contentService.test.js`

### Automated verification

Run focused tests first:

```bash
npx vitest run tests/summary/semanticPageExtractor.test.js tests/summary/contentService.test.js
```

Then run the standard verification gate.

### Manual test gate

Test summarization on at least:

- A normal news/article page.
- A page with a large sidebar/navigation menu.
- A page containing headings, lists, code, and links.
- A page where Defuddle returns too little content so the semantic fallback is exercised, if a known fixture/page exists.

Confirm title, extracted body, and summary are not polluted by menus or cookie banners.

### Stop condition

Stop after reporting results. Do not begin Phase 2 until the user confirms manual tests and commits.

## Phase 2 — jsdom test runtime update

### Scope

Upgrade the pinned dev dependency only:

```bash
npm install --save-dev jsdom@29.1.1
```

Node compatibility is satisfied by the project requirement (`>=22`) and the current Node 24 environment. Do not change application DOM code merely to silence a failing test until the failure is shown to be a jsdom behavior correction rather than an application regression.

Current jsdom test files include:

- `tests/summary/semanticPageExtractor.test.js`
- `tests/chat/composer/ChatUserMarkdown.test.svelte.js`
- `tests/chat/composer/ChatRichTextInput.test.svelte.js`
- `tests/chat/composer/markdownCodec.test.js`
- `tests/chat/composer/ChatMessageEditor.test.svelte.js`
- `tests/chat/composer/SkillPicker.test.svelte.js`

### Automated verification

Run all tests marked with `@vitest-environment jsdom`, then the standard verification gate.

Pay special attention to:

- DOM parsing and selector behavior.
- Input, keyboard, selection, and focus events.
- HTML serialization differences.
- Svelte component mounting and cleanup.

### Manual test gate

- Create and edit a rich-text chat message.
- Use Markdown shortcuts and plain-text `#`/`---` behavior.
- Open and use the skill picker.
- Confirm page extraction still works.

### Stop condition

Stop after reporting results. Do not begin Phase 3 until manual tests pass and the user commits.

## Phase 3 — Svelte Markdown 1.x migration

### Scope

Upgrade:

```bash
npm install @humanspeak/svelte-markdown@1.7.10
```

Its `katex` and `mermaid` peer dependencies are optional. Do not add them unless the user explicitly requests math or Mermaid rendering.

Relevant files:

- `src/components/chat/ChatUserMarkdown.svelte`
- `src/components/displays/ui/StreamingMarkdownV2.svelte`
- Custom renderers under `src/components/chat/` and `src/components/displays/ui/`
- `tests/chat/composer/ChatUserMarkdown.test.svelte.js`

### Migration constraints

- Preserve the current `source` prop flow first. Do not simultaneously adopt the new imperative `writeChunk()` streaming API.
- Preserve `buildUnsupportedHTML()` behavior so raw HTML in user messages is displayed safely instead of executed.
- Preserve custom table, link, heading, horizontal-rule, and timestamp renderers.
- Do not enable Mermaid/KaTeX or change Markdown styling in this phase.
- Add or update focused tests if renderer prop shapes changed.

### Automated verification

Run the existing Markdown component test and add coverage for any changed renderer contract. Then run the standard verification gate.

### Manual test matrix

Render both a user message and a streamed AI response containing:

- Headings and literal user-message `#` text.
- Horizontal rules and literal user-message `---` text.
- Ordered and unordered lists.
- Blockquotes.
- Inline code and fenced code blocks with highlighting.
- Tables.
- Normal external links.
- YouTube timestamp links.
- Raw HTML such as `<script>` and `<img onerror=...>`; it must not execute.
- Long streaming output.
- Vietnamese and at least one RTL language sample.

Compare the visual result with the pre-upgrade extension. Treat layout, cursor, table overflow, or syntax highlighting changes as regressions unless intentionally approved.

### Stop condition

Stop after reporting results. Do not begin Phase 4 until manual tests pass and the user commits.

## Phase 4 — TypeScript compatibility decision

### Important policy

Do **not** upgrade this Svelte project directly to TypeScript 7.

Microsoft's TypeScript 7 release notes state that Svelte and other embedded-language frameworks still depend on the older programmatic compiler API and should continue using TypeScript 6 for now. TypeScript 7.0 does not expose that stable API.

Official references:

- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/

### Recommended action

Choose one of these after checking current Svelte/WXT support in the new session:

1. **Preferred conservative choice:** keep TypeScript `5.9.3` and record TypeScript 7 as deferred.
2. **Optional bridge experiment:** upgrade only to TypeScript `6.0.3` in its own checkpoint.

For the optional bridge:

```bash
npm install --save-dev typescript@6.0.3
```

Then regenerate WXT types if needed:

```bash
npm run postinstall
```

### TypeScript 6 verification

- Inspect all new compiler diagnostics; do not hide them globally with `ignoreDeprecations` unless each deprecated option is understood and a follow-up is documented.
- Run the standard verification gate.
- Confirm `.wxt/tsconfig.json` generation and extension builds remain valid.
- Verify editor/Svelte language tooling still works before committing.

### TypeScript 7 unblock conditions

Only create a future TypeScript 7 phase when all are true:

- Svelte tooling officially supports TypeScript 7's compiler/LSP integration.
- `svelte-check`, WXT, and the Svelte Vite plugin declare compatible versions.
- A clean isolated test shows `npm run check`, Chrome build, and Firefox build passing.

## Phase 5 — Security advisory triage

The last install reported 18 npm advisories, but no forced remediation was applied.

This phase requires explicit user approval because `npm audit` sends the project's dependency graph and package metadata to npm's advisory service.

Rules:

- Ask for approval before running `npm audit` or `npm audit --omit=dev`.
- Never run `npm audit fix --force` automatically.
- Separate runtime advisories from dev-only advisories.
- Trace each advisory to its direct dependency with `npm explain <package>`.
- Prefer a direct package patch/minor update over overrides.
- Use an override only when the upstream compatibility range is verified and tests cover the affected path.
- Handle each breaking remediation as its own checkpoint.

Verification and manual testing depend on the affected package, followed by the full standard gate.

## Final closeout

After all approved phases:

```bash
npm outdated --json
npm ls --depth=0
npm test
npm run check
npm run build
npm run build:firefox
git diff --check
git status --short
```

Record:

- Final package versions.
- Test count.
- Svelte warning count.
- Chrome and Firefox build status.
- Any intentionally deferred packages and their unblock conditions.
- Manual provider, extraction, composer, and Markdown test results.

Do not combine the final closeout with unrelated refactors or new product features.

