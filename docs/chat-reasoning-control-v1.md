# Chat Reasoning Control — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — do not move on until it passes.

## Context

Summarizerrrr uses AI SDK 7 (`ai@^7.0.22`) and provider packages that implement
the new portable `reasoning` call option. AI SDK accepts these normalized
values on `generateText` and `streamText`:

```text
provider-default | none | minimal | low | medium | high | xhigh
```

The SDK maps those values to each supported provider's native thinking API.
Provider-specific reasoning settings take precedence over the top-level option,
and unsupported providers/models may coerce or ignore a level and emit a
warning. Reference: <https://ai-sdk.dev/docs/ai-sdk-core/reasoning>.

The repository is close to supporting this already:

- [`src/services/chat/chatService.js`](../src/services/chat/chatService.js)
  assembles chat requests and calls `generateContentStreamEnhancedRequest`, but
  it does not currently attach a reasoning preference.
- [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js) forwards extra
  request properties through `...generationOptions`, so a top-level
  `reasoning` value can reach AI SDK without redesigning the adapter contract.
- The same adapter currently injects Gemini-specific
  `providerOptions.google.thinkingConfig` from `geminiThinkingLevel`. *(Amended
  2026-07-14: the legacy `geminiAdvancedThinkingLevel` has since been folded
  into `geminiThinkingLevel` and deleted in `settingsSchema.js`, so only
  `geminiThinkingLevel` remains at runtime — the Phase 1 step 4 suppression
  guard only needs to touch that one field.)* Per AI SDK precedence rules, that
  provider option would override a chat-level portable `reasoning` setting
  unless the adapter explicitly suppresses the old Gemini setting for chat
  requests.
- [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js) imports the
  official OpenRouter provider but currently builds OpenRouter, Groq, and
  Cerebras models through the generic OpenAI-compatible provider even though
  their official provider packages are already installed. Native providers are
  preferable for correct request mapping, warnings, and structured reasoning
  response parsing.
- [`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js) already
  owns independent per-tab composer state. The reasoning choice belongs there
  so switching browser tabs does not leak one tab's choice into another.
- [`src/lib/db/conversationRepository.js`](../src/lib/db/conversationRepository.js)
  stores extensible message records. A `reasoningLevel` snapshot can be added to
  user messages without an IndexedDB version bump; export/import already
  preserves additional message properties through object spread.
- [`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)
  has room beside the Send button for a compact selector.
- **Amended 2026-07-14:** the OpenAI-compatible provider is no longer a single
  static id. After `docs/openai-compatible-multi-profile-v1.md` landed,
  `openaiCompatible` is a repeatable **template** and real conversations /
  `settings.chat.provider` carry dynamic profile ids such as
  `openai-compatible-<uuid>` or `openai-compatible-legacy`. Every provider-id
  branch in this plan must therefore treat any
  `isOpenAICompatibleProfileId(id)` (from
  [`src/lib/providers/openAICompatibleProfiles.js`](../src/lib/providers/openAICompatibleProfiles.js))
  — and the bare `openaiCompatible` template — as the `openaiCompatible` row
  (Auto-only, no override). Note that the registry's `normalizeProviderId`
  returns profile ids **unchanged**, so it is *not* sufficient on its own for
  this collapse; use `isOpenAICompatibleProfileId` (or an entry's
  `capabilityProviderId`) explicitly.
- Streaming currently consumes only `result.textStream`, and
  [`src/lib/chat/contextPipeline/contextAssembler.js`](../src/lib/chat/contextPipeline/contextAssembler.js)
  reconstructs history as plain `{ role, content }` messages. Therefore the
  model's returned reasoning text/parts are neither displayed nor preserved.
  That is a separate feature from controlling reasoning effort.

### Goal & scope decision

- V1 adds **reasoning effort control only**. It does not display, persist, or
  replay chain-of-thought/reasoning content.
- The composer exposes four product-facing choices:
  **Auto**, **Low**, **Medium**, and **High**. Map Auto to
  `provider-default`. Do not expose `none`, `minimal`, or `xhigh` in V1 because
  model support for those values is inconsistent.
- The selection is per browser-tab chat runtime and defaults to Auto. It does
  not become a global Summary setting.
- **Amended 2026-07-14:** a global *default* for the per-tab selector lives in
  `settings.chat.defaultReasoningLevel` (introduced by
  [`docs/provider-settings-restructure-v1.md`](provider-settings-restructure-v1.md);
  its settings UI ships with
  [`docs/chat-model-quick-select-v1.md`](chat-model-quick-select-v1.md)). Tab
  sessions store a `null` sentinel and resolve the effective level from the
  setting **at read time**, never at session-creation time — the chat store is
  evaluated at module import, before `loadSettings()` completes. See Phase 3
  step 1. *(Amended 2026-07-14: `settings.chat.defaultReasoningLevel` now exists
  in `DEFAULT_SETTINGS` with value `'provider-default'`, so this dependency is
  satisfied — the optional-chaining reads are now defensive rather than a
  compatibility requirement. The `null`-sentinel + read-time resolution design
  must still ship, because the cold-start ordering issue is unchanged.)*
- Snapshot the selected level on each persisted user message. Retry,
  Regenerate, and Continue must reuse the originating turn's snapshot. Edited
  user messages form a new branch and snapshot the selector's current value.
- Use top-level AI SDK `reasoning` for providers with portable support. Keep a
  small provider-specific mapper only where the provider API requires it,
  notably OpenRouter and Cerebras.
- Preserve all existing Summary behavior. Summary calls that do not explicitly
  provide `reasoning` must continue using the existing Gemini thinking-level
  settings.
- Use the official Groq, OpenRouter, and Cerebras providers already present in
  `package.json`; add no dependencies and do not change API-key storage.
- For `openaiCompatible` and `lmstudio`, V1 shows Auto only because reasoning
  support depends on the user-selected server and model. A future capability
  discovery feature can unlock additional levels safely.

## Provider strategy for V1

Centralize this policy in a small new module such as
[`src/lib/chat/reasoningConfig.js`](../src/lib/chat/reasoningConfig.js). Do not
scatter provider checks through Svelte components and the service layer.

| App provider id | V1 request strategy | UI levels |
| --- | --- | --- |
| `gemini` | AI SDK top-level `reasoning` | Auto/Low/Medium/High |
| `openai`, `chatgpt` | AI SDK top-level `reasoning` | Auto/Low/Medium/High |
| `deepseek` | AI SDK top-level `reasoning` | Auto/Low/Medium/High |
| `groq` | Official `@ai-sdk/groq`, top-level `reasoning` | Auto/Low/Medium/High |
| `ollama` | `ai-sdk-ollama` top-level mapping to `think` | Auto/Low/Medium/High |
| `openrouter` | `providerOptions.openrouter.reasoning.effort` | Auto/Low/Medium/High |
| `cerebras` | `providerOptions.cerebras.reasoningEffort` | Auto/Low/Medium/High |
| `openaiCompatible`, `lmstudio` | Do not send a reasoning override in V1 | Auto only |

*(Amended 2026-07-14)* The `openaiCompatible` row covers **all dynamic profile
ids** — any `isOpenAICompatibleProfileId(id)` (e.g. `openai-compatible-legacy`,
`openai-compatible-<uuid>`) as well as the bare `openaiCompatible` template.
Map them to this row explicitly; do not rely on the unknown-provider fallback,
so the selector deterministically shows Auto for profiles and future model
metadata can refine it safely.

OpenRouter model metadata may eventually provide `supported_efforts`,
`default_effort`, and `mandatory`; using that metadata to narrow the selector is
useful follow-up work but is not required for this basic V1.

## Phase 1 — Normalize provider routing and reasoning request mapping

1. In [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js):
   - Replace the generic Groq model creation with `createGroq` from
     `@ai-sdk/groq`.
   - Use the already-imported `createOpenRouter` for OpenRouter.
   - Replace generic Cerebras model creation with `createCerebras` from
     `@ai-sdk/cerebras`.
   - Keep the same provider ids, base URLs where configurable, API keys, and
     selected-model settings so no caller or stored setting changes shape.
   - **Note** *(amended 2026-07-14)*: `getAISDKModel()` is shared by **Summary
     and Chat**, so switching Groq/OpenRouter/Cerebras to their official
     providers changes request construction for Summary too. This is a routing
     refactor bundled into the reasoning feature — treat it as a regression
     surface and cover it in Phase 4 verification (not just Gemini).
2. Create `src/lib/chat/reasoningConfig.js` with pure, unit-testable helpers:
   - A constant list of UI choices (`provider-default`, `low`, `medium`,
     `high`) with labels and short descriptions.
   - `normalizeChatReasoningLevel(value)` returning `provider-default` for
     missing/invalid values.
   - `getChatReasoningOptions(providerId, modelId)` returning the allowed UI
     choices. V1 may be provider-level; accept `modelId` now so later model
     metadata can refine it without changing callers.
     **Normalize the incoming id first** *(amended 2026-07-14)*: conversations
     and feature settings may carry `geminiAdvanced` (and legacy records may
     carry `openai`) — map `geminiAdvanced` → the `gemini` row and `openai` →
     `chatgpt` before the table lookup (via the provider registry's
     `normalizeProviderId`/`adapterId`, else a local two-entry map). Without
     this, a Gemini Advanced chat would fall through to the unsupported-provider
     branch and the selector would wrongly become Auto-only. **Also collapse
     dynamic OpenAI-compatible profile ids** *(amended 2026-07-14)*: any
     `isOpenAICompatibleProfileId(id)` (from
     [`src/lib/providers/openAICompatibleProfiles.js`](../src/lib/providers/openAICompatibleProfiles.js))
     must map to the `openaiCompatible` row. Do **not** use `normalizeProviderId`
     for this collapse — it returns profile ids unchanged; check
     `isOpenAICompatibleProfileId` explicitly (or resolve the entry's
     `capabilityProviderId`).
   - `buildReasoningRequestOptions(providerId, level)` returning one of:
     - `{ reasoning: level }` for portable providers;
     - `{ providerOptions: { openrouter: { reasoning: { effort: level } } } }`
       for non-Auto OpenRouter choices;
     - `{ providerOptions: { cerebras: { reasoningEffort: level } } }` for
       non-Auto Cerebras choices;
     - `{}` for Auto on provider-specific paths and for unsupported providers.
     Apply the same `geminiAdvanced`/`openai` **and dynamic OpenAI-compatible
     profile-id** normalization here as in `getChatReasoningOptions`, so a
     profile id resolves to the `openaiCompatible` (Auto-only, `{}`) branch.
3. Ensure provider options produced by the mapper merge with any unrelated
   caller options rather than replacing them. Reasoning-specific values should
   be the only keys controlled by this module.
4. In both blocking and streaming paths of `aiSdkAdapter.js`, change Gemini's
   automatic thinking-option construction as follows:
   - If the normalized request explicitly contains a top-level `reasoning`
     property, do not inject `thinkingLevel` or `thinkingBudget` from settings.
   - If it does not contain `reasoning`, preserve the current behavior exactly
     for Summary and other legacy callers.
   - `provider-default` still counts as explicit; it means the chat requested
     the provider default rather than the Summary setting.

**Verify:** Add focused tests in
[`tests/chat/reasoningConfig.test.js`](../tests/chat/reasoningConfig.test.js)
for every provider row and level normalization. Extend
[`tests/chat/aiSdkAdapter.test.js`](../tests/chat/aiSdkAdapter.test.js) to prove
that explicit reasoning reaches `streamText`, suppresses Gemini's injected
thinking effort, and that a legacy request without reasoning still receives the
existing Gemini thinking option. Run:

```bash
npx vitest run tests/chat/reasoningConfig.test.js tests/chat/aiSdkAdapter.test.js
```

## Phase 2 — Snapshot reasoning per user turn and reuse it consistently

1. Extend the JSDoc contracts in
   [`src/lib/chat/contracts.js`](../src/lib/chat/contracts.js):
   - `GenerationRequest` can carry the AI SDK top-level `reasoning` field.
   - `ConversationMessageRecord` user messages may carry
     `reasoningLevel` using the four V1 values.
2. In [`src/services/chat/chatService.js`](../src/services/chat/chatService.js):
   - Let `send` accept `reasoningLevel`, normalize it, and persist it on the new
     user message.
   - In `runGeneration`, read `currentUserMessage.reasoningLevel`, fall back to
     `provider-default` for old records, call
     `buildReasoningRequestOptions`, and merge the result into the normalized
     stream request. *(Amended 2026-07-14)* Key `buildReasoningRequestOptions`
     on the **`resolvedAdapterId` returned by `resolveAdapterCall(...)`** (the
     value already passed to `streamRequest`), not the raw
     `conversation.providerId` — `resolveAdapterCall` has already collapsed a
     dynamic OpenAI-compatible profile id to the base `openaiCompatible` adapter
     id, which correctly resolves to the Auto-only (`{}`) branch. Merge the
     mapped options into the same `streamRequest({...})` object.
   - Because Retry and Regenerate already recover `currentUserMessage` from the
     repository, they should automatically reuse the original snapshot rather
     than accepting a new level.
   - Continue should reuse the same originating user turn's level.
   - Let `edit` accept the currently selected level and store it on the new user
     sibling created for the edited branch.
3. Do not put reasoning content on assistant messages in V1. Optionally persist
   the applied `reasoningLevel` on the assistant record only if it materially
   helps diagnostics, but the user-turn snapshot remains the source of truth.
4. Keep older backups compatible: missing `reasoningLevel` means Auto. Do not
   bump `CONVERSATION_BUNDLE_SCHEMA_VERSION` or the IndexedDB version for this
   additive property.

**Verify:** Extend
[`tests/chat/chatService.test.js`](../tests/chat/chatService.test.js) to assert:

- Send persists the normalized level and passes the correct request options.
- Invalid/missing values become `provider-default`.
- Retry and Regenerate reuse the stored level even if the current UI level has
  changed.
- Edit snapshots the newly selected level.
- Existing messages without the field still generate successfully.

Run:

```bash
npx vitest run tests/chat/chatService.test.js tests/chat/messageGraphPhase2.test.js tests/chat/messageGraphPhase3.test.js tests/chat/messageGraphPhase4.test.js
```

## Phase 3 — Add the per-tab Svelte 5 composer control

1. Add `reasoningLevel: null` to `createChatSessionState()` in
   [`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js)
   *(amended 2026-07-14; was a hardcoded `'provider-default'`)*. `null` is a
   sentinel meaning "the user has not chosen for this tab yet" — it must
   **not** be resolved at session-creation time. The module initializes
   `chatState = $state(createChatSessionState())` at import time, and the
   side panel evaluates `App.svelte` and its full dependency graph **before**
   `startup()` runs `await loadSettings()`
   ([`src/entrypoints/sidepanel/main.js`](../src/entrypoints/sidepanel/main.js)),
   so any value read from settings at creation time is the compile-time
   default — a user whose saved default is `high` would cold-start on Auto.
   Instead, add `effectiveReasoningLevel(level, settings)` to
   `reasoningConfig.js`:
   `level ?? normalizeChatReasoningLevel(settings.chat?.defaultReasoningLevel)`
   (optional chaining keeps this working whether or not the
   provider-settings-restructure plan has landed). Resolve through it at every
   **read** point: the selector's displayed value, and the snapshot taken in
   `sendChatMessage`/`edit`. The selector's `onchange` writes a concrete level
   into the session, replacing the sentinel for that tab.
   Existing `SESSION_KEYS`, `stashViewInto`, and `projectSessionToView` will then
   carry it between the reactive active view and plain inactive-tab snapshots.
2. In `sendChatMessage`, snapshot
   `effectiveReasoningLevel(session.reasoningLevel, settings)` (resolving the
   `null` sentinel against `settings.chat?.defaultReasoningLevel`) and pass it
   to `chatService.send`. In `editChatMessage`, pass the same resolved value to
   `chatService.edit`. Do not pass the current value into Retry, Regenerate, or
   Continue because those paths must use their stored user-turn snapshot.
3. Create
   [`src/components/chat/ChatReasoningSelect.svelte`](../src/components/chat/ChatReasoningSelect.svelte):
   - Follow the existing Svelte 5 callback-prop and `DropdownMenu` pattern in
     [`src/components/chat/ConversationMenu.svelte`](../src/components/chat/ConversationMenu.svelte).
   - Accept `value`, `options`, `disabled`, and `onchange` props.
   - Use a compact trigger (spark/brain icon plus current label), keyboard
     navigation supplied by `bits-ui`, visible focus styles, and an accessible
     label such as `Reasoning effort: Medium`.
   - Show a short latency/cost description for each option. Avoid language that
     promises better answers for every model.
4. Mount the selector inside
   [`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)
   beside the Send button. Derive the options from the current conversation's
   `providerId`/`modelId` via `getChatReasoningOptions`; fall back to the current
   selected provider/model before a conversation exists.
5. If a provider switch or restored conversation reduces the allowed options
   and the current value is no longer valid, normalize it back to Auto in a
   narrow `$effect`. Do not use `$effect` for values that can be expressed as
   `$derived`.
6. Disable the selector while a generation is active so the visible value
   cannot imply that an in-flight request changed mid-stream.

**Verify:** Add a component test at
[`tests/chat/composer/ChatReasoningSelect.test.svelte.js`](../tests/chat/composer/ChatReasoningSelect.test.svelte.js)
covering labels, selection callback, disabled state, and keyboard/accessibility
behavior. Extend
[`tests/chat/chatStoreTabs.test.js`](../tests/chat/chatStoreTabs.test.js) to
show that two browser tabs retain independent reasoning selections, plus a
**cold-start test** *(amended 2026-07-14)*: with a persisted
`settings.chat.defaultReasoningLevel: 'high'` loaded *after* the chat store
module was imported (sessions created with the `null` sentinel), the selector
displays High and the first `send` snapshots `'high'` — not Auto. Run:

```bash
npx vitest run tests/chat/composer/ChatReasoningSelect.test.svelte.js tests/chat/chatStoreTabs.test.js
npm check
```

Then manually open the side-panel chat, switch between two browser tabs, set
different reasoning levels, switch back and forth, and confirm each tab retains
its own value.

## Phase 4 — Surface safe diagnostics and complete regression verification

1. Inspect AI SDK warnings returned by `streamText`. At minimum, log a concise
   development warning with provider/model/selected level when AI SDK reports
   reasoning coercion or unsupported reasoning. Do not expose raw provider
   payloads or API keys.
2. **Required, not best-effort** *(amended 2026-07-14)*: include normalized
   reasoning warnings in the enhanced stream's final completion-metadata event
   and merge them into the chat's existing `contextWarnings` — the final
   checklist demands a useful warning, so this behavior must ship and be
   tested, not attempted "if possible". Extend the metadata event additively
   (new optional field) so existing callers that ignore it keep working. Keep
   reasoning warnings distinct in text, e.g. “High reasoning is not supported
   by this model; the provider used Medium.” Add a test asserting that a
   mocked AI SDK reasoning-coercion warning surfaces in the completion
   metadata and lands in `contextWarnings`.
3. Confirm Summary generation remains unchanged for both Gemini Basic and
   Advanced settings, including streaming, fallback models, and API-key retry.
   **Also regression-test Summary through Groq, OpenRouter, and Cerebras**
   *(amended 2026-07-14)*, since Phase 1 swaps their model construction to the
   official providers and `getAISDKModel()` is shared with Summary.
4. Confirm the control does not alter temperature/top-p handling for GPT-5/o*
   models and does not break Firefox mobile's existing streaming fallback.

**Verify:** Run the complete automated and build checks:

```bash
npm test
npm check
npm run build
npm run build:firefox
git diff --check
```

Manual provider smoke test matrix:

- Gemini: Auto and High both complete; Summary still honors its existing
  Gemini thinking setting.
- ChatGPT/OpenAI: Low and High requests complete on a reasoning-capable model.
- DeepSeek: Auto and High complete on a reasoning-capable model.
- Groq: official provider model creation and a supported reasoning model work.
- OpenRouter: inspect the request body and confirm
  `reasoning: { effort: "high" }`, not `reasoning_effort`.
- Ollama: a supported model maps Low/Medium/High to its native `think` option;
  unsupported models continue to respond normally. **Verify first** *(amended
  2026-07-14)* that the reasoning/`think` option actually propagates through the
  background CORS proxy wrapper (`ollamaProxyModel.js`) rather than being
  dropped with the rest of `generationOptions`. If the proxy does not forward
  it, downgrade Ollama to **Auto-only** for V1 (update the provider table and
  `getChatReasoningOptions`) instead of silently sending an ignored override.
- Cerebras: a reasoning-capable model receives `reasoningEffort` through the
  official provider.
- LM Studio/custom compatible: selector is Auto-only and no reasoning override
  is sent.

## Out of scope (V1)

- Displaying reasoning text in a collapsible message section.
- Persisting AI SDK reasoning parts, signatures, encrypted reasoning details,
  or reasoning files in IndexedDB.
- Replaying reasoning parts through
  `contextPipeline/contextAssembler.js` on later turns.
- Switching the chat stream from `textStream` to `fullStream`/`stream`.
- Showing reasoning-token counts separately in the message usage label.
- Exposing exact token budgets or provider-only levels such as `none`,
  `minimal`, `xhigh`, or `max`.
- Dynamically fetching per-model reasoning capabilities, except for reusing
  metadata that is already locally available without expanding this feature.
- Applying the Chat selector to Summary, Deep Dive, custom actions, or other
  generation surfaces.

If reasoning display is planned later, treat it as a separate V2: consume
reasoning stream events, add a separate `reasoningContent`/structured parts
field, render it independently from answer markdown, decide retention/privacy
policy, and preserve signed reasoning details where providers require them.

## Final verification checklist

- [ ] Composer shows Auto/Low/Medium/High only for V1-supported providers —
      including when the conversation carries `geminiAdvanced` (normalized to
      the Gemini row, not Auto-only).
- [ ] Cold start with a persisted non-Auto default: selector shows it and the
      first send snapshots it (null-sentinel resolution, not import-time seed).
- [ ] LM Studio and every OpenAI-compatible profile (dynamic
      `openai-compatible-*` ids and the `openaiCompatible` template) remain
      Auto-only.
- [ ] Summary still works through Groq/OpenRouter/Cerebras after the official-
      provider swap (shared `getAISDKModel()`).
- [ ] Reasoning selection is isolated per browser tab.
- [ ] New user messages persist a normalized `reasoningLevel` snapshot.
- [ ] Retry, Regenerate, and Continue reuse the original user-turn snapshot.
- [ ] Edit creates a new branch using the currently selected level.
- [ ] Explicit chat reasoning overrides Gemini's legacy thinking setting, while
      Summary calls without reasoning preserve existing behavior.
- [ ] OpenRouter sends its native `reasoning.effort` object.
- [ ] Unsupported/coerced levels fail safely and produce a useful warning.
- [ ] Existing conversations and backups without `reasoningLevel` still load.
- [ ] `npm test`, `npm check`, Chrome build, and Firefox build all pass.
- [ ] No reasoning content or API credentials are logged or persisted.
- [ ] `git diff --check` passes and unrelated working-tree changes are untouched.

## Notable files

- `src/lib/chat/reasoningConfig.js` — new central provider/level policy and
  request-option mapper.
- `src/lib/api/aiSdkAdapter.js` — official provider construction, Gemini
  precedence fix, and AI SDK warning capture.
- `src/services/chat/chatService.js` — persist the user-turn level and attach
  mapped reasoning options to generation requests.
- `src/stores/chatStore.svelte.js` — per-tab reasoning selector state and send/
  edit wiring.
- `src/components/chat/ChatReasoningSelect.svelte` — new accessible compact
  selector.
- `src/components/chat/ChatComposer.svelte` — mounts the selector beside Send.
- `src/lib/chat/contracts.js` — documents the additive request/message fields.
- `tests/chat/reasoningConfig.test.js` — provider mapping and normalization.
- `tests/chat/aiSdkAdapter.test.js` — forwarding and Gemini precedence
  regression coverage.
- `tests/chat/chatService.test.js` — snapshot and replay semantics.
- `tests/chat/chatStoreTabs.test.js` and
  `tests/chat/composer/ChatReasoningSelect.test.svelte.js` — per-tab state and UI
  behavior.
