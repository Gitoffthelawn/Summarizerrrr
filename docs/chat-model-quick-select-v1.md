---
type: plan
status: planned
---

# Chat Model Quick Select — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — do not move on until it passes.
>
> **Dependencies (already landed):** the provider-settings restructure and the
> OpenAI-compatible multi-profile work are both merged. This plan builds on the
> shipped primitives — do **not** re-implement them:
> - `settings.chat.{provider,model,quickModels,defaultReasoningLevel}` exist in
>   `DEFAULT_SETTINGS`.
> - `src/lib/providers/providerRegistry.js` exposes `resolveProviderEntry`,
>   `resolveAdapterCall(featureProviderId, modelId, settings)`,
>   `getDefaultModel(id, settings)`, `getLegacyModel(id, settings)`,
>   `normalizeProviderId`, and `capabilityProviderId` on entries.
> - `src/lib/providers/featureModelResolver.js` exposes
>   `resolveFeatureModel(feature, settings)`.
> - `settingsStore` exposes `updateFeatureSettings(feature, patch)`.
> - `conversationRepository.updateConversationMetadata(id, { providerId, modelId })`.
> - OpenAI-compatible providers are **dynamic profiles**: real conversations and
>   `settings.chat.provider` carry ids such as `openai-compatible-<uuid>` /
>   `openai-compatible-legacy`, not the static `openaiCompatible`.
>
> **Soft dependency on** [`docs/chat-reasoning-control-v1.md`](chat-reasoning-control-v1.md):
> if the reasoning selector already exists, mount the model switcher to its
> left; if not, mount the switcher alone — nothing here blocks on it.

## Context

Chat already has a default provider/model in `settings.chat`, and the request
pipeline already honors a per-conversation model. What is missing is the
**switching UX** and one **fallback-correctness gap**:

- **The per-conversation model is already honored at request time.**
  [`chatService.js`](../src/services/chat/chatService.js) computes
  `conversationModelId = conversation.modelId || fallbackModelId` and passes it
  to `resolveAdapterCall(conversationProviderId, conversationModelId, settings)`,
  which injects the model into a request-local settings overlay
  (`selectedChatgptModel`, `selectedOpenAICompatibleModel`, etc.). `getAISDKModel`
  then reads it. **No new adapter `modelId` parameter is needed** — routing goes
  through the existing overlay. *(This supersedes older drafts that treated
  "adapter ignores `conversation.modelId`" as a live bug; it was fixed by the
  restructure.)*
- **But the model fallback is not provider-independent.** `fallbackModelId`
  comes from `resolveFeatureModel('chat', settings)`, i.e. `settings.chat`'s
  model. So a conversation with `providerId: 'cerebras'`, `modelId: null` (e.g.
  created before a model was ever stamped) falls back to **`settings.chat`'s
  model**, which may belong to a *different* provider (say Gemini). The stored
  provider must instead fall back to **its own** legacy/default model.
- **There is no Gemini "Advanced" runtime split anymore.** The registry has a
  single `gemini` entry (`legacyModelField: 'selectedGeminiModel'`); the adapter
  has no `isAdvancedMode` branch and no `selectedGeminiAdvancedModel`/
  `geminiAdvancedApiKey`. `geminiAdvanced` survives only as a legacy id that
  `normalizeProviderId` maps to `gemini`. This plan therefore needs **no**
  Basic-vs-Advanced collapse handling.
- The composer
  ([`ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)) has no
  model display; the only bottom-right control is the round Send/Stop button.
- Per-tab chat state lives in
  [`chatStore.svelte.js`](../src/stores/chatStore.svelte.js) —
  `createChatSessionState()` + `SESSION_KEYS` + `stashViewInto`/
  `projectSessionToView` automatically carry any new session key between the
  active reactive view and inactive-tab snapshots.
- `settings.chat.quickModels` and `settings.chat.defaultReasoningLevel` already
  exist as **data** (defaults `[]` and `'provider-default'`); no management UI
  exists yet.

This plan delivers: (1) provider-independent conversation-model resolution,
(2) a compact model switcher in the composer fed by a user-curated **quick
models** list, (3) the quick-models manager and a **default reasoning level**
control in Chat settings.

### Goal & scope decision (confirmed with user)

- Quick model switcher lives **in the composer**, beside the Send button (left
  of the reasoning selector when that exists).
- Switching applies to the **active conversation immediately** (persisted via
  `updateConversationMetadata`) and to future messages; before a conversation
  exists it is a per-tab pending override.
- Quick list is managed in Chat settings via an "add current model" affordance;
  capped at 6 entries, global (not per tab).
- Default reasoning level is a Chat setting (`chat.defaultReasoningLevel`) that
  seeds the per-tab reasoning selector from the reasoning-control plan; it does
  not affect Summary.
- Provider ids (including dynamic `openai-compatible-*` profile ids) are stored
  as-is on conversations and quick-model records; only the adapter call collapses
  them, via the existing `resolveAdapterCall`.
- No new dependencies; no IndexedDB version bump (`providerId`/`modelId` fields
  already exist on conversation records).

## Phase 1 — Lock the model-routing foundation (verification, no adapter contract change)

The adapter already honors an explicit per-conversation model through the
`resolveAdapterCall` settings overlay, so **do not** add a `modelId`/
`featureProviderId` parameter to the adapter request contract. Instead, prove
and lock the existing behavior so later phases and future refactors cannot
regress it.

1. Confirm in [`aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js) that
   `getAISDKModel` / `getDisplayModelName` derive the model from
   `settings.selected*Model` (or, for profiles, `selectedOpenAICompatibleModel`),
   which `resolveAdapterCall` sets from the passed `modelId`. No code change is
   expected here; if a change *is* needed, keep it to reading the overlaid
   settings — never bypass the overlay.
2. Confirm Gemini auto-fallback seeds its chain from the overlaid
   `selectedGeminiModel` (already the case). No change expected.

**Verify:** extend
[`tests/chat/aiSdkAdapter.test.js`](../tests/chat/aiSdkAdapter.test.js) to lock
the contract:

- an explicit model, supplied via `resolveAdapterCall(providerId, modelId,
  settings)`, reaches `streamText`/`generateText` as the constructed model and
  is reflected by `getDisplayModelName`;
- for a dynamic `openai-compatible-*` profile id, `resolveAdapterCall` collapses
  to the `openaiCompatible` adapter and the overlay carries the profile's key,
  base URL, and `selectedOpenAICompatibleModel === modelId`;
- an explicit reasoning-capable chatgpt model still triggers the GPT-5/o*
  temperature-skip path in `mapGenerationConfig`;
- a call **without** an explicit model (Summary path) produces byte-for-byte the
  same model/config as before.

```bash
npx vitest run tests/chat/aiSdkAdapter.test.js
```

## Phase 2 — Provider-independent conversation-model resolution

1. In [`chatService.js`](../src/services/chat/chatService.js) add
   `resolveConversationModel(conversation, settings)`. Provider and model fall
   back **independently** — a stored provider must never be swapped out just
   because the model snapshot is missing, and a stored provider's missing model
   must resolve to *that provider's* default, not `settings.chat`'s model:

   ```js
   function resolveConversationModel(conversation, settings) {
     const chatFallback = resolveFeatureModel('chat', settings)
     const providerId = conversation?.providerId || chatFallback.providerId

     let modelId
     if (conversation?.modelId) {
       modelId = conversation.modelId
     } else if (conversation?.providerId) {
       // Stored provider, no stored model → use THIS provider's own model.
       // getLegacyModel returns null for dynamic profiles; getDefaultModel is
       // profile-aware (needs `settings`) and returns the profile's defaultModel.
       modelId =
         getLegacyModel(conversation.providerId, settings) ||
         getDefaultModel(conversation.providerId, settings) ||
         chatFallback.modelId
     } else {
       modelId = chatFallback.modelId
     }
     return { providerId, modelId }
   }
   ```

   Pass `settings` everywhere (older drafts called `getDefaultModel(id)` without
   it — that returns `null` for dynamic profiles and is wrong).
2. Wire it into **both** generation paths (`runGeneration`/`send` and
   `continueResponse`). It replaces the current
   `conversation.modelId || fallbackModelId` derivation as the source of
   `{ conversationProviderId, conversationModelId }`. Keep the existing
   **deleted-profile guard** that runs first (when
   `isOpenAICompatibleProfileId(conversationProviderId)` resolves to no profile,
   it already repairs to the Chat fallback, updates conversation metadata, and
   emits an `onWarnings` message) — `resolveConversationModel` complements it,
   it does not replace it. Feed the resolved `{ providerId, modelId }` into the
   existing `resolveAdapterCall(...)` call unchanged.
3. Capability lookups are already correct: chatService derives
   `capabilityProviderId` from `resolveProviderEntry(conversationProviderId,
   settings)?.capabilityProviderId`, which maps dynamic profiles to
   `openaiCompatible` and legacy `geminiAdvanced` to `gemini`. Just ensure the
   provider id it uses is `resolveConversationModel`'s `providerId`.
4. `startConversationForActiveTab({ settings, modelOverride })`: accept an
   optional `{ provider, model }` override that wins over `settings.chat` when
   stamping the new conversation's `providerId`/`modelId`.

**Verify:** extend
[`tests/chat/chatService.test.js`](../tests/chat/chatService.test.js):

- `conversation.modelId` wins over `settings.chat.model` and reaches
  `resolveAdapterCall`/`streamRequest` as the model;
- a conversation with `providerId: 'cerebras'`, `modelId: null` **stays on
  cerebras** with the cerebras legacy/default model — provider is not swapped to
  `settings.chat.provider`, and the model is not `settings.chat.model`;
- a conversation with `providerId: 'openai-compatible-<uuid>'`, `modelId: null`
  resolves to that profile's `defaultModel` (profile-aware fallback);
- a conversation with no stored provider at all falls back to
  `settings.chat.provider/model`;
- switching a conversation's model mid-conversation affects the next generation.

```bash
npx vitest run tests/chat/chatService.test.js
```

## Phase 3 — Per-tab switcher UI + Chat settings (quick models, default reasoning)

1. **chatStore** ([`chatStore.svelte.js`](../src/stores/chatStore.svelte.js)):
   - Add `modelOverride: null` (`{ provider, model } | null`) to
     `createChatSessionState()` — `SESSION_KEYS`/`stashViewInto`/
     `projectSessionToView` carry it per tab automatically.
   - New exported `setChatModel({ provider, model })`:
     - active conversation → `await conversationRepository.updateConversationMetadata(conversation.id, { providerId: provider, modelId: model })`,
       then update the in-view `conversation` object and the owning session
       snapshot via the existing `writeSession` helper;
     - no conversation yet → set the session's `modelOverride`;
       `startConversationForActiveTab` consumes and clears it (Phase 2 §4);
     - no-op while `isSending` (the UI also disables the trigger).
   - Expose a `$derived`-style getter for the current effective
     `{ provider, model }` (conversation → `modelOverride` → `settings.chat`) for
     the switcher trigger label.
2. **`src/components/chat/ChatModelSelect.svelte`** (new):
   - bits-ui `DropdownMenu` following the pattern in
     [`ConversationMenu.svelte`](../src/components/chat/ConversationMenu.svelte);
     compact trigger like the deepdive
     [`ChatProviderSelect.svelte`](../src/components/tools/deepdive/ChatProviderSelect.svelte)
     (provider icon + truncated model name; accessible label "Chat model:
     {model}").
   - Resolve every entry's label/icon through
     `resolveProviderEntry(provider, settings)` so dynamic profiles show their
     profile name; if an entry's provider is unconfigured or its profile was
     deleted (`resolveProviderEntry` → `null`), render it in a warning state
     rather than crashing.
   - Menu items, in order: **Default** (`settings.chat.provider/model`, labeled
     as default) → each `settings.chat.quickModels` entry → the conversation's
     current pair if it is in neither group → separator → **Manage models…**
     which opens Settings > Chat (reuse the existing open-settings pathway used
     elsewhere in the side panel).
   - Selecting an item calls `setChatModel`. Checkmark on the effective pair.
     Disabled while `chatState.isSending`.
3. **Mount in the composer**
   ([`ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)): place
   `ChatModelSelect` in the bottom action area beside the Send/Stop button —
   left of `ChatReasoningSelect` if the reasoning-control plan has landed,
   otherwise alone.
4. **Chat settings** (`src/components/settings/ChatSettings.svelte`):
   - The "Chat model" `FeatureModelPicker` (from the restructure plan) gains an
     **"Add to quick models"** button: appends the picker's current
     `{ provider, model }` to `settings.chat.quickModels` (dedup by
     provider+model, cap 6, disable the button when full or duplicate). The
     provider may be a dynamic `openai-compatible-*` id — store it as-is.
   - **All `chat` block writes** (`quickModels`, `defaultReasoningLevel`, the
     picker's provider/model) go through `updateFeatureSettings('chat', patch)`
     — `updateSettings` shallow-merges top-level keys, so writing a partial
     `{ chat: { quickModels } }` directly would clobber the block's other
     subfields.
   - Render `quickModels` as removable chips (provider/profile icon + model name
     + ✕), resolving labels via `resolveProviderEntry`.
   - **Default reasoning** row: ButtonSet with Auto/Low/Medium/High writing
     `chat.defaultReasoningLevel` (`'provider-default' | 'low' | 'medium' |
     'high'`; import labels from `src/lib/chat/reasoningConfig.js` if the
     reasoning-control plan has landed, otherwise define the four labels locally
     and leave a note to consolidate). Per the amended
     `chat-reasoning-control-v1.md`, this value seeds each tab's `reasoningLevel`;
     until that plan lands the control is stored but inert — that is expected.
   - i18n: add all new strings to the 8 locale files in `src/lib/locales/`.

**Verify:** extend
[`tests/chat/chatStoreTabs.test.js`](../tests/chat/chatStoreTabs.test.js):

- two browser tabs keep independent `modelOverride` values;
- `setChatModel` with an active conversation persists via
  `updateConversationMetadata` and updates the view;
- `setChatModel` before a conversation stores the override, and starting a
  conversation consumes it.

Add a component test
`tests/chat/composer/ChatModelSelect.test.svelte.js` (menu contents order,
selection callback, dynamic-profile label, disabled-while-sending).

```bash
npx vitest run tests/chat/chatStoreTabs.test.js tests/chat/composer/ChatModelSelect.test.svelte.js
npm check
```

Manual: side-panel chat on two browser tabs — set different models before any
conversation exists, confirm each tab keeps its own; start conversations and
confirm the stamped models differ.

## Phase 4 — Regression and smoke matrix

1. Full checks:

```bash
npm test
npm check
npm run build
npm run build:firefox
git diff --check
```

2. Manual smoke on `.output/chrome`:
   - Mid-conversation switch: start a chat on the default model, switch to a
     quick model, send again — **inspect the network request body and confirm
     the model actually changed** (core acceptance test).
   - Old conversation (created before this feature, `modelId: null` but a stored
     `providerId`): opens and generates on its **stored provider** with that
     provider's default model — it does not jump to the current `settings.chat`
     provider. Verify specifically with a `cerebras` conversation.
   - Switch to a quick model backed by a dynamic OpenAI-compatible profile: the
     request uses that profile's key/base URL/model; the switcher shows the
     profile name; deleting that profile downgrades the entry to the warning
     state without crashing.
   - Retry/Regenerate/Continue after a model switch use the conversation's
     current model.
   - Summary generation unchanged (no per-conversation model is sent on the
     Summary path).
   - Quick models list: add to 6, 7th add disabled; remove chips; switcher menu
     reflects the list immediately.
   - Default reasoning ButtonSet persists across reload (and, if reasoning-control
     has landed, seeds new tabs' selectors).

## Out of scope (V1)

- Reasoning-effort request mapping and the composer reasoning selector — see
  `chat-reasoning-control-v1.md`.
- Any adapter `modelId`/`featureProviderId` request-contract change — routing
  stays on the existing `resolveAdapterCall` settings overlay.
- Per-message model display in the transcript beyond what already exists.
- Reordering quick models (add/remove only).
- Applying quick models or the switcher to Summary/Deep Dive.
- Model capability filtering of the quick list — show the warning state for an
  unconfigured provider or a deleted profile instead of hiding the entry.

## Final verification checklist

- [ ] Mid-conversation model switch changes the actual network request model.
- [ ] Legacy conversations with a stored `providerId` and `modelId: null` stay
      on their stored provider with **that provider's** default model (verified
      for `cerebras`); only provider-less conversations fall back to
      `settings.chat`.
- [ ] A dynamic OpenAI-compatible profile conversation with `modelId: null`
      resolves to the profile's `defaultModel`.
- [ ] Per-tab `modelOverride` is isolated between browser tabs.
- [ ] Dynamic profiles show their profile name in the switcher and settings
      chips; a deleted profile degrades to a warning state, not a crash.
- [ ] Quick models: dedup, cap 6, chips removable, switcher menu in sync.
- [ ] `chat.defaultReasoningLevel` persists; seeds tab selectors once
      reasoning-control lands.
- [ ] Summary generation is byte-for-byte unchanged.
- [ ] `npm test`, `npm check`, both builds, `git diff --check` all pass.
- [ ] All 8 locales updated; no raw i18n keys.

## Notable files

- `src/lib/api/aiSdkAdapter.js` — verified (not modified) to honor the overlaid
  model; regression tests lock it.
- `src/services/chat/chatService.js` — new `resolveConversationModel` with
  independent, profile-aware provider/model fallback; conversation-start
  override; existing deleted-profile guard and `resolveAdapterCall` reused.
- `src/stores/chatStore.svelte.js` — per-tab `modelOverride`, `setChatModel`.
- `src/components/chat/ChatModelSelect.svelte` — **new** compact switcher.
- `src/components/chat/ChatComposer.svelte` — mounts the switcher beside Send.
- `src/components/settings/ChatSettings.svelte` — quick-models manager +
  default-reasoning ButtonSet (writes via `updateFeatureSettings('chat', …)`).
- `tests/chat/aiSdkAdapter.test.js`, `tests/chat/chatService.test.js`,
  `tests/chat/chatStoreTabs.test.js`,
  `tests/chat/composer/ChatModelSelect.test.svelte.js` — coverage.
