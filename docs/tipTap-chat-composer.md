# TipTap Chat Composer — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session with none of the planning conversation's context. Start at
> Phase 1 and go in order. Each phase ends with a **Verify** step — don't move on
> until it passes. Work directly on the current branch (no new branch/worktree).
> After each phase, write a walkthrough to
> `docs/tiptap-chat-composer/walkthrough-Phase-N.md`.

## Context

The chat composer today is a controlled `<textarea>`. Two files drive it:

- [`src/components/chat/ChatComposerInput.svelte`](../src/components/chat/ChatComposerInput.svelte)
  — the presentational textarea: auto-resize clamped 24–220px, custom
  scrollbar, `pl-11 pr-14` padding to leave room for overlaid controls.
- [`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)
  — the container: renders the input plus an absolutely-positioned
  [`SkillPicker`](../src/components/chat/SkillPicker.svelte) (bottom-left) and
  Send/Stop button (bottom-right), the skill/attachment chip row, and
  [`TabMentionMenu`](../src/components/chat/TabMentionMenu.svelte). It owns:
  Enter-to-send (`handleKeydown`), `@tab` detection via the regex
  `/(?:^|\s)@([^\s@]*)$/` on `chatState.composerText`, `/skill` consumption via
  `consumeLeadingSkillCommand()`, and skill/tab selection.

Everything flows through **`chatState.composerText` (a Markdown string) as the
single source of truth**, defined in
[`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js):

- Per-tab drafts live in tab session snapshots (`activeTabId`, `writeSession()`,
  `getSession()`, `projectSessionToView()`, `tabSessions` map). A
  `perTabFeatureEnabled` flag controls whether switching browser tabs actually
  swaps the chat session — when it is **off**, `activeTabId` does not change on
  tab switch (see lines ~253, ~313).
- `canSendChat()` gates send. `notifyChatDraftChanged()` persists the draft.
- `selectChatSkill()` seeds `composerText` with a skill's `starterPrompt` **only
  if the composer is empty** (~line 131).
- `consumeLeadingSkillCommand(text)` runs on **every** input event, and when it
  finds a leading `/skill` it **mutates `composerText`** to strip the command
  and sets `selectedSkill` (~lines 138–142).
- `sendChatMessage()` snapshots skill + attachments, writes the user message,
  then clears `composerText`, `selectedSkill`, `pendingAttachments`.

**Rendering today:** user messages render as **plain text** in a bubble
(`{message.content}` with `whitespace-pre-wrap`,
[`ChatMessage.svelte:143-147`](../src/components/chat/ChatMessage.svelte#L143)).
Editing a user message drops into a **separate plain `<textarea>`** flow
(`startEditing` / `editText` / `submitEdit`,
[`ChatMessage.svelte:117-141`](../src/components/chat/ChatMessage.svelte#L117)).
Assistant messages render through
[`StreamingMarkdownV2.svelte`](../src/components/displays/ui/StreamingMarkdownV2.svelte),
which uses **`svelte-markdown`** (component-based, escapes raw HTML by default —
no `@html`), plus think-tag/timestamp/highlight processing.

We want a minimal TipTap composer that gives Claude-like Markdown input while
keeping this architecture intact: still store and send Markdown strings, never
TipTap JSON/HTML.

### Goal & scope decision (confirmed with user)

- **TipTap is the default and only user-facing composer.** No enable/disable
  setting is exposed.
- **Markdown stays the canonical composer + message format.** No TipTap JSON or
  HTML is ever stored in IndexedDB.
- **Codec:** use the official **`@tiptap/markdown`** beta behind an internal
  codec abstraction. This beta has been **verified** to round-trip the required
  fixtures (fenced code, Vietnamese Unicode) — treat it as the chosen path, but
  keep it isolated so it can be swapped without touching stores/services.
- **The edit-a-user-message box also uses TipTap, but as a *separate component*
  with its own UI** (compact, inline in the bubble). Both the composer and the
  edit box share **one rich-editor core** (extensions + codec + keyboard
  policy); only the wrapper/chrome differs.
- **User-message display reuses the existing `svelte-markdown` renderer first**
  (mirror `StreamingMarkdownV2`, stripped of think-tag/timestamp/streaming/
  highlight), rather than building a new Markdown component. Only build a
  dedicated component if reuse proves impossible.
- **Fallback:** keep the existing `ChatComposerInput` textarea as an *automatic
  emergency runtime fallback* if TipTap fails to initialize/serialize. Not
  selectable in settings; not persisted as a preference.
- **Enter is context-aware:** normal paragraph → send; inside list/blockquote/
  code block → native structural editing; Shift+Enter → hard break;
  Cmd/Ctrl+Enter → always send.
- **Dependencies:** install all TipTap packages pinned with `--save-exact`, at
  **peer-compatible** versions (do **not** assume `@tiptap/markdown` shares one
  version line with `@tiptap/core` — pin each exact, verify peer ranges). Add
  `jsdom` for tests. Do **not** add Lowlight, Mention, Table, BubbleMenu,
  FloatingMenu, Turndown, or DOMPurify.

### Explicitly excluded (V1)

Tables, task lists, embedded images/files, link editing UI, syntax
highlighting, collaboration, AI autocomplete, TipTap Mention nodes,
floating/bubble menus, raw HTML support, a composer-mode setting, and any change
to the message-graph roadmap ([`docs/chat-message-graph.md`](chat-message-graph.md)).

## Phase 1 — Markdown codec, editor schema, and keyboard policy

**Goal:** Establish dependencies, the Markdown codec, the shared editor schema,
and the keyboard-policy helper — **without** touching the live composer. No
user-visible change in this phase.

Before starting, confirm the baseline is green (`npm test`, `npm run check`) and
record it as the "before" line in the Phase 1 walkthrough. Work directly on the
current branch.

**Changes**

- Install exact-version packages: `@tiptap/core`, `@tiptap/pm`,
  `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/markdown`
  (`--save-exact`). Add `jsdom` (dev). After install, run
  `npm ls @tiptap/pm prosemirror-model prosemirror-state` and confirm **no
  duplicate** ProseMirror versions; record output.
- Add a codec module `src/lib/chat/composer/markdownCodec.js` exposing:
  - `parseMarkdown(markdown)` → ProseMirror doc/JSON.
  - `serializeMarkdown(doc)` → Markdown string.
  - `normalizeMarkdown(markdown)` → canonicalized Markdown.
  - `isMarkdownEmpty(markdown)` → boolean.
  - `@tiptap/markdown` is imported **only here**. Stores/services never see it.
- Add a shared extension factory `src/lib/chat/composer/editorExtensions.js`
  returning the locked StarterKit config: paragraph; H1–H3 only; bold/italic/
  strike; bullet + ordered lists; blockquote; inline code + plain fenced code
  block; hard break; undo/redo; placeholder. **No node may produce content that
  cannot round-trip through the codec.**
- Add a **pure** keyboard-policy helper
  `src/lib/chat/composer/keyboardPolicy.js`:
  `resolveKey({ key, shiftKey, metaKey, ctrlKey, isComposing, keyCode, blockType, menuOpen, disabled })`
  → one of `'submit' | 'editor-default' | 'hard-break' | 'ignore'`. Treat IME
  composition, `keyCode === 229`, an open suggestion menu, and `disabled` as
  non-submit states. Keep it free of any TipTap/DOM dependency so it is unit
  testable in plain Node.

**Tests** (`vitest`, jsdom env only where the codec needs `document`)

- Markdown round-trip fixtures: paragraphs + blank lines; H1–H3; bold/italic/
  strike; bullet + ordered lists; blockquotes; inline code; fenced code
  containing blank lines and Markdown metacharacters; Vietnamese Unicode;
  literal `/skill` and `@tab` text; empty and whitespace-only docs.
- Keyboard-policy tests (pure, no jsdom): normal Enter → submit; list/quote/code
  Enter → editor-default; Shift+Enter → hard-break; Cmd/Ctrl+Enter → submit
  even inside a list; IME composing / keyCode 229 → ignore; menuOpen → ignore;
  disabled → ignore.

**Verify:**
```bash
npm test
npm run check
npm run build
npm run build:firefox
```
All pass. `npm ls` shows a single ProseMirror version tree. No change to any
`.svelte` file yet.

## Phase 2 — TipTap as the default composer

**Goal:** Replace the textarea with TipTap as the default composer, preserving
all existing chat behavior, with an automatic runtime fallback.

**Changes**

- Create `src/components/chat/ChatRichTextInput.svelte` — the shared TipTap
  editor wrapper. Props:
  ```js
  { value, disabled, placeholder, autofocus,
    onchange(markdown), onsubmit(),
    onmentionchange({ open, query, range }),
    oniniterror(error) }
  ```
  Public methods (via `export function`): `focus()`, `getMarkdown()`,
  `insertMarkdown(markdown)`, `deleteRange(range)`.
  - **`deleteRange(range)`** (not `replaceRange(range, markdown)`) — mention and
    skill removal only ever delete a text range; do **not** parse Markdown to
    splice. Keep `insertMarkdown` separate for starter-prompt insertion.
  - External `value` changes update the doc **without** emitting `onchange`
    (guard against the onchange→store→value→onchange loop). Covers skill starter
    prompts, post-send clearing, follow-ups, restored drafts, and skill-command
    removal.
  - Built from the Phase 1 extension factory + codec + keyboard policy.
- Rewire [`ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte) to
  render `ChatRichTextInput` instead of `ChatComposerInput`, adapting to receive
  **Markdown strings** (`onchange`) rather than textarea DOM events. Preserve:
  `chatState.composerText`, `notifyChatDraftChanged()`, `canSendChat()`, skill
  starter prompts, post-send clearing, focus restoration, the chip row, the
  overlaid `SkillPicker` + Send/Stop button, and `TabMentionMenu`.
  - **Layout:** replicate the textarea's height clamp (grow to ~220px then
    scroll) and the `pl-11 pr-14` padding so text never runs under the overlaid
    controls.
- **`@tab`:** detect `@query` from the text block immediately before the cursor,
  emit its ProseMirror range through `onmentionchange`. On selection, call
  `deleteRange(range)` and `addTabAttachment(tab)`. Wire arrow-navigate /
  Enter-select / Escape-close so Escape does **not** submit.
- **`/skill`:** keep parsing from the canonical Markdown via
  `consumeLeadingSkillCommand()`. **Cursor hazard — handle explicitly:** when a
  skill command is consumed the store rewrites `composerText` mid-typing; the
  resulting external-value sync must place the cursor at the document end (or
  the equivalent sensible position) rather than resetting to the start. Add a
  test/manual note for this.
- **Per-tab isolation:** key/recreate the editor by the store's **active chat
  session**, i.e. `chatTabsState.activeSessionTabId`, **not** the raw browser
  tab id — so recreation only happens when the store actually swaps sessions
  (respecting `perTabFeatureEnabled`). Recreating on session change prevents
  undo history and selection leaking between chats.
- **Automatic fallback:** if TipTap construction or Markdown init throws:
  (1) preserve the last valid Markdown in `chatState.composerText`; (2) destroy
  any partial editor; (3) log **one** diagnostic warning; (4) render the
  existing `ChatComposerInput` for this runtime; (5) do not persist a
  preference; (6) retry TipTap naturally on next side-panel/extension reload. A
  post-init serialization failure triggers the same fallback and must not
  discard the last valid draft.
- Do **not** add or modify any composer-mode setting.

**Tests**

- External Markdown value does not create an `onchange` loop.
- Editor updates emit Markdown, not HTML/JSON.
- Clearing the store clears the editor.
- Starter-prompt replacement populates the editor.
- Mention-range detection + `deleteRange` removal (pure range logic where
  feasible; editor-integration parts may move to manual — see note).
- Slash-skill command removal keeps the cursor at end, no loop.
- Runtime fallback after simulated init failure renders the textarea **and**
  preserves the last valid Markdown draft.
- Draft A and Draft B stay separate across session changes; recreating the
  editor prevents cross-session undo.
- **jsdom note:** TipTap/ProseMirror selection & contenteditable behavior is
  unreliable in jsdom. Keep codec + policy + range math as pure/unit tests;
  push anything needing a real editor view into the **Manual verification**
  list rather than writing brittle jsdom tests.

**Manual verification**

- Type every supported Markdown shortcut; confirm rich blocks appear.
- Send a formatted message; inspect the stored `content` — it must be Markdown.
- Select a skill and attach multiple tabs.
- Switch browser tabs with unsent drafts, then undo — content never crosses
  sessions.
- Vietnamese Telex/VNI composition + Enter behaves correctly (no premature
  send, no dropped composition).
- Stop an active generation from the composer button.
- Force an init failure → textarea appears with the current draft intact;
  reload → TipTap is attempted again.

**Verify:**
```bash
npm test
npm run check
npm run build
npm run build:firefox
```

## Phase 3 — User-message display + inline edit + compact toolbar

**Goal:** Complete the after-send experience and give the edit box the same rich
input, plus discoverable formatting controls.

**Changes**

- **User-message render (reuse first):** render sent user messages through the
  existing `svelte-markdown` path. Prefer reusing
  [`StreamingMarkdownV2`](../src/components/displays/ui/StreamingMarkdownV2.svelte)
  configured with cursor/highlight/think-tag/timestamp **disabled**; only if a
  prop combination can't cleanly disable those, extract a thin
  `ChatUserMarkdown.svelte` that wraps the same `svelte-markdown` component. It
  must: render the supported composer schema; not interpret raw HTML; render
  external links with `target="_blank" rel="noopener noreferrer"`; fall back to
  plain text if rendering throws. Style for the narrow right-aligned user bubble
  (`max-w-[85%]`, `rounded-br-md`) in both light and dark themes.
- **Edit box → separate TipTap component:** replace the plain `<textarea>` in
  [`ChatMessage.svelte`](../src/components/chat/ChatMessage.svelte#L117)
  (`startEditing`/`editText`/`submitEdit`) with a new
  `src/components/chat/ChatMessageEditor.svelte` that reuses the **same
  rich-editor core** (extension factory + codec + keyboard policy from Phase 1)
  but with its own compact inline UI and Save/Cancel controls. `submitEdit`
  still calls `editChatMessage(message.id, markdown)` with a Markdown string.
- **Compact `Aa` toolbar** in the composer popover: Bold, Italic, Inline code,
  Bullet list, Ordered list, Clear formatting. Hidden while
  generation disables the composer. Toolbar commands preserve focus + selection
  and never submit. Add accessible labels, active states, keyboard focus,
  `role="textbox"`, `aria-multiline="true"`.

**Tests**

- Supported user Markdown renders structurally (headings/lists/quote/code).
- Raw HTML and event-handler attributes are **not** interpreted/executed.
- External links get safe `target`/`rel`.
- Toolbar commands change the Markdown output; toolbar interaction neither
  submits nor loses selection.
- Plain-text messages look unchanged.
- Render failure falls back to plain text.
- Edit box round-trips an edited message as Markdown via `editChatMessage`.

**Manual verification**

- Composer formatting matches the sent bubble.
- Light + dark themes, narrow side-panel widths.
- Keyboard-only toolbar use; screen-reader labels.
- Import a conversation containing suspicious HTML → stays non-executable
  (`svelte-markdown` escapes it).
- Edit a message, save, confirm stored content is Markdown.

**Verify:**
```bash
npm test
npm run check
npm run build
npm run build:firefox
```

## Phase 4 — Cross-browser hardening + rollout verification

**Goal:** Validate production readiness and prevent extension-specific
regressions.

**Changes**

- Fix browser-specific selection, composition, focus, and virtual-keyboard
  issues found in the matrix below.
- Ensure editor destruction removes all listeners and TipTap instances (no leak
  across session recreation).
- Ensure external-value sync does **not** reset the cursor during ordinary
  typing (regression-guard the Phase 2 skill-consumption fix).
- **Bundle budget:** measure Chrome and Firefox production bundle output before
  vs after TipTap; record the delta in the walkthrough. If the added weight
  exceeds **~200 KB gzipped** for the side-panel entry, stop and flag for a
  decision before shipping (tree-shaking / lazy-load review) rather than
  silently accepting it.
- Confirm no duplicate TipTap/ProseMirror versions in the dependency tree.
- Keep the textarea fallback internal/automatic. Remove temporary diagnostics
  except the single init/serialization fallback warning.

**Browser matrix** — Chrome side panel; Firefox desktop sidebar/side panel; Edge
if available; Firefox Android where supported. For each: Markdown input rules;
context-aware Enter; IME composition; paste plain + multiline Markdown; `/skill`;
`@tab`; per-tab drafts; undo/redo; toolbar; send/stop/clear/reopen; automatic
fallback.

**Verify:**
```bash
npm test
npm run check
npm run build
npm run build:firefox
```
Plus the walkthrough records the bundle delta and a per-browser pass/fail table.

## Out of scope (V1)

- Any composer-mode setting or user-facing toggle.
- Tables, task lists, images/file embeds, link-editing UI, syntax highlighting,
  TipTap Mention nodes, bubble/floating menus, raw HTML support.
- Storing TipTap JSON or HTML anywhere.
- Changes to the message-graph roadmap
  ([`docs/chat-message-graph.md`](chat-message-graph.md)) — do not combine.
- Replacing the `svelte-markdown`/`marked` renderers used elsewhere (archive,
  summaries).

## Final verification checklist

- [ ] TipTap is the composer in normal operation, with no mode setting.
- [ ] Markdown is the only value sent to the model or persisted as message
      content; no TipTap JSON/HTML in chat records.
- [ ] `/skill`, `@tab`, per-tab drafts, streaming stop, and keyboard submission
      work with no regression.
- [ ] Skill-command consumption does not jump the cursor mid-typing.
- [ ] Sent user Markdown renders safely (no executable imported HTML) via the
      reused `svelte-markdown` path.
- [ ] Edit-a-message uses the shared TipTap core in a separate compact
      component; saves Markdown via `editChatMessage`.
- [ ] Automatic textarea fallback preserves the last valid draft and retries
      TipTap on reload.
- [ ] No editor state leaks between chat sessions.
- [ ] Single ProseMirror version; recorded bundle delta within budget.
- [ ] `npm test`, `npm run check`, `npm run build`, `npm run build:firefox` all
      pass.
- [ ] Each phase has a `docs/tiptap-chat-composer/walkthrough-Phase-N.md` with
      commands, automated results, manual evidence, known limitations, and (P4)
      bundle observations.
- [ ] **If the `@tiptap/markdown` beta fails a locked round-trip fixture during
      implementation, stop that phase and document the blocker — never silently
      store HTML or TipTap JSON.**

## Notable files

**Create**
- `src/lib/chat/composer/markdownCodec.js` — sole importer of `@tiptap/markdown`.
- `src/lib/chat/composer/editorExtensions.js` — shared StarterKit config.
- `src/lib/chat/composer/keyboardPolicy.js` — pure Enter/IME/menu decision.
- `src/components/chat/ChatRichTextInput.svelte` — shared TipTap composer.
- `src/components/chat/ChatMessageEditor.svelte` — separate TipTap edit box
  reusing the same core.
- `src/components/chat/ChatUserMarkdown.svelte` — *only if* `StreamingMarkdownV2`
  can't be cleanly reused for user bubbles.
- `docs/tiptap-chat-composer/walkthrough-Phase-{1..4}.md`.

**Modify**
- [`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)
  — render TipTap, adapt to Markdown-string events, keep chips/overlays/mention
  menu, add fallback + toolbar.
- [`src/components/chat/ChatMessage.svelte`](../src/components/chat/ChatMessage.svelte)
  — user bubble → Markdown render; edit textarea → `ChatMessageEditor`.
- `package.json` — pinned TipTap deps + `jsdom`.

**Reuse (do not modify)**
- [`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js) —
  `composerText`, `canSendChat()`, `notifyChatDraftChanged()`,
  `consumeLeadingSkillCommand()`, `selectChatSkill()`, `addTabAttachment()`,
  `editChatMessage()`, session/draft machinery (`activeSessionTabId`).
- [`src/components/displays/ui/StreamingMarkdownV2.svelte`](../src/components/displays/ui/StreamingMarkdownV2.svelte)
  — `svelte-markdown` renderer to reuse for the user bubble.
- [`SkillPicker.svelte`](../src/components/chat/SkillPicker.svelte),
  [`TabMentionMenu.svelte`](../src/components/chat/TabMentionMenu.svelte),
  [`ChatSkillChip.svelte`](../src/components/chat/ChatSkillChip.svelte),
  [`ChatSourceChip.svelte`](../src/components/chat/ChatSourceChip.svelte),
  [`ChatComposerInput.svelte`](../src/components/chat/ChatComposerInput.svelte)
  (kept as the automatic fallback only).
