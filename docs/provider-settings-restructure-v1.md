# Provider Settings Restructure — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — do not move on until it passes.

## Context

Summarizerrrr stores every provider API key as a flat settings key
(`geminiApiKey`, `deepseekApiKey`, `groqApiKey`, …) — effectively a single
source of keys already — but **which provider/model a feature uses** is tangled:

- **Summarize** uses the global `selectedProvider` + `isAdvancedMode`, and the
  adapter reads that provider's `selected*Model` key
  ([`src/lib/api/api.js`](../src/lib/api/api.js), three entrypoints around
  lines 118, 209, 347 all do
  `selectedProviderId = userSettings.selectedProvider; if (!isAdvancedMode) selectedProviderId = 'gemini'`).
- **Chat** has no provider/model setting of its own — it silently reuses the
  same global `selectedProvider`
  ([`src/services/chat/chatService.js`](../src/services/chat/chatService.js)
  `getModelId`, line ~38, which is also missing a `cerebras` entry).
- **Deep Dive** already has the per-feature pattern this plan generalizes:
  `tools.deepDive.customProvider/customModel` with API keys shared from global
  settings ([`src/services/tools/toolProviderService.js`](../src/services/tools/toolProviderService.js)).
- The settings UI couples key entry and model selection: each of the ten
  `src/components/providerConfigs/*Config.svelte` components writes both the
  API key AND the global `selected*Model`. Deep Dive needed a second copy of
  nine components (`src/components/providerConfigs/tools/Tool*Config.svelte`)
  just to route the model choice elsewhere.
- The provider list is hardcoded in ~6 places:
  `src/components/inputs/ProvidersSelect.svelte`,
  `src/components/inputs/ToolProvidersSelect.svelte`, the `getAISDKModel`
  switch in [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js),
  the `keyMap`/`modelKeyMap`/`getDefaultModel` tables in
  `toolProviderService.js`, `PROVIDER_CONFIG`/`FALLBACK_PROVIDER_MODELS` in
  [`src/lib/api/providerModelService.js`](../src/lib/api/providerModelService.js),
  and the provider key section of
  [`src/lib/config/settingsSchema.js`](../src/lib/config/settingsSchema.js).

This plan restructures settings so that **one place manages providers & API
keys**, and **Summarize, Chat, and Deep Dive each pick a provider+model** from
the providers that have keys configured. It also creates the missing canonical
provider registry. It is the foundation for
[`docs/chat-model-quick-select-v1.md`](chat-model-quick-select-v1.md) (chat
quick-model switcher) and is independent of
[`docs/chat-reasoning-control-v1.md`](chat-reasoning-control-v1.md).

### Goal & scope decision (confirmed with user)

- **Full restructure now**, on branch `v3.0-NewSettingUi`.
- **Keep the Basic/Advanced toggle.** Basic mode remains the Gemini-only simple
  path. `gemini` (Basic identity: `geminiApiKey`, `selectedGeminiModel`,
  `geminiThinkingLevel`) and `geminiAdvanced` (Advanced identity:
  `geminiAdvancedApiKey`, `selectedGeminiAdvancedModel`,
  `geminiAdvancedThinkingLevel`, auto-fallback) become **two distinct
  feature-provider ids** in the new pickers. Do not merge the two Gemini
  identities.
- **Keep flat API-key storage keys unchanged** (`geminiApiKey`,
  `deepseekBaseUrl`, `ollamaEndpoint`, …). Only feature→model selection moves
  into new nested blocks.
- Add per-feature settings blocks `summarize` and `chat` with automatic,
  idempotent migration from `selectedProvider`/`selected*Model`.
- `tools.deepDive` keeps its storage shape; only its settings UI changes.
- No new dependencies. No IndexedDB changes.

## Target settings shape

Added to `DEFAULT_SETTINGS` in
[`src/stores/settingsStore.svelte.js`](../src/stores/settingsStore.svelte.js)
and to `VALID_SETTING_KEYS` in
[`src/lib/config/settingsSchema.js`](../src/lib/config/settingsSchema.js)
(add `'summarize'` and `'chat'` as top-level keys, like `'tools'`):

```js
summarize: {
  provider: 'gemini',            // feature-provider id (registry id, includes 'geminiAdvanced')
  model: 'gemini-3-flash-preview',
},
chat: {
  provider: 'gemini',
  model: 'gemini-3-flash-preview',
  defaultReasoningLevel: 'provider-default', // consumed by the reasoning-control plan
  quickModels: [],               // Array<{ provider: string, model: string }>, cap 6
},
```

`chat.defaultReasoningLevel` and `chat.quickModels` are *stored* here but only
get UI/consumers in the follow-up docs; ship them in the shape now so the
schema and migration are done once.

### Legacy keys — kept and mirrored

`selectedProvider`, `isAdvancedMode`, `isSummaryAdvancedMode`, and every
`selected*Model` key **stay in the schema and keep being written**:

- **Dual-write mirror:** whenever the Summarize picker changes
  `summarize.provider/model`, also write `selectedProvider`, the matching
  `selected<Provider>Model`, and set `isAdvancedMode`/`isSummaryAdvancedMode`
  consistently (`geminiAdvanced` → advanced on; `gemini` → advanced off only if
  the user is in Basic mode — see Phase 2 for exact rules).
- **Why:** `sanitizeSettings` in `settingsSchema.js` **drops unknown keys** and
  saves back. An older extension build on another synced browser would wipe the
  new `summarize`/`chat` blocks from storage. Because migration is idempotent
  and mirrors keep the legacy keys current, re-seeding after a wipe reproduces
  the user's **Summarize** choice instead of resetting to defaults. The mirrors
  also keep Gemini auto-fallback (`getCurrentGeminiModel`) and
  `mapGenerationConfig` (GPT-5/o* temperature handling) working without
  touching the adapter in this plan.
- **Accepted degradation for Chat (explicit policy):** Chat changes do *not*
  mirror to legacy keys (legacy clients only read the summary keys, and there
  is nothing to mirror them to). Consequence: if an old client genuinely strips
  the blocks, an independent Chat choice **cannot** be recovered — it re-seeds
  from the Summarize-derived legacy keys. This is the chosen trade-off for V1;
  a versioned sync envelope that protects new blocks is deliberately out of
  scope. State this in the code comment on the migration function so nobody
  "fixes" it into a bug report later.
- **Basic mode force preserved:** when `isAdvancedMode === false`, feature
  resolution returns `{ provider: 'gemini', model: settings.selectedGeminiModel }`
  for Summarize and Chat regardless of the blocks — byte-for-byte the current
  behavior.

## Phase 1 — Canonical provider registry + feature model resolver

1. Create `src/lib/providers/providerRegistry.js` (pure JS, no Svelte imports).
   One entry per feature-provider id — **10 entries**: `gemini`,
   `geminiAdvanced`, `chatgpt`, `openrouter`, `deepseek`, `groq`, `cerebras`,
   `ollama`, `lmstudio`, `openaiCompatible`. Entry shape:

   ```js
   {
     id: 'geminiAdvanced',
     label: 'Gemini (Advanced)',
     adapterId: 'gemini',              // what getAISDKModel switches on
     adapterOverlay: { isAdvancedMode: true }, // merged over settings for the adapter call; {} for most
     apiKeyField: 'geminiAdvancedApiKey',
     additionalKeysField: 'geminiAdvancedAdditionalApiKeys', // null for most
     baseUrlField: null,               // 'chatgptBaseUrl' | 'deepseekBaseUrl' | 'openaiCompatibleBaseUrl'
     endpointField: null,              // 'ollamaEndpoint' | 'lmStudioEndpoint'
     legacyModelField: 'selectedGeminiAdvancedModel',
     defaultModel: 'gemini-3-flash-preview',
     requiresKey: true,                // false for ollama, lmstudio
     discoveryId: 'geminiAdvanced',    // providerModelService id; null when no live model list
     modelSource: 'discovery',         // 'discovery' | 'static' | 'freeText' — how the picker offers models
     capabilityProviderId: 'gemini',   // key for providerCapabilities lookups
     icon: 'gemini',
   }
   ```

   `modelSource` contract (this is load-bearing — see Phase 4 step 2):
   - `'discovery'` — live model list via `fetchProviderModels`: `gemini`,
     `geminiAdvanced`, `groq`, `cerebras`, `deepseek`. (`gemini` Basic reuses
     `discoveryId: 'geminiAdvanced'` with `geminiApiKey` — the Google endpoint
     is the same, keyed by query param.)
   - `'static'` — curated list, no live endpoint: `chatgpt`, `openrouter`.
   - `'freeText'` — user types the model id: `ollama`, `lmstudio`,
     `openaiCompatible`.
   Note `fetchProviderModels` **throws** `Unsupported model provider` for ids
   outside its `PROVIDER_CONFIG` ([providerModelService.js:161](../src/lib/api/providerModelService.js));
   the picker must gate discovery calls on `modelSource === 'discovery'`, never
   call it blindly.

   Copy the concrete field names and default models from the existing tables:
   `DEFAULT_SETTINGS` (settingsStore lines ~10–43), `chatService.getModelId`,
   and `toolProviderService.js` `keyMap` (line ~96) / `modelKeyMap` (~177) /
   `getDefaultModel` (~197). For `gemini` (Basic), `adapterOverlay` is
   `{ isAdvancedMode: false }` so the adapter's internal
   `isAdvancedMode ? selectedGeminiAdvancedModel : selectedGeminiModel` branch
   resolves correctly regardless of the user's UI mode.

   Helpers (all pure):
   - `getProvider(id)`, `PROVIDER_LIST`
   - `normalizeProviderId(id)` — maps the legacy alias `'openai'` → `'chatgpt'`,
     unknown → `'gemini'`
   - `getApiKey(id, settings)`, `isProviderConfigured(id, settings)` (has a key,
     or `requiresKey === false` with a non-empty endpoint)
   - `listConfiguredProviders(settings)`
   - `getLegacyModel(id, settings)` (reads `legacyModelField`),
     `getDefaultModel(id)`, `getModelSource(id)`
   - `resolveAdapterCall(featureProviderId, modelId, settings)` →
     `{ providerId: adapterId, settings: { ...settings, ...adapterOverlay, [legacyModelField]: modelId } }`
     — the one sanctioned way to turn a feature choice into an adapter call.

2. Create `src/lib/providers/featureModelResolver.js`:
   `resolveFeatureModel(feature, settings)` with `feature ∈ 'summarize' | 'chat'`,
   returning `{ providerId, modelId, adapterProviderId, settingsOverlay }`:
   - `isAdvancedMode === false` → force
     `{ providerId: 'gemini', modelId: settings.selectedGeminiModel || defaultModel }`.
   - Otherwise read `settings[feature].provider/model`; if the block is missing
     (not yet migrated) fall back to the legacy derivation
     (`selectedProvider` + `getLegacyModel`).
   - If the chosen provider is not configured (no key), fall back to Gemini
     Basic when `geminiApiKey` exists, mirroring the intent of
     `toolProviderService.getFallbackProvider`.

3. Add `tests/settings/providerRegistry.test.js` (the vitest glob
   `tests/**/*.test.js` picks up new directories automatically):
   - every entry's `apiKeyField`/`baseUrlField`/`endpointField`/
     `legacyModelField` exists in `VALID_SETTING_KEYS`;
   - every entry has a valid `modelSource`, and every `'discovery'` entry's
     `discoveryId` exists in `providerModelService.PROVIDER_CONFIG` (so the
     picker can never hit the `Unsupported model provider` throw);
   - `resolveAdapterCall('geminiAdvanced', m, s)` yields
     `providerId: 'gemini'`, `settings.isAdvancedMode === true`, and
     `settings.selectedGeminiAdvancedModel === m`;
   - `resolveFeatureModel` Basic-mode force, missing-block fallback, and
     unconfigured-provider fallback;
   - `normalizeProviderId('openai') === 'chatgpt'`.

**Verify:**

```bash
npx vitest run tests/settings/providerRegistry.test.js
```

## Phase 2 — Settings shape, migration, and mirroring

1. In `src/stores/settingsStore.svelte.js`:
   - Add the `summarize` and `chat` blocks to `DEFAULT_SETTINGS` (shape above).
   - Create **one pure ingress function** `normalizeStoredSettings(rawSettings)`
     = `sanitizeSettings` → deep-merge of the `summarize`/`chat` blocks with
     defaults (exactly like the existing `tools` merge) →
     `migrateFeatureModelSettings`. Migration must **not** live only in
     `loadSettings`: full settings objects also enter through
     `updateSettingsFromCloud` (→ `updateSettings`, line ~563), the
     import/restore path, and the storage watch
     (`subscribeToSettingsChanges`). Route **every full-object ingress**
     through `normalizeStoredSettings` — otherwise this fresh-install bug
     ships: local defaults already contain `summarize`/`chat`, an old-client
     cloud payload arrives carrying only legacy keys, the shallow merge in
     `updateSettings` (line ~523) updates the legacy keys and leaves the
     default blocks untouched, and features silently disagree with the synced
     provider.
   - Because of that case, `migrateFeatureModelSettings` treats an incoming
     full payload **without** a `summarize` block as legacy data: it derives
     both blocks from the payload's legacy keys (overwriting local blocks —
     the old client is the source of truth for that write). For local loads
     the "only when the block is absent" rule below applies unchanged. Do not
     run block-derivation on partial patches passed to `updateSettings` by UI
     code — only on full-object ingress.
   - `migrateFeatureModelSettings(cleanStoredSettings)` rules — **only when
     the block is absent** (idempotent):
     - `summarize` missing:
       - `isAdvancedMode !== true` → `{ provider: 'gemini', model: selectedGeminiModel }`
       - `isAdvancedMode === true && selectedProvider === 'gemini'` →
         `{ provider: 'geminiAdvanced', model: selectedGeminiAdvancedModel }`
       - else → `{ provider: normalizeProviderId(selectedProvider), model: getLegacyModel(...) }`
     - `chat` missing: same provider/model seed (chat follows the global
       provider today), plus `defaultReasoningLevel: 'provider-default'` and
       `quickModels: []`.
   - **Mirror writes:** add `applyFeatureModelMirrors(patch)` used by the
     settings-update path — when a patch contains `summarize`, extend the patch
     with `selectedProvider` (= `adapterId`… careful: mirror the *feature id
     collapsed to legacy semantics*: `geminiAdvanced` → `selectedProvider: 'gemini'`,
     `isAdvancedMode: true`, `isSummaryAdvancedMode: true`; `gemini` →
     `selectedProvider: 'gemini'` and leave `isAdvancedMode` untouched; any
     other id → `selectedProvider: id`, `isAdvancedMode: true`,
     `isSummaryAdvancedMode: true`) and the provider's
     `[legacyModelField]: summarize.model`. Chat changes do **not** mirror —
     legacy clients only ever read the summary keys (see the accepted
     degradation policy above).
   - **Nested-write helper:** `updateSettings` shallow-merges top-level keys
     (`{ ...cleanCurrentSettings, ...cleanNewSettings }`, line ~523), so a
     naive `updateSettings({ chat: { quickModels } })` would clobber the rest
     of the block. Add `updateFeatureSettings(feature, patch)` mirroring the
     existing `updateToolSettings` (spread the current block, apply the patch,
     write the whole block). Every feature-block write in this plan and the
     follow-up docs goes through it.
2. In `src/lib/config/settingsSchema.js`: append `'summarize'` and `'chat'` to
   `VALID_SETTING_KEYS` (Tools Configuration section area).
3. Add `tests/settings/featureModelMigration.test.js` covering at minimum:
   - fresh install (no stored settings) → blocks equal defaults;
   - legacy Advanced user with `selectedProvider: 'deepseek'`,
     `selectedDeepseekModel: 'deepseek-chat'` → both blocks seeded to deepseek;
   - legacy Basic user (`isAdvancedMode: false`) → both blocks gemini +
     `selectedGeminiModel`;
   - legacy Advanced Gemini user → blocks use `geminiAdvanced`;
   - **re-seed after old-client wipe**: settings that already went through
     migration, then had `summarize`/`chat` stripped (simulating an old client's
     `sanitizeSettings`) but retain mirrored legacy keys → migration reproduces
     the previous Summarize choice (Chat re-seeds from it — the documented
     policy);
   - **fresh install + old-client cloud payload**: local settings are defaults
     (blocks present), an incoming full payload carries legacy deepseek keys
     and no blocks → after ingress both blocks reflect deepseek, not the
     default gemini;
   - migration does not overwrite an existing block (idempotency) on local
     loads;
   - `updateFeatureSettings('chat', { quickModels: […] })` preserves the other
     `chat` subfields.

**Verify:**

```bash
npx vitest run tests/settings/featureModelMigration.test.js
npm test
```

## Phase 3 — Rewire feature resolution to the new blocks

1. **Summarize** — in [`src/lib/api/api.js`](../src/lib/api/api.js), the
   legacy resolution block
   (`selectedProviderId = userSettings.selectedProvider; if (!isAdvancedMode) selectedProviderId = 'gemini'`)
   is duplicated in **six** entrypoints — `summarizeContent` (~113),
   `summarizeContentStream` (~209), the third non-stream variant (~347),
   `summarizeChapters` (~386), `summarizeChaptersStream` (~428), and
   `summarizeContentStreamEnhanced` (~504). Extract **one shared helper**
   (e.g. `resolveSummarizeProvider(userSettings)` at the top of `api.js`,
   wrapping `resolveFeatureModel('summarize', userSettings)` +
   `validateApiKey`-equivalent via `getApiKey`) and replace **all six** blocks
   with it — grep for `Force Gemini in basic mode` afterwards; zero hits may
   remain. Because the mirrors keep `selected*Model` in sync, adapter
   internals (`getAISDKModel`, Gemini fallback, `mapGenerationConfig`) need no
   change.
   - Also replace the hardcoded provider list inside
     `providerSupportsStreaming` (api.js ~19) with a registry-driven check —
     the current list is stale (missing `groq`, `cerebras`, `lmstudio`, which
     all stream fine through AI SDK). Keep the browser-compatibility check
     untouched; only the provider table moves to the registry (an
     all-providers-stream default is acceptable — note it in the entry shape
     or a `supportsStreaming: true` field).
2. **Chat** — in [`src/services/chat/chatService.js`](../src/services/chat/chatService.js):
   - Rewrite `getModelId(providerId, settings)` to delegate to the registry's
     `getLegacyModel(normalizeProviderId(providerId), settings)` — this fixes
     the missing `cerebras` entry. Keep the exported name/signature.
   - `startConversationForActiveTab` and every
     `settings.selectedProvider` fallback site (lines ~80, 171, 184, 223, 238,
     257, 456) switch to `resolveFeatureModel('chat', settings)` for the
     provider/model defaults. Conversation-stored `providerId`/`modelId` still
     win where they already do. (Making the adapter honor `conversation.modelId`
     at request time is deliberately **not** in this doc — see
     `chat-model-quick-select-v1.md`.)
3. **Deep Dive** — in
   [`src/services/tools/toolProviderService.js`](../src/services/tools/toolProviderService.js):
   - Replace the local `keyMap` (~96), `modelKeyMap` (~177/239), and
     `getDefaultModel` (~197) tables with registry helpers.
   - `getFallbackProvider` (~130) now reads `settings.summarize` (via
     `resolveFeatureModel('summarize', settings)`) instead of
     `selectedProvider` + `isAdvancedMode`, preserving the existing
     "fall back to whatever Summary uses, detecting Gemini Advanced" semantics.
   - `tools.deepDive.customProvider` may now hold `'geminiAdvanced'`; make the
     key/model lookups go through the registry so that resolves correctly.
4. Point `src/components/inputs/ProvidersSelect.svelte` and
   `ToolProvidersSelect.svelte` item lists at `PROVIDER_LIST` (labels from the
   registry). Delete the dead `updateSettings({ selectedModel: … })` write in
   `ProvidersSelect.svelte` — `selectedModel` is not in `VALID_SETTING_KEYS`
   and is silently stripped today.
5. **Do not touch** the `getAISDKModel` switch, `providerModelService.js`
   `PROVIDER_CONFIG`, or streaming internals in this phase.

**Verify:** add `tests/summary/summarizeProviderResolution.test.js` asserting
that all six entrypoints — including `summarizeChapters`,
`summarizeChaptersStream`, and `summarizeContentStreamEnhanced` — resolve
provider/model from `settings.summarize` (and force Gemini in Basic mode), and
that `providerSupportsStreaming('groq' | 'cerebras' | 'lmstudio')` is true.
Then:

```bash
npx vitest run tests/summary/summarizeProviderResolution.test.js tests/chat/chatService.test.js
npm test
grep -rn "Force Gemini in basic mode" src/   # expect zero hits
```

Then manual smoke: `npm run dev`, load `.output/chrome`, summarize a page in
Basic mode (Gemini) and in Advanced mode with one non-Gemini provider;
summarize a YouTube video with chapters (exercises the chapter entrypoints);
run one Deep Dive generation with `useGeminiBasic` on and off.

## Phase 4 — Settings UI restructure

1. **"Providers & API Keys" tab** — rewrite
   `src/components/settings/AIProviderSettings.svelte`:
   - Keep the Basic/Advanced toggle exactly as-is (still writes both
     `isAdvancedMode` and `isSummaryAdvancedMode`).
   - Basic mode: unchanged — render `GeminiBasicConfig` (key + model; Basic
     keeps its one-model simple path).
   - Advanced mode: replace the `ProvidersSelect` + per-provider `*Config`
     switch with a vertical list (or accordion) of all registry providers, each
     rendered by **one new parameterized component**
     `src/components/settings/ProviderKeyConfig.svelte` (prop: registry entry).
     It composes the existing inputs: `ApiKeyInput`, the multi-key input used
     by Gemini configs (`additionalKeysField`), and text inputs for
     `baseUrlField`/`endpointField`. Show a "configured" badge from
     `isProviderConfigured`. **No model selection on this tab.**
   - Temperature/topP/streaming controls stay on this tab.
2. **Shared feature picker** — create
   `src/components/inputs/FeatureModelPicker.svelte`, props
   `{ provider, model, onchange(provider, model), disabled }`.

   ⚠️ **Do this step before deleting anything.** Today only `groq`,
   `cerebras`, `deepseek`, `geminiAdvanced` have live discovery;
   `fetchProviderModels` **throws** for every other id, and
   `ReusableCombobox` only *filters* its item list — typed text is never
   committed as a value ([ReusableCombobox.svelte:28](../src/components/inputs/ReusableCombobox.svelte)).
   The old `*Config.svelte` components are currently the only way several
   providers get a model list. Deleting them without the work below would
   leave ChatGPT/OpenRouter/Ollama/LM Studio/OpenAI-compatible stuck on
   whatever model is saved.

   - The picker switches on the registry's `modelSource`:
     - `'discovery'` → `ProviderModelSelect.svelte` with
       `providerId: entry.discoveryId`, `apiKey: getApiKey(entry.id, settings)`
       (for `gemini` Basic this is `discoveryId: 'geminiAdvanced'` +
       `geminiApiKey`). Never call `fetchProviderModels` for non-discovery
       entries.
     - `'static'` (`chatgpt`, `openrouter`) → combobox over a curated list.
       **Before deleting the old components, copy their hardcoded model lists**
       into `FALLBACK_PROVIDER_MODELS` in `providerModelService.js` so the
       lists survive.
     - `'freeText'` (`ollama`, `lmstudio`, `openaiCompatible`) → plain text
       input for the model id (these servers run arbitrary user models).
   - Extend `ReusableCombobox` with an `allowCustomValue` prop that commits
     the typed text on Enter/blur when it matches no item, and enable it for
     `'static'` and `'discovery'` sources — users must always be able to enter
     a model id the list doesn't know about.
   - Provider dropdown fed by `listConfiguredProviders(settings)`, plus the
     currently-saved provider even if unconfigured (flagged with a warning and
     a link to the Providers & API Keys tab).
   - On provider change, reset the model to `getDefaultModel(id)`.
   - Add a component test
     `tests/settings/FeatureModelPicker.test.svelte.js` that iterates **all 10
     registry entries** and asserts each renders a usable model control
     (discovery mock, static list non-empty, free-text input present) and that
     a custom typed model id can be committed for a `'static'` provider.
3. **Per-feature pickers:**
   - `SummarySettings.svelte`: in Advanced mode add a "Summarize model"
     `FeatureModelPicker` bound to `settings.summarize`, writing via
     `updateFeatureSettings('summarize', …)` (mirrors applied by Phase 2's
     `applyFeatureModelMirrors`). In Basic mode show a static "Uses Gemini
     Basic" note.
   - `ChatSettings.svelte`: add a "Chat model" `FeatureModelPicker` bound to
     `settings.chat`. (Quick-models manager and default-reasoning control ship
     in `chat-model-quick-select-v1.md`, not here.)
   - `tools/DeepDiveToolSettings.svelte`: keep the Gemini-Basic/Custom
     ButtonSet; replace the `ToolProvidersSelect` + nine `Tool*Config` branches
     with one `FeatureModelPicker` writing
     `tools.deepDive.customProvider/customModel` via `updateToolSettings`
     (standardize on `updateToolSettings`; it currently mixes both update
     styles). API keys are no longer entered inline — the info line links to
     the Providers & API Keys tab.
4. **Delete** the now-unused components — only after step 2's picker covers
   all 10 registry entries (including the copied static lists): the top-level
   `src/components/providerConfigs/*Config.svelte` **except**
   `GeminiBasicConfig.svelte` and the shared `ProviderModelSelect.svelte`, all
   nine `src/components/providerConfigs/tools/Tool*Config.svelte`, and
   `ToolProvidersSelect.svelte` if nothing else imports it. Grep for imports
   before deleting each.
5. **i18n:** add every new string to all 8 locale files in
   `src/lib/locales/` (`en`, `de`, `es`, `fr`, `ja`, `ko`, `vi`, `zh-CN`);
   reuse existing `settings.*` keys where possible. Missing keys render as raw
   ids in the UI.

**Verify:**

```bash
npm test
npm check
npm run build
npm run build:firefox
```

Then manual walkthrough on `.output/chrome`:

- Providers & API Keys tab: enter/edit a key for two providers; badges update.
- Feature picker per `modelSource`: one discovery provider (e.g. groq) lists
  live models; one static provider (e.g. chatgpt) lists the curated models and
  accepts a typed custom id; one freeText provider (e.g. ollama) accepts a
  typed model id.
- Summary tab: pick provider+model; confirm a summarize run uses it (network
  tab) and that legacy mirrors updated (`selectedProvider`, `selected*Model`
  in storage inspector).
- Basic mode: toggle to Basic; Summarize/Chat use Gemini Basic; feature pickers
  are replaced by the "Uses Gemini Basic" note.
- Chat: new conversation uses `settings.chat` provider/model.
- Deep Dive tab: custom provider+model picker works; generation uses it;
  unconfigured provider shows the warning link.
- Switch UI language to `vi` and one more locale; no raw i18n ids visible.

## Out of scope (V1)

- Honoring `conversation.modelId` at request time / quick model switcher — see
  `chat-model-quick-select-v1.md`.
- Reasoning-effort control — see `chat-reasoning-control-v1.md`.
- Merging the two Gemini identities or removing the Basic/Advanced toggle.
- Rewriting the `getAISDKModel` switch or `providerModelService.PROVIDER_CONFIG`
  onto the registry (they keep working through the mirrors/overlays).
- Removing the legacy `selectedProvider`/`selected*Model` keys (needed as sync
  mirrors for at least one release cycle).
- Per-provider default model on the Providers tab.

## Final verification checklist

- [ ] `npm test`, `npm check`, `npm run build`, `npm run build:firefox` all pass.
- [ ] Fresh install: defaults sane; Basic mode works with just a Gemini key.
- [ ] Migration: legacy settings (Basic, Advanced-Gemini, Advanced-other) seed
      `summarize`/`chat` correctly; migration is idempotent; re-seed after a
      simulated old-client wipe reproduces the Summarize choice (Chat re-seeds
      from it per the documented policy).
- [ ] All full-object ingress paths (initial load, cloud apply, import,
      storage watch) run `normalizeStoredSettings`; the fresh-install +
      old-client cloud payload case seeds the blocks from the payload's
      legacy keys.
- [ ] Summarize, Chat, and Deep Dive each honor their own provider+model —
      including `summarizeChapters`, `summarizeChaptersStream`, and
      `summarizeContentStreamEnhanced`
      (`grep -rn "Force Gemini in basic mode" src/` returns nothing).
- [ ] Every registry entry offers a usable model control per its
      `modelSource`; a custom model id can be typed for static providers;
      `providerSupportsStreaming` covers groq/cerebras/lmstudio.
- [ ] Mirrors: changing the Summarize picker updates `selectedProvider`,
      `selected*Model`, `isAdvancedMode`/`isSummaryAdvancedMode`.
- [ ] Cerebras works in chat (previously missing from `getModelId`).
- [ ] 19 obsolete config components deleted; no dangling imports
      (`grep -r "Tool.*Config\|ProvidersSelect" src/` is clean of dead refs).
- [ ] All 8 locales updated; no raw i18n keys in the settings UI.
- [ ] `git diff --check` passes.

## Notable files

- `src/lib/providers/providerRegistry.js` — **new**: canonical provider list +
  helpers (`resolveAdapterCall`, `getApiKey`, `listConfiguredProviders`, …).
- `src/lib/providers/featureModelResolver.js` — **new**:
  `resolveFeatureModel(feature, settings)` with Basic-force and key fallback.
- `src/stores/settingsStore.svelte.js` — new `summarize`/`chat` blocks,
  `normalizeStoredSettings` ingress, `migrateFeatureModelSettings`,
  `updateFeatureSettings`, mirror writes.
- `src/lib/config/settingsSchema.js` — `'summarize'`/`'chat'` in
  `VALID_SETTING_KEYS`.
- `src/lib/api/api.js` — all six summarize entrypoints use one shared
  resolver; `providerSupportsStreaming` table moves to the registry.
- `src/lib/api/providerModelService.js` — `FALLBACK_PROVIDER_MODELS` gains the
  static lists copied from the retired `*Config` components.
- `src/components/inputs/ReusableCombobox.svelte` — new `allowCustomValue`
  commit-typed-text behavior.
- `src/services/chat/chatService.js` — `getModelId` via registry (cerebras
  fix); chat defaults from `resolveFeatureModel('chat')`.
- `src/services/tools/toolProviderService.js` — tables → registry; fallback
  reads `settings.summarize`.
- `src/components/settings/AIProviderSettings.svelte` — becomes "Providers &
  API Keys" (keys only).
- `src/components/settings/ProviderKeyConfig.svelte` — **new** parameterized
  key-entry card (replaces 10 per-provider components).
- `src/components/inputs/FeatureModelPicker.svelte` — **new** shared
  provider+model picker (replaces the 9 `Tool*Config` copies).
- `src/components/settings/{SummarySettings,ChatSettings}.svelte`,
  `src/components/settings/tools/DeepDiveToolSettings.svelte` — mount pickers.
- `tests/settings/providerRegistry.test.js`,
  `tests/settings/featureModelMigration.test.js`,
  `tests/settings/FeatureModelPicker.test.svelte.js`,
  `tests/summary/summarizeProviderResolution.test.js` — **new** test suites.
