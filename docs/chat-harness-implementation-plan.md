---
type: plan
status: done
---

# Chat Harness — Phased Implementation Plan

> **Status:** Proposed implementation plan; no phase has been implemented.
> **Date:** 2026-07-10
> **Revision:** v1.1 — test infrastructure made mandatory, enhanced streaming path added, and Phase 6 split into 6A/6B.
> **Design source:** [`docs/chat-harness-discussion.md`](./chat-harness-discussion.md)
> **Target:** Side-panel chat grounded in the active tab, followed by skills, persisted conversations, and `@[tabname]` multi-tab context.

---

## 1. Outcome

Turn the side panel into a conversation-first assistant while preserving the current summarization flows during rollout.

At the end of this plan, a user can:

1. Open the side panel and immediately ask about the active tab.
2. Start with a built-in or user-defined one-shot skill such as Summarize, Analyze, Debate, or Translate.
3. Continue the result as a normal multi-turn conversation.
4. Stop, retry, reopen, rename, archive, export, and import conversations.
5. Attach other open tabs with `@[tabname]`.
6. Use the existing AI providers through the same retry, fallback, streaming, and browser-compatibility paths used today.

The implementation must not regress the existing one-shot summary, selected-text, course, archive, or prompt-editor workflows while chat parity is being built.

---

## 2. Locked v1 Scope and Assumptions

These decisions remove ambiguity from the phases below.

### Included

- Chat is the default side-panel surface after rollout.
- The current summary UI remains reachable as a temporary legacy surface until chat reaches parity.
- Existing summaries/history remain untouched; there is no conversion of old records into conversations.
- A conversation is grounded to immutable source snapshots, not to a live `tabId`.
- The active tab is captured lazily when the first grounded message is sent if no reusable source exists.
- Active-tab raw content may be used when it fits the input budget; persisted grounding uses a condensed snapshot.
- `@tab` sources are condensed before model assembly and are lower priority than the active source.
- Firefox continues to request `<all_urls>` once. There is no per-domain permission flow.
- Skills are explicit, one-shot, and limited to one skill per user turn.
- The global persona always has higher precedence than a one-shot skill.
- Ollama proxy chat may return one complete chunk in v1; real proxy streaming is deferred.
- Conversation persistence, backup, export, and import are included.
- Conversation cloud sync is deferred; existing summary/history/library cloud sync must remain unchanged.

### Excluded

- Model-selected skills.
- Sticky skills or long-lived modes.
- Multiple simultaneous skills.
- Memory/RAG/knowledge sources beyond page snapshots.
- Tool calling and agent loops.
- Real token-by-token Ollama proxy streaming.
- Automatic conversion of old archive/history records into chat conversations.
- Conversation synchronization through Google Drive or another cloud provider.

---

## 3. Target Architecture

```text
Side-panel UI
    │
    ▼
chatStore.svelte.js
    │  user intent, transient stream state, selected skill/attachments
    ▼
chatService.js
    │
    ├── conversationRepository.js  ── IndexedDB
    │
    ├── contextPipeline/
    │     ├── sourceResolver.js
    │     ├── contextBudgeter.js
    │     ├── contextAssembler.js
    │     └── sourceFormatter.js
    │
    └── aiSdkAdapter.js
          ├── direct AI SDK providers
          └── Ollama background proxy
```

### Separation of responsibilities

- **UI components** render state and emit callbacks. They do not capture tabs, assemble prompts, call providers, or write IndexedDB directly.
- **`chatStore.svelte.js`** owns reactive UI state and delegates orchestration to services/repositories.
- **`chatService.js`** owns send/stream/abort/retry sequencing.
- **Context Pipeline** resolves references, applies the context budget, and emits ephemeral model messages.
- **Repository layer** persists display messages and immutable source snapshots.
- **AI adapter** receives one normalized request object for both old prompt-based calls and new message-based calls.

### Display messages vs. model messages

Persisted/displayed user messages contain only user-visible text plus references:

```js
{
  id,
  conversationId,
  sequence,
  role: 'user',
  content,
  createdAt,
  skillInvocation: { skillId, skillVersion } | null,
  attachmentRefs: [sourceId]
}
```

The pipeline expands those references only for the current request:

```text
system persona
synthetic user source-context message
chronological display history
current user message:
  one-shot skill instruction
  newly attached source blocks
  actual user text
```

Injected skill/source blocks are never written into the visible message body, so one-shot instructions cannot leak back through later history.

---

## 4. Data Contracts

Use JSDoc typedefs initially because the project is JavaScript-first and has `allowJs: true`. Keep contracts in one module so later TypeScript migration does not require rediscovering record shapes.

Suggested file: `src/lib/chat/contracts.js`.

### `ConversationRecord`

```js
{
  id: string,
  title: string,
  createdAt: string,
  updatedAt: string,
  archived: boolean,
  tags: string[],
  personaSnapshot: {
    content: string,
    language: string,
    tone: string | null,
    version: number
  },
  providerId: string,
  modelId: string | null,
  deleted: boolean,
  deletedAt: string | null
}
```

`personaSnapshot` makes reopened conversations deterministic even if the user later edits their global persona. A future UI may offer an explicit “use current persona” action.

### `ConversationMessageRecord`

```js
{
  id: string,
  conversationId: string,
  sequence: number,
  role: 'user' | 'assistant',
  content: string,
  createdAt: string,
  status: 'complete' | 'aborted' | 'error',
  skillInvocation: {
    skillId: string,
    skillVersion: number,
    instructionSnapshot: string
  } | null,
  attachmentRefs: string[],
  providerId: string | null,
  modelId: string | null,
  usage: object | null,
  error: object | null
}
```

Store `instructionSnapshot`, not just `skillId`, so reopening or retrying an old turn does not silently use a newer edited skill.

### `ConversationSourceRecord`

```js
{
  id: string,
  sourceKey: string,              // normalizedUrl + ':' + contentHash
  normalizedUrl: string,
  url: string,
  title: string,
  sourceType: 'webpage' | 'youtube' | 'course' | 'selectedText',
  capturedAt: string,
  contentHash: string,
  condensedContent: string,
  condensationVersion: number,
  condensationLanguage: string,
  originalLength: number,
  tabIdHint: number | null         // runtime hint only; never identity
}
```

Source records are immutable snapshots. Refreshing a page creates/reuses another `sourceKey`; it does not mutate the snapshot already referenced by an old message.

### `GenerationRequest`

```js
{
  providerId: string,
  settings: object,
  system: string | undefined,
  prompt: string | undefined,
  messages: Array | undefined,
  tools: object | undefined,
  providerOptions: object | undefined,
  abortSignal: AbortSignal | undefined
}
```

Exactly one of `prompt` or `messages` is allowed. Existing callers continue through compatibility wrappers until migrated.

---

## 5. Phase Summary and Dependencies

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | Compatibility-safe AI request layer | None |
| 2 | Context Pipeline and security boundaries | Phase 1 contracts |
| 3 | Conversation/source persistence | Contracts from Phase 1 |
| 4 | Chat orchestration and Svelte state | Phases 1–3 |
| 5 | Active-tab chat UI in the side panel | Phase 4 |
| 6A | Core skills, global persona, and custom-prompt migration | Phase 5 |
| 6B | Prompt-editor skill UI and conversation-aware Deep Dive | Phase 6A |
| 7 | Conversation archive, backup, export/import | Phases 3–5 |
| 8 | `@[tabname]` multi-tab context | Phases 2, 4, 5 |
| 9 | Provider/browser hardening and default rollout | Phases 1–8 |

Every phase must leave the repository buildable. Do not combine phases into one large unverified change.

---

## Phase 1 — Compatibility-Safe AI Request Layer

### Goal

Allow the AI layer to accept `messages[]` without changing the behavior of current summary callers.

### Primary files

- Modify `src/lib/api/aiSdkAdapter.js`.
- Modify `src/lib/api/ollamaProxyModel.js`.
- Modify the `OLLAMA_API_REQUEST` handler in `src/entrypoints/background.js`.
- Add `src/lib/chat/contracts.js`.
- Add `vitest.config.js`.
- Add a shared test setup under `tests/setup/`.
- Add focused tests under `tests/chat/`.
- Update `package.json` with Vitest scripts and required dev dependencies.

### Work

1. Establish the repository's test infrastructure before refactoring the adapter:
   - Add **Vitest** as the test runner; it aligns with the existing Vite/WXT stack.
   - Add **`fake-indexeddb`** now so Phase 3 can test version upgrades and repository transactions without revisiting test setup.
   - Add `test` (`vitest run`) and `test:watch` (`vitest`) scripts to `package.json`.
   - Configure the existing `@/` alias and a default Node test environment.
   - Add shared browser/runtime mocks only where a test needs them; do not install a DOM environment for pure pipeline/adapter tests by default.
   - Commit one passing smoke test so later phases cannot accidentally leave a configured-but-unused runner.
2. Add a normalizer that validates `GenerationRequest`:
   - Reject requests containing both `prompt` and `messages`.
   - Reject requests containing neither.
   - Preserve `system`, `providerOptions`, `abortSignal`, generation settings, and future `tools` fields.
3. Add object-based internal entry points:
   - `generateContentRequest(request)`.
   - `generateContentStreamRequest(request)`.
   - `generateContentStreamEnhancedRequest(request)` for the accumulated `{ chunk, fullText, isComplete }` stream contract.
4. Keep current positional exports as compatibility wrappers:
   - Existing `(providerId, settings, systemInstruction, userPrompt, options)` calls construct a normalized prompt request.
   - Existing `generateContentStreamEnhanced(...)` delegates to `generateContentStreamEnhancedRequest(...)`; it must not remain a prompt-only bypass around the normalized path.
   - Do not migrate all summary call sites in this phase.
5. Thread the normalized request through all three generation paths:
   - `generateContent` / `generateContentRequest`.
   - `generateContentStream` / `generateContentStreamRequest`.
   - `generateContentStreamEnhanced` / `generateContentStreamEnhancedRequest` (`src/lib/api/aiSdkAdapter.js:814` in the current tree).
   - Gemini key rotation.
   - Gemini model fallback.
   - Direct-provider generation.
   - Direct-provider streaming and smoothing.
   - Abort handling.
   - Provider options.
   - Proxy detection.
6. For direct AI SDK calls, pass `messages` when present and `prompt` otherwise.
7. Extend the Ollama proxy message to carry either `messages` or `userPrompt`:
   - Keep old `userPrompt` support for compatibility.
   - Ensure runtime messaging receives a structured-clone-safe plain object.
   - Continue returning one complete chunk from proxy `streamText` in v1.
8. Update the background handler so proxy requests preserve message role/order instead of flattening them prematurely. Flatten only at the final Ollama provider boundary if the installed provider cannot accept messages natively.
9. Remove or update stale JSDoc parameters in the adapter while touching the signatures.

### Tests

- Prompt requests produce the same AI SDK configuration as before.
- Message requests preserve role order and content.
- Prompt + messages fails before any provider call.
- Retry/fallback rebuilds the provider model without losing messages.
- Abort signals reach direct and proxy paths.
- Ollama accepts old prompt requests and new message requests.
- Streaming emits chunks for direct providers and one complete chunk for the Ollama proxy.
- Enhanced streaming preserves `messages[]`, accumulates `fullText`, emits one completion record, and retains the Firefox-mobile `flush` error annotation.

### Verification

```bash
npm test
npm run check
npm run build
npm run build:firefox
```

Manual smoke test existing summarize/analyze flows on Gemini plus one OpenAI-compatible provider. No chat UI is expected yet.

### Completion criteria

- Existing one-shot flows behave unchanged.
- A direct adapter-level `messages[]` call succeeds.
- An Ollama proxy `messages[]` call succeeds in blocking/fake-stream form.
- `generateContentStreamEnhanced` no longer bypasses normalized request handling.
- Vitest is runnable in CI/non-watch mode, and `fake-indexeddb` is ready for Phase 3.
- No caller is forced to migrate before the compatibility wrapper is removed in a later release.

---

## Phase 2 — Context Pipeline and Security Boundaries

### Goal

Create pure, testable context processing before adding UI state.

### New files

- `src/lib/chat/contextPipeline/sourceResolver.js`
- `src/lib/chat/contextPipeline/contextBudgeter.js`
- `src/lib/chat/contextPipeline/contextAssembler.js`
- `src/lib/chat/contextPipeline/sourceFormatter.js`
- `src/lib/chat/contextPipeline/index.js`
- `src/lib/chat/providerCapabilities.js`
- Tests and fixtures under `tests/chat/contextPipeline/`

### Work

1. Define a pipeline input independent of Svelte state:
   ```js
   {
     conversation,
     history,
     currentUserMessage,
     skillInvocation,
     conversationSourceRefs,
     newAttachmentRefs,
     providerId,
     modelId,
     requestedOutputTokens
   }
   ```
2. Implement `sourceResolver`:
   - Resolve stored source IDs through an injected repository interface.
   - Accept an injected capture function for missing active-tab context.
   - Return source provenance, freshness metadata, and raw/condensed availability.
   - Do not import Svelte stores or browser APIs into the pure pipeline module.
3. Implement `contextBudgeter` with explicit priorities:
   - Always retain system persona, current user request, and invoked skill.
   - Reserve output tokens before allocating input.
   - Prefer recent history over old history.
   - Prefer active-tab context over `@tab` context.
   - Use active raw content only when it fits; otherwise use condensed content.
   - Use condensed content for `@tab` sources.
   - Trim/drop `@tab` sources before active context.
   - Replace older history with a conversation digest only after the digest feature exists; before then, trim complete oldest user/assistant turn pairs.
   - Never cut a message in the middle without labeling it as truncated.
4. Add a provider/model capability resolver:
   - Read known limits from existing model configuration when available.
   - Use a documented conservative fallback when the model is unknown.
   - Keep context-limit data separate from prompt assembly so model metadata can change independently.
5. Implement `sourceFormatter`:
   - Label every source as untrusted data.
   - Include title, normalized URL, type, and capture time.
   - Escape/encode source-controlled titles and any boundary-like text.
   - Use deterministic wrappers so tests can assert output.
6. Implement `contextAssembler`:
   - Emit the thin system string separately.
   - Emit conversation-level sources as a synthetic `user` message.
   - Append chronological persisted history.
   - Expand skill + new attachments + actual request into the current `user` message.
   - Do not mutate persisted records.
7. Add the system guardrail:
   - Sources/titles are untrusted data, not instructions.
   - Source text cannot override system/persona/skill instructions.
   - The model must not claim that omitted/truncated source text was reviewed.
8. Return assembly diagnostics for UI/debugging:
   ```js
   {
     messages,
     estimatedInputTokens,
     includedSourceIds,
     droppedSourceIds,
     trimmedTurnCount,
     warnings
   }
   ```

### Tests

- One-shot skill expansion appears only in the current turn.
- Stored display history remains unchanged after assembly.
- Synthetic source context has role `user`.
- Malicious source titles/content cannot break the wrapper structure.
- Context pressure drops `@tab` sources before the active source.
- Old turns are removed as complete pairs.
- Unknown models use the conservative budget.
- The assembler reports every dropped/truncated source.

### Verification

Run the test suite plus `npm run check`. Use fixtures for a long YouTube transcript, a normal article, multiple tabs, and prompt-injection-like page text.

### Completion criteria

- Pipeline functions can run without browser or Svelte globals.
- The same input produces deterministic model messages and diagnostics.
- Budget behavior and trust boundaries are covered by tests.

---

## Phase 3 — Conversation and Source Persistence

### Goal

Add durable, turn-based storage without modifying old summary/history records.

### Primary files

- Modify `src/lib/db/indexedDBService.js`.
- Add `src/lib/db/conversationRepository.js`.
- Modify `src/services/dataIntegrityService.js` for backup/restore coverage.
- Add IndexedDB tests using the `fake-indexeddb` dependency installed in Phase 1.

### Schema upgrade

Bump `DB_VERSION` from `9` to `10` and add:

1. `conversations`, key path `id`:
   - Index `updatedAt`.
   - Index `archived`.
   - Index `deleted`.
2. `conversation_messages`, key path `id`:
   - Index `conversationId`.
   - Unique compound index `['conversationId', 'sequence']`.
   - Index `createdAt`.
3. `conversation_sources`, key path `id`:
   - Unique index `sourceKey`.
   - Index `normalizedUrl`.
   - Index `capturedAt`.

Keep old `summaries`, `history`, `tags`, and `data_backups` stores untouched.

### Repository API

Implement at least:

```text
createConversation
getConversation
listConversations
updateConversationMetadata
archiveConversation
softDeleteConversation
addMessage
finalizeAssistantMessage
listMessagesByConversation
deleteMessagesByConversation
putSourceSnapshot
getSourceById
getSourceByKey
getSourcesByIds
deleteUnreferencedSources
exportConversationBundle
importConversationBundle
```

### Transaction rules

- Creating a conversation and its first user message must be atomic.
- Allocate `sequence` inside the same read/write transaction used to add the message.
- Write an assistant record only when a response finishes, is aborted with partial content, or ends in an error worth displaying.
- Do not write on every streamed token.
- On successful response, update the conversation `updatedAt` in the same transaction as the final assistant message.
- Deleting a conversation soft-deletes its metadata first. Garbage-collect unreferenced sources separately so shared snapshots are not removed accidentally.

### Backup/import behavior

- Extend complete backups with `conversations`, `conversationMessages`, and `conversationSources`.
- Add a backup schema version.
- Validate foreign keys before import.
- Remap IDs as a bundle when imported IDs conflict.
- Roll back all three chat stores together if import fails.
- Keep current summary/history/tag backup behavior unchanged.
- Do not add conversations to cloud sync in this phase.

### Tests

- Upgrade a version-9 fixture and verify all old records survive.
- Reject duplicate `(conversationId, sequence)` values.
- Reuse a source with the same `normalizedUrl + contentHash`.
- Keep identical content from different normalized URLs as separate sources.
- Load messages in deterministic order.
- Import/export preserves skill snapshots and attachment references.
- Deleting one conversation does not remove a source referenced elsewhere.

### Verification

```bash
npm test
npm run check
npm run build
npm run build:firefox
```

Inspect IndexedDB in Chrome and Firefox after upgrading an existing development profile.

### Completion criteria

- Version-9 databases upgrade without data loss.
- A complete conversation bundle round-trips through export/import.
- No chat code writes into the old `summaries` or `history` record shape.

---

## Phase 4 — Chat Orchestration and Svelte State

### Goal

Implement send, stream, abort, retry, reopen, and tab-session behavior independently of the final visual design.

### New files

- `src/stores/chatStore.svelte.js`
- `src/services/chat/chatService.js`
- `src/services/chat/chatSourceService.js`
- `src/services/chat/chatSessionService.js`

### State shape

`chatStore.svelte.js` should expose a single `$state` object with:

```js
{
  activeConversationId,
  conversation,
  messages,
  composerText,
  selectedSkill,
  pendingAttachments,
  isSending,
  streamingMessage,
  error,
  contextWarnings,
  abortController
}
```

Derived values should use `$derived`; do not use `$effect` for computable state. Components should consume store functions rather than mutate persistence directly.

### Work

1. Implement conversation lifecycle:
   - `startConversationForActiveTab()`.
   - `openConversation(id)`.
   - `renameConversation(id, title)`.
   - `archiveConversation(id)`.
   - `closeConversation()`.
2. Implement send lifecycle:
   - Validate non-empty request or skill invocation.
   - Lazily resolve/capture the active tab if grounding is required.
   - Persist conversation + user message.
   - Assemble model messages through the Context Pipeline.
   - Stream through the unified AI request API.
   - Append chunks to transient state.
   - Persist one final assistant record.
   - Surface pipeline warnings without treating them as provider failures.
3. Implement cancellation:
   - `stopGeneration()` aborts the active provider request.
   - Preserve non-empty partial output with status `aborted`.
   - Do not leave `isSending` or loading indicators stuck.
4. Implement retry:
   - Retry from the selected user turn using its stored skill instruction snapshot and attachments.
   - Do not duplicate the visible user message.
   - Either replace the failed assistant attempt or record attempts explicitly; v1 recommendation is to replace the immediately following failed/error assistant message.
5. Implement error handling with the existing structured error helper and add sources such as `chatCapture`, `chatAssembly`, `chatGeneration`, and `chatPersistence`.
6. Implement runtime tab-to-conversation mapping:
   - Use a runtime `Map<tabId, conversationId>` only to restore the current session when switching tabs.
   - Never persist `tabId` as conversation identity.
   - Reopening a stored conversation uses its source snapshots and does not silently rebind to the current tab.
   - “Use current tab” starts a new conversation or explicitly attaches a new snapshot.
7. Generate an initial title deterministically from the page title/user request; optional AI title generation is deferred.

### Tests

- Immediate chat captures the active page without requiring summarize first.
- Cached source reuse avoids repeated extraction.
- Stop produces a stable aborted state and persisted partial message.
- Retry uses original skill/source snapshots.
- Switching tabs restores runtime conversations without changing stored source identity.
- Reopening a chat works after its original tab is closed.

### Completion criteria

- Orchestration works from a minimal developer harness or temporary UI.
- Every send ends in exactly one terminal state: complete, aborted, or error.
- No streamed token is individually written to IndexedDB.

---

## Phase 5 — Active-Tab Chat UI

### Goal

Make chat the usable default side-panel experience while keeping a legacy escape hatch.

### New components

Create under `src/components/chat/`:

- `ChatShell.svelte`
- `ChatHeader.svelte`
- `ChatEmptyState.svelte`
- `ChatMessageList.svelte`
- `ChatMessage.svelte`
- `ChatComposer.svelte`
- `ChatSkillChip.svelte`
- `ChatSourceChip.svelte`
- `ChatContextWarning.svelte`
- `ConversationMenu.svelte`

### Existing files

- Refactor `src/entrypoints/sidepanel/App.svelte` into composition rather than adding more logic to the current ~707-line component.
- Reuse current settings/history navigation, theme, API-key prompt, model-status feedback, markdown display, error display, and toast primitives.
- Keep existing summary components available behind a clearly labeled temporary legacy entry.

### UX behavior

1. Empty state:
   - Show page title/domain.
   - Show pinned built-in skill chips.
   - Focus the composer.
2. Composer:
   - Multiline input.
   - Enter sends; Shift+Enter inserts a newline.
   - Send changes to Stop during generation.
   - Show selected skill and source chips above the text area.
   - Disable duplicate sends while a response is active.
3. Message list:
   - User and assistant messages use the existing typography/theme system.
   - Render assistant Markdown safely.
   - Display retry/copy controls.
   - Mark aborted/error messages without discarding partial text.
   - Auto-scroll only when the user is already near the bottom.
4. Context feedback:
   - Show when the active page is being captured or condensed.
   - Show sources omitted because of context limits.
   - Never silently claim that omitted sources were used.
5. Conversation controls:
   - New chat.
   - Rename.
   - Archive.
   - Open conversation history.
   - Temporary “Legacy summary view” entry.
6. Accessibility:
   - Keyboard-accessible chips/menus.
   - `aria-live` for generation status, not every streamed token.
   - Visible focus states.
   - Composer and message actions have labels independent of icons.
7. Svelte 5 conventions:
   - `$props()` and callback props for new components.
   - `onclick` event handlers.
   - `$derived` for computed state.
   - Avoid `createEventDispatcher`, slots, and duplicated module-level UI state.

### Verification matrix

- Chrome desktop: webpage, YouTube, course page.
- Firefox desktop with and without `<all_urls>` granted.
- Narrow/mobile side-panel width.
- Light/dark themes and one custom font.
- Streaming provider, non-streaming fallback, provider error, user abort.
- Tab switch during generation.

### Completion criteria

- A user can complete and continue an active-tab chat entirely from the side panel.
- Legacy summary remains available and functional.
- Reloading the side panel reopens the persisted conversation.
- No horizontal overflow or inaccessible composer controls at supported widths.

---

## Phase 6A — Core Skills, Global Persona, and Custom-Prompt Migration

### Goal

Unify built-in actions and user prompts under one explicit one-shot skill mechanism, establish the global persona, and migrate existing custom prompt configurations without changing the prompt-editor UI yet.

### New files

- `src/lib/chat/skills/builtInSkills.js`
- `src/lib/chat/skills/skillService.js`
- `src/lib/chat/skills/skillMigration.js`
- `src/components/chat/SkillPicker.svelte`

### Skill contract

```js
{
  id,
  version,
  name,
  description,
  command,
  instruction,
  starterPrompt,
  pinned,
  builtIn,
  enabled
}
```

Built-ins are code-defined and versioned. User skills are stored through the existing WXT settings/storage layer because they are small configuration records, not conversation content.

### Work

1. Extract current task instructions/templates into built-in skills without discarding tuned prompt assets.
2. Add at least Summarize, Analyze, Explain, Debate, Translate, and Comment Analysis where the corresponding existing action exists.
3. Clicking a skill chip:
   - Selects one skill.
   - Seeds `starterPrompt` when appropriate.
   - Does not send until the user confirms, unless the chip is explicitly designed as a one-click opener.
4. `/command` parsing:
   - Recognize commands only at the start of composer input.
   - Remove the command token from visible request text after converting it to a skill selection.
   - Unknown commands remain ordinary user text.
5. Add a new global persona setting containing stable tone/language/persona instructions only.
6. Implement idempotent migration from per-content custom prompts:
   - Migration version stored in settings.
   - Convert enabled or genuinely customized per-type prompt pairs into user skills.
   - Preserve both the old custom system text and user prompt template inside the migrated skill instruction/starter prompt as appropriate.
   - Do not delete or overwrite old settings.
   - Avoid duplicate skills on repeated initialization.

### Tests

- Skill expansion occurs for one request only.
- Editing a skill does not alter instruction snapshots stored on older turns.
- Migration is idempotent and preserves old settings.
- `/summarize` selects the skill; an unknown slash command remains text.

### Completion criteria

- Existing task actions can be invoked as skills in chat.
- Existing custom prompt users retain access to their configurations.
- Turn two is ordinary chat unless the user explicitly invokes another skill.
- The new global persona is snapshotted per conversation and wins instruction conflicts with a skill.

---

## Phase 6B — Prompt-Editor Skill UI and Conversation-Aware Deep Dive

### Goal

Expose the Phase 6A skill model in the prompt editor and adapt Deep Dive to persisted assistant messages. This phase is deliberately separate so a large prompt-editor refactor cannot block the core chat/skill mechanism.

### Primary files

- Refactor `src/entrypoints/prompt/App.svelte`.
- Refactor `src/entrypoints/prompt/PromptMenu.svelte`.
- Add prompt-editor skill components under `src/components/skills/`.
- Modify `src/stores/deepDiveStore.svelte.js`.
- Modify `src/services/tools/deepDiveService.js`.
- Modify the Deep Dive integration in `src/entrypoints/sidepanel/App.svelte` and chat components.

### Work

1. Refactor the prompt editor into a skill manager backed by `skillService.js`:
   - Browse built-ins.
   - Create/edit/delete user skills.
   - Pin/unpin.
   - Reset a modified built-in override.
   - Preview final instruction and starter prompt.
   - Keep a compatibility route/view for legacy per-content prompt settings during the rollout window.
2. Make editing semantics explicit:
   - Built-in definitions remain code-owned and versioned.
   - User edits create an override/copy; they do not mutate the built-in registry.
   - Command names are unique after normalization.
   - Invalid/empty instructions cannot be saved.
3. Generalize Deep Dive:
   - Keep opt-in/lazy behavior.
   - Bind generated questions to `conversationId + assistantMessageId`.
   - Cache by that same key rather than only by tab.
   - Cancel or ignore stale generation after a new user message.
   - Clicking a follow-up inserts/sends a normal user message without activating the prior one-shot skill.
4. Preserve the existing summary-based Deep Dive path while the legacy summary surface remains available.

### Tests and verification

- Skill CRUD/pinning persists across prompt-editor reloads.
- Built-in reset restores the current code-defined version.
- Duplicate slash commands are rejected or resolved deterministically.
- Deep Dive results cannot attach to the wrong assistant message.
- A stale Deep Dive request cannot overwrite questions for a newer reply.
- Legacy summary Deep Dive still works.
- Run `npm test`, `npm run check`, and both Chrome/Firefox builds; manually verify the prompt-editor layout at narrow and desktop widths.

### Completion criteria

- Users can create, edit, delete, and pin user skills from the prompt editor.
- Built-in skills remain recoverable after user customization.
- Deep Dive suggestions are conversation/message scoped and remain opt-in/lazy.
- The Phase 6A migration and legacy custom settings remain accessible and reversible.

---

## Phase 7 — Conversation Archive, Backup, Export, and Import

### Goal

Make persisted conversations discoverable and portable without forcing them into the old flat `summaries[]` renderer.

### Primary files

- Modify `src/stores/archiveStore.svelte.js` or add a dedicated `conversationArchiveStore.svelte.js`.
- Modify `src/entrypoints/archive/App.svelte` and `SidePanel.svelte`.
- Add conversation-specific archive display components.
- Complete chat handling in `src/services/dataIntegrityService.js`.
- Update any Markdown/JSON export utilities used by archive.

### Work

1. Add a Conversations section/tab instead of mixing record shapes in the existing history/archive arrays.
2. List conversations by `updatedAt`, with title, source domain, last-message preview, archived state, and tags.
3. Render a chronological transcript with skill/source chips reconstructed from references.
4. Add actions:
   - Resume in side panel.
   - Rename.
   - Archive/unarchive.
   - Soft delete.
   - Export one conversation.
5. Export formats:
   - Markdown transcript with source provenance and capture timestamps.
   - JSON bundle containing conversation, messages, and referenced sources.
6. Full backup/import:
   - Include all three chat stores and schema version.
   - Validate message roles, sequence uniqueness, source keys, and references.
   - Remap conflicting IDs consistently.
   - Preserve old backup compatibility when chat arrays are absent.
7. Data clearing:
   - “Clear chat data” is separate from existing summary/history clearing unless the user explicitly chooses all data.
8. Cloud sync:
   - Leave existing sync file formats unchanged.
   - Mark conversation sync as unsupported in v1 UI/docs rather than silently omitting it from a setting that implies full backup.

### Verification

- Create, archive, export, delete, import, and resume a conversation.
- Import an old backup with no chat fields.
- Import a chat bundle with conflicting IDs.
- Confirm summary/history/archive screens still render old records.
- Confirm cloud sync still handles only its existing stores without data loss.

### Completion criteria

- Conversations are reopenable after browser restart and original-tab closure.
- JSON round-trip preserves grounding and skill snapshots.
- Old backups and old archive records continue to work.

---

## Phase 8 — `@[tabname]` Multi-Tab Context

### Goal

Allow explicit attachment of other open tabs without silently reading unrelated tabs.

### Primary files

- Generalize `src/services/contentService.js`.
- Reuse/extend helpers in `src/entrypoints/background.js`.
- Extend `src/services/firefoxPermissionService.js` only for the existing `<all_urls>` flow.
- Add `src/services/chat/tabMentionService.js`.
- Add `src/components/chat/TabMentionMenu.svelte`.
- Extend `ChatComposer.svelte`, `chatSourceService.js`, and the Context Pipeline.

### Content API refactor

Change `getPageContent()` to accept an options object while keeping a compatibility wrapper for old callers:

```js
getPageContent({
  tabId,
  url,
  contentType,
  preferredLang
})
```

The function must not query the active tab when a target `tabId` was explicitly provided.

### Mention UX

1. Typing `@` opens tabs from the current browser window.
2. Search by title and hostname; disambiguate duplicate titles.
3. Selecting a tab creates a pending attachment chip and removes mention syntax from message text.
4. A tab is read only after explicit selection/send.
5. Support multiple tabs with a documented maximum; v1 recommendation is three `@tab` attachments per turn.
6. Removing a chip before send prevents capture.

### Permission and restricted-page behavior

1. On Firefox, check whether `<all_urls>` is granted.
2. If missing, request `<all_urls>` from the user action that sends/selects the attachment.
3. If denied, keep the message draft and show a clear source-specific error.
4. Do not repeatedly prompt after denial in the same interaction.
5. Reject or explain unsupported URLs before capture:
   - Browser internal pages.
   - Extension stores.
   - Extension pages without an explicit supported path.
   - PDFs or viewer pages where script injection/content extraction is unavailable.
6. Handle tabs that close or navigate between selection and send.

### Source resolution and condensation

1. Reuse an existing tab summary/snapshot when `normalizedUrl + contentHash` matches.
2. Otherwise capture the target tab by ID.
3. `@tab` attachments use condensed content:
   - Reuse an existing suitable condensed snapshot when available.
   - Otherwise run a dedicated condensation request with explicit provenance preservation.
   - Show resolving/condensing progress before the main response.
4. Preserve source order selected by the user, but allow the budgeter to drop low-priority attachments.
5. Surface dropped/failed tabs individually; do not fail the entire message if at least the user request and active source remain usable.

### Tests

- Duplicate tab titles are distinguishable.
- Explicit target capture never falls back to the currently active tab.
- A tab navigating during capture yields a mismatch warning/new snapshot.
- Firefox denial preserves the draft and does not send ungrounded content silently.
- Multiple `@tab` sources are labeled separately.
- Budget pressure drops `@tab` sources before the active source.
- Closed/restricted tabs produce source-specific errors.

### Completion criteria

- Users can attach up to the v1 maximum open tabs explicitly.
- Each included source is visible in the UI and traceable in model context.
- Permission denial, navigation races, and context overflow are recoverable.

---

## Phase 9 — Provider/Browser Hardening and Default Rollout

### Goal

Validate parity, control regressions, and switch the default side-panel experience to chat.

### Provider matrix

Test at least:

- Gemini basic and advanced, including key rotation and model fallback.
- OpenAI/ChatGPT.
- Groq.
- OpenRouter.
- DeepSeek.
- Cerebras.
- Custom OpenAI-compatible endpoint.
- LM Studio.
- Ollama direct/proxy with documented fake-stream behavior.

Record capability flags rather than scattering provider-name checks:

```js
{
  supportsMessages,
  supportsStreaming,
  supportsSystem,
  supportsTools,
  maxContextTokens,
  proxyMode
}
```

Tools remain disabled even if a provider supports them; the flag is groundwork only.

### Browser matrix

- Chrome desktop.
- Edge desktop build/load smoke test.
- Firefox desktop with permission granted and denied.
- Firefox Android/non-streaming fallback.
- Narrow side-panel/popup behavior where side panel is unavailable.

### Hardening work

1. Verify Firefox mobile `ReadableStream` fallback applies to chat.
2. Ensure stream abort does not trigger fallback/retry as if it were a provider failure.
3. Rate-limit/debounce source condensation and Deep Dive requests.
4. Add maximum persisted message/source sizes and user-visible overflow errors.
5. Sanitize rendered Markdown/HTML using the same or stronger policy as existing summary output.
6. Remove sensitive prompt/source contents from production console logs.
7. Confirm error telemetry/logs do not contain API keys or full captured pages.
8. Run prompt-injection fixtures against each major provider and document that defenses reduce but do not eliminate risk.
9. Add cleanup for orphan sources and old soft-deleted conversations.
10. Measure side-panel startup, first-token latency, capture time, and IndexedDB size on long transcripts.

### Rollout

1. Keep an internal/setting-based chat feature flag until the matrix passes.
2. Enable chat by default after parity criteria pass.
3. Keep the legacy summary entry for at least one release.
4. Collect explicit bug reports before removing legacy UI or compatibility wrappers.
5. Remove old UI paths only in a separate approved plan.

### Final verification

```bash
npm test
npm run check
npm run build
npm run build:firefox
npm run zip
npm run zip:firefox
```

Manual end-to-end scenarios:

1. Ask about a webpage without summarizing first.
2. Summarize a long YouTube transcript, then ask follow-ups.
3. Invoke a migrated custom skill and verify it is one-shot.
4. Stop and retry a streaming response.
5. Close the original tab/browser, reopen the conversation, and continue from the stored snapshot.
6. Attach three tabs, deny/allow Firefox permission, and observe budget warnings.
7. Export, delete, import, and resume a conversation.
8. Use Ollama and confirm the UI handles a single complete chunk.
9. Confirm old summary/archive/history/cloud-sync flows still work.

### Completion criteria

- All supported providers either pass chat or expose a clear capability/error state.
- Chrome and Firefox production builds pass.
- Existing summary functionality has no known blocking regression.
- Chat is safe to make the default side-panel surface.

---

## 6. Cross-Cutting Rules

These rules apply to every phase.

### Backward compatibility

- Do not remove existing function exports until all callers are migrated and a later cleanup phase is approved.
- Do not repurpose old IndexedDB stores for conversations.
- Do not mutate/delete per-content custom prompt settings during migration.
- Do not change existing cloud-sync formats as a side effect of local chat persistence.

### Privacy and trust

- Read a non-active tab only after explicit `@tab` selection.
- Treat page text, titles, URLs, and imported conversation data as untrusted.
- Never place API keys, full source content, or complete model requests in logs.
- Make provider transmission visible through source chips/context indicators.

### Reliability

- Every async operation needs an abort or stale-result strategy.
- Capture, condensation, generation, persistence, and Deep Dive errors remain distinguishable.
- Persist terminal message state once; avoid per-token writes.
- UI state must recover after side-panel unmount/remount.

### Svelte 5

- Use runes consistently for new reactive modules/components.
- Prefer `$derived` for computed values and `$effect` only for external synchronization.
- Use callback props and `onclick` in new components.
- Keep browser/DB side effects out of render-time derived expressions.

### Documentation

After each implemented phase, write:

```text
docs/chat-harness/walkthrough-Phase-N.md
```

Use the literal suffix for split phases, for example `walkthrough-Phase-6A.md` and `walkthrough-Phase-6B.md`.

Each walkthrough must include changed files, behavior, migration notes, verification commands/results, manual checks, known limitations, and screenshots when UI changed.

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Adapter refactor breaks existing summarization | Compatibility wrappers; Phase 1 regression checks before chat UI |
| Context silently omits important material | Deterministic priorities; diagnostics; visible dropped-source warnings |
| Reopened chat lacks original details | Immutable condensed snapshots; capture-time label; explicit refresh/reattach path |
| IndexedDB upgrade loses old data | Version-9 fixture tests; new stores only; pre-import backup |
| Streaming causes excessive writes | Transient chunks; one terminal assistant write |
| Edited skills alter old conversations | Persist instruction snapshots per invocation |
| `@tab` reads the wrong tab after navigation | Validate tab ID + URL before/after capture; create new snapshot or warn |
| Firefox permission interrupts send | Request `<all_urls>` from user action; preserve draft on denial |
| Prompt injection in page content | System guardrail, synthetic user source role, provenance labels, escaped boundaries, no autonomous tools |
| Source registry grows indefinitely | Immutable dedup keys, orphan detection, explicit cleanup policy |
| Cloud sync implies chat is backed up when it is not | Explicit v1 limitation in settings/docs; local export/backup support |

---

## 8. Definition of Done

The Chat Harness v1 is complete only when:

- The side panel supports persisted multi-turn chat grounded in the active tab.
- Built-in and migrated user skills use the same one-shot mechanism.
- Context assembly is deterministic, budgeted, source-labeled, and test-covered.
- Conversations reopen without the original tab and retain their source/skill snapshots.
- `@[tabname]` works with explicit selection, Firefox `<all_urls>` handling, restricted-page errors, and visible budget outcomes.
- Provider/browser behavior is verified according to Phase 9.
- Existing summary, archive, history, prompt, and cloud-sync paths remain functional.
- Builds and type checks pass.
- Every phase has a walkthrough recording actual verification results.

Any later work on memory, knowledge/RAG, tools, sticky skills, cloud-synced conversations, or removal of legacy UI requires a separate approved plan.
