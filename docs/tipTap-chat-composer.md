# TipTap Chat Composer — Phased Implementation Plan

## 1. Context and Outcome

The current chat composer is a controlled `<textarea>` in `ChatComposerInput.svelte`. It supports auto-resize, per-tab drafts, `/skill`, `@tab`, Enter-to-send, and IME input, but displays Markdown as plain text. Sent user messages are also rendered as plain text.

Replace it with a minimal TipTap composer that provides Claude-like Markdown input while preserving the existing chat architecture.

At completion, users can:

- Type Markdown shortcuts that become rich blocks: headings, lists, quotes, inline code, fenced code, bold, italic, and strike.
- Continue storing and sending Markdown strings—not TipTap JSON.
- Use `/skill`, `@tab`, per-tab drafts, streaming stop, and keyboard submission without regressions.
- See sent user Markdown rendered safely.
- Use TipTap as the only normal composer without an exposed setting.

### Locked decisions

- TipTap is the default and only user-facing composer.
- No rich-text enable/disable setting is added.
- Markdown remains the canonical composer and message format.
- Use the official `@tiptap/markdown` beta extension behind an internal codec abstraction.
- Install all TipTap packages at one matching exact version using `--save-exact`.
- Enter is context-aware:
  - Normal paragraph: send.
  - List, blockquote, or code block: preserve native structural editing.
  - Shift+Enter: hard break.
  - Cmd/Ctrl+Enter: always send.
- Do not store TipTap JSON or HTML in IndexedDB.
- Keep attachments and skills as structured state outside the editor.
- Retain the existing textarea component only as an automatic emergency fallback when TipTap cannot initialize. It is not selectable in settings.

### Explicitly excluded

Tables, task lists, embedded images/files, link editing, syntax highlighting, collaboration, AI autocomplete, TipTap Mention nodes, floating/bubble menus, raw HTML support, a composer-mode setting, and changes to the message-graph roadmap.

## 2. Target Design and Interfaces

### Data flow

```text
TipTap document
    │ onUpdate
    ▼
Markdown codec
    │
    ▼
chatState.composerText
    ├── per-tab draft
    ├── skill parsing
    ├── model request
    └── persisted user message
```

TipTap internal state is ephemeral. `chatState.composerText` remains the single source of truth.

### Dependencies

Production:

```text
@tiptap/core
@tiptap/pm
@tiptap/starter-kit
@tiptap/extension-placeholder
@tiptap/markdown
```

Testing:

```text
jsdom
```

Do not add Lowlight, Mention, Table, BubbleMenu, FloatingMenu, Turndown, or DOMPurify.

### Editor schema

Configure StarterKit with:

- Paragraph.
- H1–H3 only.
- Bold, italic, strike.
- Bullet and ordered lists.
- Blockquote.
- Inline code and plain fenced code block.
- Hard break.
- Undo/redo.

No extension may introduce content that cannot round-trip through the selected Markdown codec.

### `ChatRichTextInput` contract

Props:

```js
{
  value: string,
  disabled: boolean,
  placeholder: string,
  autofocus: boolean,
  onchange: (markdown: string) => void,
  onsubmit: () => void,
  onmentionchange: ({
    open: boolean,
    query: string,
    range: { from: number, to: number } | null
  }) => void,
  oniniterror: (error: Error) => void
}
```

Public methods:

```js
focus()
getMarkdown()
insertMarkdown(markdown)
replaceRange(range, markdown)
```

External `value` changes update the document without emitting `onchange`. This covers skill starter prompts, cleared messages, follow-ups, and restored drafts.

### Automatic fallback

`ChatComposer` normally renders `ChatRichTextInput`.

If TipTap construction or Markdown initialization throws:

1. Preserve the last valid Markdown string in `chatState.composerText`.
2. Destroy any partially created editor instance.
3. Log one diagnostic warning.
4. Render the existing `ChatComposerInput` for the current runtime.
5. Do not persist a fallback preference.
6. Retry TipTap naturally after the side panel or extension context is reloaded.

A serialization failure after initialization must not discard the last valid Markdown draft. It activates the same runtime fallback.

### Per-tab isolation

Key the rich editor by the active chat-session tab ID. Switching browser tabs destroys and recreates the editor with that tab’s Markdown draft. This prevents undo history and selection state from leaking between tabs.

### `@tab` and `/skill`

Do not use TipTap Mention nodes.

- Detect `@query` from the active text block immediately before the cursor.
- Return its ProseMirror range through `onmentionchange`.
- On selection, delete that range and add the tab to `pendingAttachments`.
- Enhance the mention menu so arrows navigate, Enter selects, and Escape closes without submitting.
- Continue parsing `/skill` from the canonical Markdown string.
- When a skill command is consumed, external-value synchronization updates the editor with the command removed.

### Safe user-message rendering

Create a lightweight user Markdown rendering path instead of using the assistant-oriented streaming component.

It must:

- Render the supported composer schema.
- Disable raw HTML interpretation.
- Avoid `<think>`, timestamps, streaming cursors, and automatic code highlighting.
- Render external links with `target="_blank"` and `rel="noopener noreferrer"`.
- Preserve a plain-text fallback if rendering fails.

## 3. Phased Implementation

### Phase 1 — Markdown and editor foundation

**Goal:** Establish dependencies, codec, schema, and keyboard policy without replacing the current composer.

**Changes**

- Install the exact-version TipTap packages and `jsdom`.
- Add a codec module exposing:
  - `parseMarkdown(markdown)`.
  - `serializeMarkdown(document)`.
  - `normalizeMarkdown(markdown)`.
  - `isMarkdownEmpty(markdown)`.
- Add a shared editor-extension factory with the locked StarterKit configuration.
- Add a pure keyboard-policy helper returning:
  - `submit`.
  - `editor-default`.
  - `hard-break`.
  - `ignore`.
- Treat IME composition, key code `229`, and an open suggestion menu as non-submit states.
- Isolate `@tiptap/markdown` behind the codec so it can be replaced without changing stores, services, or persisted data.

**Tests**

Add Markdown round-trip fixtures for:

- Paragraphs and blank lines.
- H1–H3.
- Bold, italic, and strike.
- Bullet and ordered lists.
- Blockquotes.
- Inline code.
- Fenced code containing blank lines and Markdown characters.
- Vietnamese Unicode.
- Literal `/skill` and `@tab` text.
- Empty and whitespace-only documents.

Add keyboard-policy tests for:

- Normal Enter submission.
- List, quote, and code-block Enter.
- Shift+Enter.
- Cmd/Ctrl+Enter.
- IME composition.
- Open mention menu.
- Disabled editor.

**Verify**

```bash
npm test
npm check
npm run build
npm run build:firefox
```

No user-visible composer behavior changes in this phase.

### Phase 2 — Default composer integration

**Goal:** Replace the textarea with TipTap as the default composer while preserving existing chat behavior.

**Changes**

- Implement `ChatRichTextInput` using the Phase 1 schema and codec.
- Render TipTap unconditionally during normal operation.
- Adapt `ChatComposer` to receive Markdown strings rather than textarea DOM events.
- Preserve:
  - `chatState.composerText`.
  - `notifyChatDraftChanged()`.
  - `canSendChat()`.
  - skill starter prompts.
  - clearing after a successful user-message write.
  - focus restoration.
- Implement context-aware Enter and the IME guard.
- Integrate cursor-relative `@tab` detection and keyboard selection.
- Preserve `/skill` consumption and selected-skill chips.
- Recreate the editor on active chat-tab changes to isolate undo history.
- Add the automatic runtime textarea fallback for initialization or serialization failure.
- Do not add or modify a user setting for composer mode.

**Tests**

Add unit/integration coverage for:

- External Markdown values do not create an `onchange` loop.
- Editor updates emit Markdown, not HTML or JSON.
- Clearing the store clears the editor.
- Starter-prompt replacement.
- Mention-range detection and replacement.
- Slash-skill command removal.
- Runtime fallback after initialization failure.
- Runtime fallback preserves the last valid Markdown draft.
- Draft A and Draft B remain separate when the active session changes.
- Recreating the editor prevents cross-tab undo.

**Manual verification**

- Type every supported Markdown shortcut.
- Send a formatted message and inspect stored `content`; it must be Markdown.
- Select a skill and attach multiple tabs.
- Switch browser tabs with unsent drafts and use undo; content must never cross tabs.
- Test Vietnamese Telex/VNI composition and Enter.
- Stop an active generation from the composer button.
- Simulate initialization failure and confirm the textarea appears with the current draft.
- Reload after fallback and confirm TipTap is attempted again automatically.

**Verify**

```bash
npm test
npm check
npm run build
npm run build:firefox
```

### Phase 3 — User Markdown display and compact toolbar

**Goal:** Complete the visual experience after sending and add discoverable formatting controls.

**Changes**

- Render user messages through the safe lightweight Markdown component.
- Style headings, lists, quotes, inline code, and fenced code for the narrow user bubble.
- Add a compact `Aa` popover containing:
  - Bold.
  - Italic.
  - Inline code.
  - Bullet list.
  - Ordered list.
  - Blockquote.
  - Clear formatting.
- Hide the toolbar while generation disables the composer.
- Preserve focus and selection when a toolbar command runs.
- Add accessible labels, active states, keyboard focus, `role="textbox"`, and `aria-multiline="true"`.

**Tests**

- Supported user Markdown renders structurally.
- Raw HTML and event-handler attributes are not interpreted.
- External links receive safe target/rel attributes.
- Toolbar commands update Markdown output.
- Toolbar interaction does not submit the message or lose selection.
- Plain-text messages remain visually unchanged.
- Rendering failure falls back to plain text.

**Manual verification**

- Compare editor formatting with the sent user bubble.
- Check light and dark themes.
- Check narrow side-panel widths.
- Verify keyboard-only toolbar use and screen-reader labels.
- Import a conversation containing suspicious HTML and confirm it remains non-executable.

**Verify**

```bash
npm test
npm check
npm run build
npm run build:firefox
```

### Phase 4 — Cross-browser hardening and rollout verification

**Goal:** Validate production readiness and prevent extension-specific regressions.

**Changes**

- Fix browser-specific selection, composition, focus, and virtual-keyboard issues discovered by the verification matrix.
- Ensure editor destruction removes listeners and TipTap instances.
- Ensure external-value synchronization does not reset the cursor during ordinary typing.
- Measure Chrome and Firefox production bundle output before and after TipTap; record the delta in the walkthrough.
- Confirm no duplicate TipTap or ProseMirror versions enter the dependency tree.
- Keep the textarea fallback internal and automatic.
- Remove temporary diagnostics except the single initialization/serialization fallback warning.

**Browser matrix**

- Chrome side panel.
- Firefox desktop sidebar/side panel.
- Edge if available.
- Firefox Android where the existing extension workflow is supported.

For each browser verify:

- Markdown input rules.
- Context-aware Enter.
- IME composition.
- Paste plain text and multiline Markdown.
- `/skill`.
- `@tab`.
- Per-tab drafts.
- Undo/redo.
- Toolbar.
- Send, stop, clear, and reopen.
- Automatic fallback behavior.

**Final acceptance**

- TipTap is the composer in normal operation with no mode setting.
- Markdown is the only value sent to the model or persisted as message content.
- No TipTap JSON or HTML is stored in chat records.
- Existing textarea code remains available only for automatic runtime recovery.
- Existing chat, summary, archive, import/export, and provider tests pass.
- Production builds succeed for Chrome and Firefox.
- No editor state leaks between browser-tab chat sessions.
- User Markdown cannot execute imported raw HTML.
- Each phase has a walkthrough containing commands, automated results, manual evidence, known limitations, and bundle observations.

## 4. Implementation Session Guidance

- Implement one phase per session using the `implement-phase` workflow.
- Do not combine this work with the message-graph roadmap.
- Preserve unrelated user changes in the working tree.
- After each phase, write `docs/chat-tiptap-composer/walkthrough-Phase-N.md`.
- If the TipTap Markdown beta fails a locked round-trip fixture, stop that phase and document the blocker; do not silently store HTML or TipTap JSON.
