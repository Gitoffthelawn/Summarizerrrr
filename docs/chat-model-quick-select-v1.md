# Chat Model Quick Select — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — do not move on until it passes.
>
> **Dependency:** requires
> [`docs/provider-settings-restructure-v1.md`](provider-settings-restructure-v1.md)
> to be implemented first (this doc uses `settings.chat.{provider,model,quickModels,defaultReasoningLevel}`,
> `src/lib/providers/providerRegistry.js`, and
> `src/components/inputs/FeatureModelPicker.svelte` from it).
> Soft dependency on
> [`docs/chat-reasoning-control-v1.md`](chat-reasoning-control-v1.md): if the
> reasoning selector already exists, mount the model switcher to its left; if
> not, mount the switcher alone — nothing here blocks on it.

## Context

After the provider-settings restructure, chat has a default provider/model in
`settings.chat`, but switching models still means a round-trip to the settings
page, and there is a latent bug-shaped gap:

- **`conversation.modelId` is persisted but ignored at request time.**
  `runGeneration` in
  [`src/services/chat/chatService.js`](../src/services/chat/chatService.js)
  passes only `{ providerId, settings }` to `streamRequest` →
  `generateContentStreamEnhancedRequest` in
  [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js), and the
  adapter re-derives the model from `settings.selected*Model`. Any real
  per-conversation model switch must make the adapter accept an explicit
  `modelId`.
- The composer ([`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte))
  has no model display; the only bottom-right control is the round Send/Stop
  button.
- Per-tab chat state lives in
  [`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js) —
  `createChatSessionState()` + `SESSION_KEYS` + `stashViewInto`/
  `projectSessionToView` automatically carry any new session key between the
  active reactive view and inactive-tab snapshots.
- `conversationRepository.updateConversationMetadata(id, metadata)`
  ([`src/lib/db/conversationRepository.js`](../src/lib/db/conversationRepository.js))
  already supports patching `providerId`/`modelId` on a conversation.

This plan delivers: (1) the adapter honoring an explicit model, (2) a compact
model switcher in the composer fed by a user-curated **quick models** list,
(3) the quick-models manager and a **default reasoning level** control in Chat
settings.

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
- No new dependencies; no IndexedDB version bump (`providerId`/`modelId` fields
  already exist on conversation records).

## Phase 1 — Adapter honors an explicit modelId

1. In [`src/lib/chat/contracts.js`](../src/lib/chat/contracts.js): document
   two optional `GenerationRequest` fields: `modelId` and `featureProviderId`.
   `featureProviderId` is the **un-collapsed registry id** (may be
   `'geminiAdvanced'`); the existing `providerId` stays the adapter id (for
   Gemini Advanced that is `'gemini'`).

   > **Why both ids:** chatService sends the adapter
   > `providerId: 'gemini'` for a Gemini Advanced conversation. If the
   > explicit-model overlay were keyed on that normalized id, the registry
   > would pick the **Basic** entry — applying `{ isAdvancedMode: false }`
   > and writing `selectedGeminiModel` — while the adapter's Gemini branch
   > ([aiSdkAdapter.js:105](../src/lib/api/aiSdkAdapter.js)) selects
   > key/model by `settings.isAdvancedMode`. The explicit model must be
   > applied with the *feature* id before any collapse to the adapter id.
2. In `src/lib/providers/providerRegistry.js`: add
   `applyExplicitModel(featureProviderId, modelId, settings)` → returns a
   settings copy with
   `{ ...settings, ...adapterOverlay, [legacyModelField]: modelId }` for the
   **feature** provider entry (`'geminiAdvanced'` keeps
   `isAdvancedMode: true` + `selectedGeminiAdvancedModel`; only the legacy
   `'openai'` alias is normalized to `'chatgpt'`). This is `resolveAdapterCall`
   minus the provider-id mapping; reuse internals.
3. In [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js), in
   **both** the blocking and streaming request paths
   (`generateContentRequest` / `generateContentStreamRequest` and the
   enhanced-request variants):
   - Accept `modelId` and `featureProviderId` through
     `normalizeGenerationRequest`, and **destructure both out of the
     normalized request before `...generationOptions` is spread into the AI
     SDK call** — they are routing metadata and must never reach
     `generateText`/`streamText` as unknown options.
   - When `modelId` is present, build the per-request settings via
     `applyExplicitModel(featureProviderId ?? providerId, modelId, settings)`
     **before** calling `getAISDKModel` / `getDisplayModelName` /
     `mapGenerationConfig`. The overlay approach means none of those switches
     change, and the GPT-5/o* temperature-skip sniffing in
     `mapGenerationConfig` (which reads `settings.selectedChatgptModel` etc.)
     keeps working. Do **not** pass `modelId` "beside" settings without the
     overlay.
   - Gemini auto-fallback: when `modelId` is explicit, seed the fallback chain
     with `modelId` instead of `getCurrentGeminiModel(settings)`.
   - A request **without** `modelId` must behave byte-for-byte as before —
     Summary and legacy callers are unaffected.

**Verify:** extend
[`tests/chat/aiSdkAdapter.test.js`](../tests/chat/aiSdkAdapter.test.js):

- explicit `modelId` reaches `streamText` as the constructed model (and
  `getDisplayModelName` reflects it);
- **`gemini` case:** `providerId: 'gemini'`, `featureProviderId: 'gemini'`,
  explicit `modelId` → overlaid settings have `isAdvancedMode: false` and
  `selectedGeminiModel === modelId`;
- **`geminiAdvanced` case:** `providerId: 'gemini'`,
  `featureProviderId: 'geminiAdvanced'`, explicit `modelId` → overlaid
  settings keep `isAdvancedMode: true` and
  `selectedGeminiAdvancedModel === modelId` (the Basic-collapse regression);
- neither `modelId` nor `featureProviderId` appears in the options object
  passed to `streamText`/`generateText`;
- explicit `modelId` for a chatgpt reasoning model still triggers the
  temperature-skip path;
- a request without `modelId` produces the identical model/config as before
  (Summary regression guard).

```bash
npx vitest run tests/chat/aiSdkAdapter.test.js
```

## Phase 2 — chatService resolves and forwards the conversation model

1. In [`src/services/chat/chatService.js`](../src/services/chat/chatService.js)
   add `resolveConversationModel(conversation, settings)`. Provider and model
   fall back **independently** — a stored provider must never be swapped out
   just because the model snapshot is missing:

   ```js
   const providerId = conversation?.providerId ?? settings.chat.provider
   const modelId =
     conversation?.modelId ??
     (conversation?.providerId
       ? getLegacyModel(conversation.providerId, settings) ||
         getDefaultModel(conversation.providerId)
       : settings.chat.model)
   ```

   Old conversations — e.g. cerebras ones created while `getModelId` lacked a
   cerebras entry — have `providerId: 'cerebras'`, `modelId: null`. They must
   **stay on cerebras** with that provider's legacy/default model, not silently
   switch to whatever `settings.chat` currently points at.
   Returns `{ providerId, modelId, adapterProviderId, settingsOverlay }` via
   the registry (`providerId` may be `'geminiAdvanced'`; it is also the
   request's `featureProviderId`).
2. Use it in `runGeneration` and `continueResponse`: pass
   `providerId: adapterProviderId`, `featureProviderId: providerId`, `modelId`,
   and `settings: { ...settings, ...settingsOverlay }` to `streamRequest`, and
   use the same `{ providerId, modelId }` pair for every persisted assistant
   record and pipeline call (the
   `conversation.modelId || getModelId(settings.selectedProvider, settings)`
   sites at lines ~171, 184, 223, 238, 257, 456).
3. Capability lookups: where `providerId` feeds `buildPipeline`/context-meter
   capability checks, map through the registry's `capabilityProviderId` so
   `'geminiAdvanced'` resolves gemini capabilities.
4. `startConversationForActiveTab({ settings, modelOverride })`: accept an
   optional `{ provider, model }` override that wins over `settings.chat` when
   stamping the new conversation's `providerId`/`modelId`.

**Verify:** extend
[`tests/chat/chatService.test.js`](../tests/chat/chatService.test.js):

- `conversation.modelId` wins over `settings.chat.model` and reaches
  `streamRequest` as `modelId`;
- a conversation with `providerId: 'cerebras'`, `modelId: null` **stays on
  cerebras** with the cerebras legacy/default model — provider is not swapped
  to `settings.chat.provider`;
- a conversation with no stored provider at all falls back to
  `settings.chat.provider/model`;
- switching the conversation's model mid-conversation affects the next
  generation;
- a `geminiAdvanced` conversation calls the adapter with
  `providerId: 'gemini'`, `featureProviderId: 'geminiAdvanced'`, and
  `isAdvancedMode: true` in the overlaid settings.

```bash
npx vitest run tests/chat/chatService.test.js
```

## Phase 3 — Per-tab switcher UI + Chat settings (quick models, default reasoning)

1. **chatStore** ([`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js)):
   - Add `modelOverride: null` (`{ provider, model } | null`) to
     `createChatSessionState()` — `SESSION_KEYS`/stash/project carry it per tab
     automatically.
   - New exported `setChatModel({ provider, model })`:
     - active conversation → `await conversationRepository.updateConversationMetadata(conversation.id, { providerId: provider, modelId: model })`,
       then update the in-view `conversation` object (and the owning session
       snapshot via the existing `writeSession` helper);
     - no conversation yet → set the session's `modelOverride`;
       `startConversationForActiveTab` consumes and clears it (Phase 2 §4);
     - no-op while `isSending` (the UI also disables the trigger).
   - Expose a `$derived`-style getter for the current effective
     `{ provider, model }` (conversation → override → `settings.chat`) for the
     switcher trigger label.
2. **`src/components/chat/ChatModelSelect.svelte`** (new):
   - bits-ui `DropdownMenu` following the pattern in
     [`src/components/chat/ConversationMenu.svelte`](../src/components/chat/ConversationMenu.svelte);
     compact trigger like the deepdive
     `src/components/tools/deepdive/ChatProviderSelect.svelte` (provider icon +
     truncated model name; accessible label "Chat model: {model}").
   - Menu items, in order: **Default** (`settings.chat.provider/model`,
     labeled as default) → each `settings.chat.quickModels` entry → the
     conversation's current pair if it is in neither group → separator →
     **Manage models…** which opens Settings > Chat (reuse the existing
     open-settings pathway used elsewhere in the side panel).
   - Selecting an item calls `setChatModel`. Checkmark on the effective pair.
     Disabled while `chatState.isSending`.
3. **Mount in the composer**
   ([`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)):
   place `ChatModelSelect` in the bottom action area beside the Send/Stop
   button — left of `ChatReasoningSelect` if the reasoning-control plan has
   landed, otherwise alone.
4. **Chat settings** (`src/components/settings/ChatSettings.svelte`):
   - The "Chat model" `FeatureModelPicker` (from the restructure plan) gains an
     **"Add to quick models"** button: appends the picker's current
     `{ provider, model }` to `settings.chat.quickModels` (dedup by
     provider+model, cap 6, disable button when full or duplicate).
   - **All `chat` block writes** (`quickModels`, `defaultReasoningLevel`, the
     picker's provider/model) go through the restructure plan's
     `updateFeatureSettings('chat', patch)` — `updateSettings` shallow-merges
     top-level keys, so writing a partial `{ chat: { quickModels } }` directly
     would clobber the block's other subfields.
   - Render `quickModels` as removable chips (provider icon + model name + ✕).
   - **Default reasoning** row: ButtonSet with Auto/Low/Medium/High writing
     `chat.defaultReasoningLevel` (`'provider-default' | 'low' | 'medium' | 'high'`;
     import labels from `src/lib/chat/reasoningConfig.js` if the
     reasoning-control plan has landed, otherwise define the four labels
     locally and leave a note to consolidate). Per the amended
     `chat-reasoning-control-v1.md`, this value seeds each tab's
     `reasoningLevel`; until that plan lands the control is stored but inert —
     that is expected.
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
selection callback, disabled-while-sending).

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
     the model actually changed** (this is the core acceptance test for the
     adapter fix).
   - Switch to a `geminiAdvanced` quick model: request goes out with the
     advanced key; context meter still shows sane capability numbers.
   - Old conversation (created before this feature, `modelId: null` but a
     stored `providerId`): opens and generates on its **stored provider** with
     that provider's default model — it does not jump to the current
     `settings.chat` provider.
   - Retry/Regenerate/Continue after a model switch use the conversation's
     current model.
   - Summary generation unchanged (Basic and Advanced) — no `modelId` is sent
     on the Summary path.
   - Quick models list: add to 6, 7th add disabled; remove chips; switcher
     menu reflects the list immediately.
   - Default reasoning ButtonSet persists across reload (and, if
     reasoning-control has landed, seeds new tabs' selectors).

## Out of scope (V1)

- Reasoning-effort request mapping and the composer reasoning selector — see
  `chat-reasoning-control-v1.md`.
- Per-message model display in the transcript beyond what already exists.
- Reordering quick models (add/remove only).
- Applying quick models or the switcher to Summary/Deep Dive.
- Model capability filtering of the quick list (e.g. hiding models whose
  provider lost its key — show the warning state instead).

## Final verification checklist

- [ ] Explicit `modelId` reaches the provider request in both blocking and
      streaming paths; requests without it are byte-for-byte unchanged;
      `modelId`/`featureProviderId` never leak into AI SDK options.
- [ ] Mid-conversation model switch changes the actual network request model.
- [ ] Explicit model on a `geminiAdvanced` conversation keeps the Advanced
      key/model keys (no collapse to Gemini Basic).
- [ ] Legacy conversations with a stored `providerId` and `modelId: null`
      stay on their stored provider (with its default model); only
      provider-less conversations fall back to `settings.chat`.
- [ ] Per-tab `modelOverride` is isolated between browser tabs.
- [ ] `geminiAdvanced` conversations use the advanced key/settings overlay and
      correct capability lookups.
- [ ] Quick models: dedup, cap 6, chips removable, switcher menu in sync.
- [ ] `chat.defaultReasoningLevel` persists; seeds tab selectors once
      reasoning-control lands.
- [ ] `npm test`, `npm check`, both builds, `git diff --check` all pass.
- [ ] All 8 locales updated; no raw i18n keys.

## Notable files

- `src/lib/api/aiSdkAdapter.js` — accept explicit `modelId` +
  `featureProviderId` (destructured away from AI SDK options) via settings
  overlay in blocking + streaming paths; Gemini fallback seeding.
- `src/lib/providers/providerRegistry.js` — new
  `applyExplicitModel(featureProviderId, …)` helper (feature-id keyed, no
  Basic collapse).
- `src/services/chat/chatService.js` — `resolveConversationModel` with
  independent provider/model fallback, forward `modelId`/overlay,
  capability-id mapping, conversation-start override.
- `src/stores/chatStore.svelte.js` — per-tab `modelOverride`, `setChatModel`.
- `src/components/chat/ChatModelSelect.svelte` — **new** compact switcher.
- `src/components/chat/ChatComposer.svelte` — mounts the switcher beside Send.
- `src/components/settings/ChatSettings.svelte` — quick-models manager +
  default-reasoning ButtonSet.
- `src/lib/chat/contracts.js` — `GenerationRequest.modelId` JSDoc.
- `tests/chat/aiSdkAdapter.test.js`, `tests/chat/chatService.test.js`,
  `tests/chat/chatStoreTabs.test.js`,
  `tests/chat/composer/ChatModelSelect.test.svelte.js` — coverage.
