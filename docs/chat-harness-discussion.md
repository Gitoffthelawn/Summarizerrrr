# Chat Harness — Discussion Notes (Context for Next Session)

> **Status:** Discussion / design only. NOT approved for implementation, NO plan written yet.
> **Date:** 2026-07-10
> **Revision:** v2.1 — incorporates the detailed technical review plus follow-up corrections to conversation storage, lazy source capture, source identity/staleness, model-message roles, and Firefox permission scope. Corrections to v1 are marked ⚠️ **[revised]**; new sections added for storage model, AI-SDK reality, and prompt-injection defense. Backbone renamed **Context Pipeline**.
> **Purpose:** Full, verified context so a fresh session can continue analysis without re-deriving anything.

---

## 1. The Goal

Evolve the **side panel** from one-shot summary/analyze buttons into a **chat interface**.

Long-term vision (owner's words): turn the extension into a **web-based assistant "harness"** with **memory, tools, and knowledge**. Most tools already built are a good foundation.

Concrete product picture:

- User opens the side panel → can either **summarize quickly** or **ask anything** about the active tab.
- User can type **`@[tabname]`** to attach context from another open tab (multi-tab context).
- The **prompt editor** becomes the place to create **skills** and pin them as starting suggestions.

---

## 2. The Converged Design (context engineering)

```
┌─ SYSTEM PROMPT (thin, constant across the whole conversation) ─┐
│  • Tone / response style                                       │
│  • Output language                                             │
│  • Core principles (safety, base format, etc.)                 │
│  • Global persona  ⚠️ [revised — see below]                    │
│  • Prompt-injection guardrail (§9)                             │
└────────────────────────────────────────────────────────────────┘
        +  (only when invoked)
┌─ SKILL (markdown block, injected dynamically, ONE-SHOT) ──────┐
│  Built-in: summarize / analyze / debate / translate …         │
│  User-defined: created in the prompt editor                   │  ← both share ONE mechanism
└────────────────────────────────────────────────────────────────┘
        +  documents (active tab content + @mentioned tabs)
        +  conversation history
```

### Core principles agreed

1. **Interaction shape:** A skill is a **one-shot opener** to process something quickly (turn 1). From turn 2 onward it's **normal chat to dig into a topic**. The harness doesn't need to be complex; it needs a good opener, then lets the conversation flow.
2. **Thin system prompt = only stable stuff** (tone, language, core principles, global persona, injection guardrail). Do NOT bake task-specific output formats into it — that's the current flaw where each content type's system prompt hard-codes "respond as a structured summary".
3. **Everything task-specific is a "skill"** — a markdown block injected into context. Built-in and user skills use the **same** mechanism. Prompt editor manages them all.
4. **Skills are one-shot for v1** — active only for the turn they're invoked, then dropped. `lifetime: sticky` (a "mode" like Translator) can be added later as a flag.
5. **Explicit invocation only for v1** — click a chip or type `/summarize`. No model-chosen/agentic selection yet.

### ⚠️ [revised] "Custom persona" is NOT yet a single global field

**Verified:** the codebase has *per-content-type* custom system instructions, not one global persona —
`youtubeCustomSystemInstructionContent`, `chapterCustomSystemInstructionContent`, `webCustomSystemInstructionContent`, `courseSummaryCustomSystemInstructionContent`, `courseConceptsCustomSystemInstructionContent`, `selectedTextCustomSystemInstructionContent`, plus `analyze/explain/debate/comment` variants (`src/stores/settingsStore.svelte.js:83+`), each paired with a `*PromptSelection` toggle and `*CustomPromptContent`.

Migration path (do NOT blindly treat all of these as one global persona):
1. **Create a new global persona field** (tone/language/principles).
2. **Convert each per-content-type custom prompt into the matching user skill** — this is a clean demonstration of "everything is a skill".
3. **Keep back-compat** with existing settings (users already rely on these; owner considers custom prompts a signature strength).

---

## 3. The Backbone: **Context Pipeline** ⚠️ [revised — was "Context Assembler"]

The real backbone is NOT the chat UI or the AI calls. It's a **Context Pipeline** with three stages:

```
                    ┌─────────────────┐   ┌───────────┐   ┌────────────┐
sources & refs  →   │ source resolver │ → │ budgeter  │ → │ assembler  │ → model messages[]
                    └─────────────────┘   └───────────┘   └────────────┘
```

- **source resolver** — turns references (active tab, `@tab` refs, memory, knowledge) into concrete condensed/raw content; handles fetch, staleness, permissions.
- **budgeter** — enforces the context-window budget. Assigns per-source priority, decides what to include/compress/drop. `@tab` attachments compress first and drop first.
  - **Open design lever:** does the budgeter operate on condensed content only, or may it pick **raw-vs-condensed per source** based on remaining budget? (e.g. plenty of budget → send raw for the active tab; `@tab` always condensed and first to be trimmed.)
- **assembler** — composes the final **model** `messages[]` in the correct order (§5), with per-source delimiters/labels (§9).

If these three stages are designed once, then `@tab`, skills, memory, and knowledge are all just "sources plugged into the pipeline." Build this before piling on features.

---

## 4. Codebase Findings (verified against source)

### AI layer ⚠️ [revised]
- **`ai@^5.0.39`** (verified in `package.json`). The AI SDK 5 agent loop uses **`stopWhen` / `stepCountIs(...)`**, NOT `maxSteps` (the v1 note here was outdated — `grep` for `maxSteps|stopWhen|stepCountIs` currently returns nothing in `src/`).
- `src/lib/api/aiSdkAdapter.js:289` (`generateContent`) and the streaming twin have **many branches: retry, key rotation, Gemini auto-fallback, streaming/smoothing, proxy path**. Moving to chat is **NOT a one-parameter change**. It needs a **unified internal request object** — e.g. `{ system, messages, tools?, providerOptions, abortSignal }` — threaded through the whole retry/fallback/stream machinery, replacing the current `(system, prompt)` string pair.
- Vercel AI SDK natively supports `messages[]`; that part is genuinely easy. The work is the plumbing above.

### Ollama proxy ⚠️ [revised]
- `src/lib/api/ollamaProxyModel.js:62` — `streamText` is **fake streaming**: it `await this.generateText(config)` (a blocking `OLLAMA_API_REQUEST` round-trip through background) then yields the entire result in one chunk. So chat will *work* on Ollama but with **no real token-by-token streaming** until a streaming message channel (port-based chunking from background) is built. Also still needs `messages[]` support. For v1, keeping fake-stream is acceptable.

### `@tab` — NOT from scratch ⚠️ [revised]
- `src/services/contentService.js:79` (`getAccessibilityTreeWebpageContent(tabId)`) and `src/entrypoints/background.js:148` (`injectScript(tabId, files)`, `executeFunction(tabId, func, args)`) **already `browser.scripting.executeScript` by `tabId`**. The infra exists.
- Real work: generalize `getPageContent()` to accept a **target tab**, plus handle **page type**, **restricted URLs** (chrome://, store pages, PDFs), and **Firefox optional permissions**. Firefox will continue requesting **`<all_urls>` once**, matching the current implementation; no per-site permission flow is planned.

### Content capture — context source already exists
- `src/stores/summaryStore.svelte.js` — `summaryState.currentContentSource` holds the full page content / transcript **after a summarization flow has captured it** (set at `:409` and `:838`). It is reusable when present, but it is **not guaranteed to exist** when the user opens the panel and chats immediately.
- The source resolver must therefore use a lazy path: **reuse a valid cached snapshot when available; otherwise capture the active tab when the first grounded message is sent**. Persist the resulting source snapshot so later turns do not repeatedly extract the same page unless refresh/staleness policy requires it.

### Tab cache is in-memory only ⚠️ [revised]
- `src/services/tabCacheService.js` — a runtime **`Map`** (`getOrCreateTabState`, `getCurrentTabId`, `getTabsWithSummary`, `tabHasSummary`, `checkAndResetTabState`). Useful for **finding tabs and reusing summaries within the current session only**. It is **NOT** a persistence foundation for conversations — it is wiped on extension reload. `tabId` itself is runtime-only data.

### Prompts
- `src/lib/prompts/systemInstructions.js` — per-content-type system prompts, each hard-coding task + output format. **Split:** tone/principles → thin system prompt; per-task "how to" → the matching built-in skill. Well-tuned; do NOT discard.
- `src/lib/prompts/` also has `builders/`, `templates/`, `modules/` (length/tone/parameter definitions), `utils.js` with `replacePlaceholders` (`__CONTENT__`, `__LANG__`).
- `src/lib/api/api.js` — high-level `summarizeContent(Stream)`, `summarizeChapters(Stream)`, `enhancePrompt`, custom-action handling for analyze/explain/debate/commentAnalysis (user custom-prompt override path already present).

### Deep Dive
- `src/stores/deepDiveStore.svelte.js` — already **opt-in / lazy** generation of 3 questions per summary, per-tab cache aware (`setQuestions`, `updateSummaryContext`). See §6 for how to generalize *without* doubling cost.

### UI
- `src/entrypoints/sidepanel/App.svelte` (~707 lines) — `SummarizeButton`, `ActionButtons`, `ActionButtonsMini`.
- `src/entrypoints/prompt/` — `App.svelte`, `PromptMenu.svelte` (prompt editor → future skill manager).

---

## 5. Context Order & the Display-vs-Model Message Split ⚠️ [revised — this replaces v1's ordering]

v1 mixed "priority" with the actual `messages[]` order, and (worse) put skills + raw documents *inside* displayed message content — which makes a "one-shot" skill leak back in via history on later turns. Corrected model:

**Actual model-message order the assembler emits:**
```
1. system persona (thin, constant)
2. synthetic `user` source-context message ← condensed sources, labeled + delimited
3. chronological history (display messages, user/assistant only)
4. current user turn, expanded from stored refs:
     • skill invocation      (from skillInvocation ref)
     • newly attached docs    (from attachmentRefs)
     • the actual user request
```

**Key separation — display messages ≠ model messages:**
- **Display messages** (what the user sees / what's stored as history): plain user/assistant text. A skill shows as a chip/label; an attachment shows as a chip — the raw block is NOT stored in the message body.
- **Model messages** (what the assembler builds per request, ephemeral): the pipeline expands `skillInvocation` + `attachmentRefs` into real instruction/document blocks **only for the current turn**.
- `messages[]` has no `virtual` role. Conversation-level source context is emitted as a synthetic **`user`** message and is not persisted as display history. Newly attached sources remain inside the expanded current `user` turn.
- This is why one-shot actually stays one-shot: the expansion is transient and never persisted into history.

---

## 6. Storage Model ⚠️ [revised — conversation/message/source split]

Current schema (`src/lib/db/indexedDBService.js`, `DB_VERSION = 9`; stores: summaries, history, tags, backups) is **flat and NOT turn-based**:
```js
{ id, title, url, date, tags,
  summaries: [ {title:'Summary', content:'...'}, {title:'Analyze', content:'...'} ] }
```
`summaries[]` are independent blocks — no `role`, no ordering, no Q&A relationship.

Chat needs **three core stores** (new record types; do not migrate old summary records):

1. **`conversations`** — metadata required to list, sort, rename, archive, tag, and reopen chats.
   ```js
   { id, title, createdAt, updatedAt, archived, tags,
     personaSnapshot, providerId }
   ```
2. **`messages`** — ordered display history. Invocation/attachment metadata belongs on the relevant user message for v1; a separate join store is unnecessary unless later requirements justify it.
   ```js
   { id, conversationId, sequence, role, content, createdAt,
     skillInvocation?, attachmentRefs?: [sourceId], status? }
   ```
   Index at least `conversationId` and `[conversationId, sequence]` (or the IndexedDB-compatible equivalent) so a conversation can be loaded in deterministic order.
3. **`sources`** — immutable condensed snapshots of captured content.
   ```js
   { id, normalizedUrl, url, title, capturedAt, contentHash,
     condensedContent, condensationVersion?, language?, originalLength? }
   ```
   - Preserve provenance when deduplicating. Use **`normalizedUrl + contentHash`** as snapshot identity, rather than `contentHash` alone; identical text from different URLs must not silently become the same attributed source. A later optimization may split source metadata from a shared content-blob registry.
   - `capturedAt` provides an **age/staleness hint**, not proof that a page changed. Actual staleness detection requires recapturing/refetching the accessible page and comparing the new hash. If the page is unavailable, keep using the immutable stored snapshot and label its capture time.
   - **Storing only a URL is not enough** to reopen a chat: the page may have changed or the tab may be closed. `tabId` is runtime-only and useless for persistence.

Archive UI (`src/entrypoints/archive/`) + export/import currently render `summaries[]` — they must be taught the conversation record types (easy-to-miss ripple).

---

## 7. Prompt-Injection Defense 🆕 [new — was entirely missing in v1]

The single most important gap in v1. **Page content and tab titles are untrusted data** — doubly so once `@tab` pulls in arbitrary pages.

Requirements:
- The **thin system prompt must explicitly state** that document/source content and titles are data, **may not change instructions**, and must never be treated as commands.
- The **assembler must delimiter/label every source** (clear boundaries, provenance labels like `--- SOURCE: <title> (untrusted) ---`) and escape or safely encode source-controlled titles/boundary-like text so page content cannot trivially impersonate the wrapper.
- Consider stripping/escaping obvious instruction-like patterns, but the primary defense is structural (labeling + guardrail), not filtering.
- These measures **reduce indirect prompt-injection risk; they do not eliminate it**. Future tools must separately enforce capability boundaries, confirmation for consequential actions, and strict separation between untrusted source text and tool arguments.

---

## 8. Settled Sub-Decisions

| Question | Decision |
|---|---|
| Old action buttons (summarize/analyze) | Become a seeded **user turn** (a skill invocation on turn 1), NOT a system-prompt swap. |
| Where does page content / transcript go? | Into the **current user turn** as an expanded attachment (from a ref), NOT into the system prompt, NOT persisted into message body. |
| User's custom prompts | Keep (back-compat). Migrate per-content-type customs → user skills; introduce a separate new global persona. |
| Persona vs skill precedence | System persona sets the base; one-shot skill *adds* temporary instructions for its turn only; does not erase persona. |
| Firefox content permission | Request **`<all_urls>` once**, as the extension does today. Do not build per-site permission prompts; users who do not trust this scope can decline or remove the open-source extension. |
| Reopening chats | Yes, like ChatGPT/Gemini. Persist `conversations` + `messages` (with inline skill/attachment refs) + immutable `sources` snapshots so grounding survives tab close / page change. |
| Deep Dive Questions | Keep **opt-in / lazy**; do NOT auto-fire an extra AI call after every reply (≈2× cost & rate limit). Cache by `conversationId + assistantMessageId`; cancel a stale generation when the user sends a new message. |

---

## 9. Hardest Parts

1. **Context Pipeline** (§3) — design first.
2. **`@[tabname]`** — infra exists (§4); the work is generalizing `getPageContent()` to a target tab + page-type/restricted-URL handling + **Firefox optional permissions** + **context compression** (attach condensed summaries, not raw).
3. **Context-window budgeting** — the budgeter stage (§3).
4. **Unified AI request object** — refactoring the retry/fallback/stream branches in `aiSdkAdapter.js` to carry `{system, messages, ...}` (§4).
5. **Ollama real streaming** — port-based chunking from background; v1 can defer with fake-stream (§4).
6. **Prompt-injection defense** (§7).
7. **Firefox mobile streaming** — known `flush` bug with existing fallback; apply to chat too.

---

## 10. Suggested Build Order (dependency-driven, NOT a committed plan)

1. **Basic chat + minimal Context Pipeline** (active tab only; unified request object; display-vs-model split; injection guardrail from day one).
2. **Skills / pinned suggestions** — low risk; reuses prompt editor; a skill = seed a turn + inject a markdown block. Migrate per-type custom prompts here.
3. **`@[tabname]`** — once the pipeline takes multiple sources (source resolver + budgeter + permissions).
4. **Memory / knowledge / tools** — additional plug-in sources; tools require capability-tiering providers (function-calling support varies).

Earlier rough effort estimate: basic one-tab chat ≈ 1–2 days; full (all providers incl. real Ollama streaming, persisted conversations, budgeting) ≈ 3–5 days. **Revise upward** given the unified-request refactor and storage split are more than v1 implied.

---

## 11. Open Questions (deferred)

- Skill **lifetime**: v1 all one-shot; when to add `sticky` modes?
- **Multiple skills** stacked vs one active at a time (v1 leans: one, explicit).
- Skill fully **overriding persona** as an advanced mode — allow or not?
- Budgeter: **raw-vs-condensed per source**, or condensed only? (§3 lever)
- Chat mode **coexist with vs replace** old summary/archive UI.

---

## 12. TL;DR for the Next Session

Thin constant system prompt (tone/language/**new** global persona + injection guardrail). Every task = a one-shot **skill** (markdown block; built-in + user; same mechanism; explicit chip/`/command`). Turn 1 = skill opener; turns 2+ = free chat. The backbone is a **Context Pipeline** = `source resolver → budgeter → assembler`, emitting model messages in order `persona → synthetic user source context → history → current user turn(skill + attachments + request)`. The resolver lazily captures the active tab on the first grounded message when no reusable snapshot exists. **Display messages ≠ model messages** — store `skillInvocation`/`attachmentRefs` on user messages and expand them transiently, so one-shot stays one-shot. Storage uses **`conversations` / `messages` / immutable `sources`**, with source identity based on `normalizedUrl + contentHash`; URL alone cannot reopen a chat, and staleness requires recapture before hash comparison. `@tab` reuses existing `executeScript`-by-tabId infra and Firefox continues requesting `<all_urls>` once; the hard parts are budgeting and restricted-page handling, not injection-from-scratch. AI layer needs a **unified request object** through the retry/fallback/stream branches (not a one-param change); `ai@5.0.39` uses `stopWhen`/`stepCountIs`. Ollama streaming is currently fake. Deep Dive stays **opt-in/lazy** (don't 2× the API cost). Treat all page content as **untrusted**; labeling, delimiting, and escaping reduce prompt-injection risk but cannot eliminate it.
