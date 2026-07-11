# Chat message-graph roadmap

**What this is:** a phased, self-contained implementation plan for evolving the chat harness from a flat linear
message log into a branching **message graph** with an active-branch path. Each phase is executable on its own
by a fresh session and ends with a concrete verify step. Per-phase walkthroughs go to
`docs/chat-message-graph/walkthrough-Phase-N.md` (see the `implement-phase` skill).

---

## Context

The chat harness (commit `040412f`) already has streaming, stop, per-tab conversations, context budgeting,
skills, sources, and archive/import-export. But its conversation model is a **flat linear array** keyed by a
unique `sequence`, with **no branching**. This adopts Open WebUI's *message-graph + active branch* data model
(re-implemented, not copied — Open WebUI's license and component code stay out).

Exploration confirmed against the current code:

- **Linear only.** `conversation_messages` is keyed by the unique compound index `conversationId_sequence`; no
  `parentId`, children, or active-leaf pointer anywhere (`src/lib/db/indexedDBService.js:85-96`,
  `src/lib/db/conversationRepository.js`).
- **Correctness bug — the real payoff.** Retry appends a new assistant and **keeps the old failed one**
  (`applyTerminalResult`, `src/stores/chatStore.svelte.js:162`). The context assembler then feeds **every**
  user/assistant message to the model, filtering only on `role`, never on `status` or branch
  (`src/lib/chat/contextPipeline/contextAssembler.js:34-38`). So a later turn can show the model both a failed
  reply and its retry.
- **Latent seam.** A `retryOfMessageId` field is already persisted opportunistically on assistant records
  (`chatService.js:111,119`) — a natural seed for `parentId`.
- **UI gaps.** Retry is offered only on aborted/error replies; no edit / regenerate-on-success / continue /
  delete; sources bind to the **user** turn and render only in the composer & archive, never as response
  citations; the list renders every message with no pagination or `content-visibility`.

**Intended outcome:** a branching conversation model whose **active path is the single source of truth for what
the model sees**, eliminating the "stale failed reply poisons context" bug and unlocking edit / regenerate /
continue / citations as small, additive changes rather than patches on a linear log.

**Decided constraints:**
- Migrate existing conversations **in place** on DB upgrade.
- 4 phases, each self-contained with a concrete verify step.

---

## Shared data-model foundation (introduced in Phase 1, used by all)

**Message record** (`createMessageRecord`, `conversationRepository.js:86`): add
- `parentId: string | null` — semantic parent (root user message = `null`).
- `parentKey: string` — indexable mirror = `parentId ?? '__root__'`. **`null` is not a valid IndexedDB key**,
  so root messages would vanish from a `['conversationId','parentId']` index. Always index and query on
  `parentKey`; keep `parentId` as the readable field. Maintain both wherever a message is written.
- Keep `sequence` — still a unique monotonic per-conversation counter, used for export/audit ordering and
  sibling tie-breaking (and to define "latest" descendant). The `conversationId_sequence` unique index stays
  valid: sequences remain unique.

**Conversation record** (`createConversationRecord`, `conversationRepository.js:63`): add
- `activeLeafMessageId: string | null` — the leaf of the branch currently sent to the model.

**Index** (`indexedDBService.js` `onupgradeneeded`): add compound `conversationId_parentKey`; bump
`DB_VERSION` 10 → 11.

**Branch rules**
- New user message: `parentId = conversation.activeLeafMessageId`.
- Assistant reply: `parentId = userMessage.id`.
- Regenerate assistant: new assistant **sibling**, same `parentId` as the existing assistant.
- Edit user message: new user **sibling**, same `parentId` as the edited message (old branch untouched).
- `activeLeafMessageId` always points at the leaf of the visible branch.

**Repository helpers — precise context boundaries (avoid ambiguity):**
- `getAncestorPath(messageId, { includeSelf })` — root→messageId via `parentId`, ordered. **Guards required:**
  detect cycles (visited set), stop on missing parent, and reject a parent whose `conversationId` differs
  (matters for imported data).
- `getGenerationContextForUser(userMessageId)` → `{ history, currentUserMessage }` where
  `history = getAncestorPath(userMessage.parentId, { includeSelf: true })` and `currentUserMessage` is that
  user message. This guarantees generation for a user turn never includes the target user twice, the old
  assistant being regenerated, or any descendant after it.
- `getGenerationPath(conversationId)` — full active path root→`activeLeafMessageId` for a normal send. **This is
  the model-context path and must never be the paginated UI list** (see below).
- `activateBranch(messageId)` — set `activeLeafMessageId = findLatestDescendant(messageId)`.
- `findLatestDescendant(messageId)` — descend children choosing the child with the greatest `sequence` at each
  step until a leaf. "Latest" is defined strictly by `sequence`.

**Hard rule — never share one array between UI pagination and model context.** The store keeps
`chatState.visibleMessages` for rendering (Phase 4 may window it to the last 20–30). The service always builds
model context from `repository.getGenerationPath()` / `getGenerationContextForUser()`, then lets
`contextBudgeter` trim for tokens. Windowing the UI must **never** silently truncate what the model sees.

---

## Phase 1 — Message-graph foundation + context correctness (highest ROI)

**Goal:** Introduce the graph, migrate existing data in place, make model context come from the **active
generation path only** (never error/empty/off-branch replies), support regenerating a *complete* answer, and
expose a `‹ 1/2 ›` branch switcher.

**Changes**
- **Migration** — `indexedDBService.js` `onupgradeneeded` (v10→v11). **Do it entirely with cursor callbacks
  inside the version-change transaction** — no repository helpers, no `await` that could let the upgrade
  transaction go inactive (the existing summaries migration at `indexedDBService.js:109` already uses
  `openCursor` callbacks; follow that pattern). For each conversation: walk its messages via
  `index('conversationId_sequence').openCursor(range)` in sequence order, `cursor.update` each with
  `parentId`/`parentKey` chained to the previous id (first = `null`/`'__root__'`), and set the conversation's
  `activeLeafMessageId` to the last message id. Create the `conversationId_parentKey` index.
- **Repository** (`conversationRepository.js`):
  - `createMessageRecord`/`createConversationRecord` gain the new fields (always set `parentKey`).
  - `addMessage`/`finalizeAssistantMessage` accept `parentId` and update `activeLeafMessageId` to the new id.
  - Add `getGenerationPath`, `getAncestorPath`, `getGenerationContextForUser`, `getSiblings(conversationId,
    parentKey)`, `activateBranch`, `findLatestDescendant` (with the guards above).
  - Bump `CONVERSATION_BUNDLE_SCHEMA_VERSION` and `CONVERSATION_BACKUP_SCHEMA_VERSION` 1 → 2; extend
    `validateConversationBundle`/`validateConversationBackup` to validate `parentId` FKs (null or an id in the
    same conversation, no cycles) while still accepting v1 payloads — backfill `parentId`/`parentKey` by
    sequence chaining on import.
- **Service** (`chatService.js`): pull context from the **repository**, not the store array. `send` uses
  `getGenerationPath`; `retry`/new `regenerate` use `getGenerationContextForUser(targetUserId)`. Set
  `parentId`/`parentKey` per the branch rules and move the active leaf.
- **Context** (`contextAssembler.js:34-38` and/or `contextBudgeter.js`): the generation path is already
  branch-correct; additionally **skip** assistant messages with `status === 'error'` or empty content.
- **Store** (`chatStore.svelte.js`): introduce `visibleMessages` (UI) distinct from the generation path;
  `openConversation` loads visibleMessages via the active path; add `regenerateChatMessage(assistantMessageId)`
  and `switchBranch(messageId)` (→ `activateBranch`, then reload visibleMessages).
- **UI** (`ChatMessage.svelte`/`ChatMessageList.svelte`): show `‹ 1/2 ›` when a message has siblings (via
  `getSiblings`, wired to `switchBranch`); offer Regenerate on **complete** replies, not just aborted/error.

**Verify**
- **Automated upgrade test (required — migration is the riskiest part):** with `fake-indexeddb`, seed a
  **v10** fixture DB (linear messages, no parentId), open at v11, assert every message has correct
  `parentId`/`parentKey`, each conversation has `activeLeafMessageId` = last message, and no data loss.
- Vitest (`tests/chat/messageGraph.test.js`): `getGenerationPath` returns root→leaf; `getGenerationContextForUser`
  excludes the target user duplicate, the old assistant, and descendants; regenerate creates a sibling and
  moves the active leaf; the assembler excludes error/empty replies; `getAncestorPath` guards cycles / missing
  / cross-conversation parents.
- Manual bug repro: force an error reply, retry to success, send a follow-up; confirm via the network payload
  that the errored reply is **not** in the model messages.

---

## Phase 2 — Per-message actions

**Goal:** Turn the graph into user-facing actions.

**Changes** (`ChatMessage.svelte` + store/service/repo helpers):
- **Edit user message** → new user sibling + fresh generation via `getGenerationContextForUser`.
- **Regenerate** response (from Phase 1; surface consistently).
- **Continue** response — **defined semantics:** do **not** create an assistant-child-of-assistant (the
  pipeline assumes alternating user/assistant turns). Instead keep the **same** assistant record, send the
  active path ending at that assistant plus an internal "continue" instruction, receive the continuation, and
  append it to `message.content`; store continuation metadata if useful. **Scope: Phase 2 supports continue for
  aborted/interrupted replies only**; complete-reply continuation is deferred.
- **Delete message / delete branch** — prune a subtree and re-point `activeLeafMessageId`, in a **single IDB
  transaction** (do not fire arbitrary `Promise.all` over independent IDB requests across transaction
  boundaries).
- **Copy** for user messages too (assistant copy already exists).
- Display **model/provider** and **token usage**. Fields exist on the record (`providerId`, `modelId`,
  `usage`) but usage is never collected — the stream loop drops completion metadata
  (`chatService.js:139`, `if (event.isComplete) continue`). Read usage from the completion event per provider
  and persist it at finalize.

**Verify**
- Vitest: delete-branch (subtree gone, active leaf re-pointed, single transaction) and edit (old branch intact,
  new branch active); continue appends to the same record for an aborted reply.
- Manual: edit a mid-conversation user message, switch branches with `‹ ›`, confirm usage/model chips render
  when the provider returns usage.

---

## Phase 3 — Grounding & citations

**Goal:** Show which sources actually reached the model, without a RAG backend.

**Changes**
- Distinguish **"sources used"** (pipeline `includedSourceIds`, `contextBudgeter.js`) from **"inline
  citations"** (`[n]` markers). Only call them citations once the model emits markers.
- Persist `groundingRefs` on the **assistant** record at finalize, **storing source IDs only** (e.g.
  `[{ sourceId, contentKind }]`). Resolve `title`/`url` from the source store at render time to avoid stale
  metadata.
- Render a "N sources" affordance under a response opening a source drawer (reuse `ChatSourceChip` / archive
  `ConversationTranscript.svelte` patterns).

**Verify**
- Vitest: `groundingRefs` source IDs on a finalized assistant equal the pipeline's included sources.
- Manual: attach a tab, send, confirm the response shows "N sources" and the drawer lists them.

---

## Phase 4 — Durability & performance

**Goal:** Survive interruptions and scale to long chats.

**Changes**
- **Durable streaming via recovery-on-open (the guarantee), not close hooks.** Persist the assistant with
  `status: 'streaming'` before calling the model; checkpoint content on a throttle (~500–1000 ms). Terminal
  generation flushes a final checkpoint and cancels the timer. On the next conversation/database open, find any
  message still `streaming` and mark it `interrupted`. A best-effort cleanup on panel close is optional —
  extensions don't guarantee it runs on close/crash/unload, so **recovery-on-open is the source of truth**.
- **Pagination decoupled from context:** `visibleMessages` windows to the last ~20–30 with a "Load earlier"
  affordance in `ChatMessageList.svelte`. The model-context path stays `repository.getGenerationPath()` (full),
  trimmed only by `contextBudgeter` — pagination never touches it.
- Apply `content-visibility: auto` (+ `contain-intrinsic-size`) to long messages in `ChatMessage.svelte`.

**Verify**
- Manual: start a long generation, kill the panel/reload; reopen and confirm the partial reply persists and is
  marked `interrupted` (recovery-on-open), not lost. Load a 50+ message conversation; confirm "Load earlier"
  works, scroll stays smooth, and the model still receives full active-path context (check payload).

---

## Explicitly out of scope (kept local-first)

Python/backend, user management, multi-model merge, code execution / tool servers / plugin marketplace, vector
DB / RAG server, share links / collaboration, evaluation-feedback backend, and any verbatim Open WebUI
component/UI or branding (learn the data model; re-implement — see Open WebUI's LICENSE).

---

## Critical files

- `src/lib/db/indexedDBService.js` — DB v11, `conversationId_parentKey` index, cursor-only in-place migration.
- `src/lib/db/conversationRepository.js` — record shapes (`parentId`+`parentKey`, `activeLeafMessageId`),
  `getGenerationPath` / `getAncestorPath` / `getGenerationContextForUser` / `getSiblings` / `activateBranch` /
  `findLatestDescendant` (with cycle/missing/cross-conversation guards), single-transaction delete-subtree,
  bundle/backup schema v2 + validators.
- `src/services/chat/chatService.js` — repository-sourced context for send/retry/regenerate/edit/continue,
  usage collection from the completion event (`:139`).
- `src/lib/chat/contextPipeline/contextAssembler.js` (+ `contextBudgeter.js`) — drop error/empty replies.
- `src/stores/chatStore.svelte.js` — `visibleMessages` (UI) vs generation path (context) split;
  regenerate/switchBranch/edit/delete/continue actions.
- `src/components/chat/ChatMessage.svelte`, `ChatMessageList.svelte` — branch switcher, action buttons,
  citations affordance, `content-visibility`, "Load earlier".
- `src/services/dataIntegrityService.js` — **audit for schema-v2 impact** (backup validation/repair paths).
- `tests/chat/` — new Vitest specs incl. the `fake-indexeddb` v10→v11 upgrade test (`npm test`).
