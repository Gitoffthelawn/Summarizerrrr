# Walkthrough - Phase 3: Svelte Markdown 1.x migration

Phase 3 of `dependency-upgrade-continuation-plan.md` upgraded
`@humanspeak/svelte-markdown` from `0.8.17` to `1.7.10`. The existing
source-prop streaming model and custom renderers were retained; a narrowly
scoped sanitizer compatibility rule preserves locally generated timestamp links.

## Changes Made

### 1. Markdown runtime

#### [package.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/package.json)

- Upgraded `@humanspeak/svelte-markdown` to the 1.x runtime.

#### [package-lock.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/package-lock.json)

- Resolved the Markdown 1.7.10 dependency tree.

### 2. Streaming Markdown compatibility

#### [StreamingMarkdownV2.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/displays/ui/StreamingMarkdownV2.svelte)

- Retained prop-driven `source` rendering and enabled the package's prop-based streaming mode; no imperative `writeChunk()` API was adopted.
- Preserved the custom table and timestamp-link renderers.
- Restored only the internal `timestamp:` URL protocol after the 1.x default sanitizer blocked it; all other URLs continue through the library's default allowlist.

### 3. Renderer regression coverage

#### [StreamingMarkdownV2.test.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/displays/StreamingMarkdownV2.test.svelte.js)

- Added coverage for the custom table wrapper, timestamp links, and raw HTML sanitization in streamed output.

## Verification Results

### 1. Focused Markdown tests

```sh
npx vitest run tests/chat/composer/ChatUserMarkdown.test.svelte.js tests/displays/StreamingMarkdownV2.test.svelte.js
```

Output:

```text
Test Files  2 passed (2)
Tests  8 passed (8)
```

### 2. Standard verification gate

```sh
npm test
npm run check
npm run build
npm run build:firefox
git diff --check
```

Output:

```text
npm test: 28 test files and 160 tests passed
npm run check: 0 errors and 21 existing warnings
npm run build: Chrome MV3 production build completed
npm run build:firefox: Firefox MV2 production build completed
git diff --check: no whitespace errors
```

The existing Svelte accessibility/CSS diagnostics, Rollup chunk-size warnings,
and Firefox data-collection notice remain. No Mermaid or KaTeX dependency was
added, and Markdown styling was not changed.

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] Markdown runtime resolves to `@humanspeak/svelte-markdown@1.7.10`.
- [x] User-message renderer retains literal headings/thematic breaks and safe raw HTML handling.
- [x] Streamed renderer retains table and timestamp custom renderers.
- [x] Streamed raw HTML does not render a script or event-handler attribute.
- [x] Full test suite passes: 160/160.
- [x] Svelte diagnostics have zero errors and retain the 21-warning baseline.
- [x] Chrome MV3 and Firefox MV2 production builds pass.

### Still-Required Manual Verification (To Be Done by User)

- [ ] Render both a user message and a streamed response with headings and literal user-message `#` text.
- [ ] Verify horizontal rules and literal user-message `---` text.
- [ ] Verify ordered/unordered lists, blockquotes, inline code, and highlighted fenced code.
- [ ] Verify tables, normal external links, and YouTube timestamp links.
- [ ] Verify raw `<script>` and `<img onerror=...>` content cannot execute.
- [ ] Verify a long streamed response plus Vietnamese and an RTL-language sample; compare layout, cursor, table overflow, and syntax highlighting to the prior extension.

## Known Follow-ups

- Do not start Phase 4 until the manual checks above pass and the user approves the next phase.
