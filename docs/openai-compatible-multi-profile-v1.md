# OpenAI-Compatible Multi-Profile Provider Management — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> verify step — do not move on until it passes.

## Context

Summarizerrrr currently treats every entry in
`src/lib/providers/providerRegistry.js` as a singleton provider type. The
settings page stores the chosen types in `settings.addedProviders`, and
`addProvider(id)` in `src/stores/settingsStore.svelte.js` deduplicates by that
static id. This is suitable for Gemini, Groq, or DeepSeek, but it means
`openaiCompatible` can only be added once.

The current OpenAI-compatible configuration is one global tuple:

```js
openaiCompatibleApiKey
openaiCompatibleBaseUrl
selectedOpenAICompatibleModel
```

Those fields are declared in `DEFAULT_SETTINGS` and `VALID_SETTING_KEYS`, the
provider registry points directly at them, and `getAISDKModel()` in
`src/lib/api/aiSdkAdapter.js` reads them directly. Consequently a user cannot
keep separate configurations for services such as Together, Fireworks,
SiliconFlow, a company gateway, or multiple accounts at the same service.

There are additional constraints the implementation must preserve:

- Summary, Chat, and Deep Dive store provider ids independently in
  `settings.summarize.provider`, `settings.chat.provider`, and
  `settings.tools.deepDive.customProvider`.
- Chat persists `providerId` and `modelId` in IndexedDB conversations/messages.
  A profile therefore needs a stable id; its display name is not an identity.
- Summary and Deep Dive already call `resolveAdapterCall()`, but Chat passes a
  persisted provider id straight to the AI SDK request. Dynamic profile ids
  must be converted to the base `openaiCompatible` adapter id at request time.
- `sanitizeSettings()` is a top-level allowlist. Any new top-level profile
  collection must be in `VALID_SETTING_KEYS`, and nested profile objects need
  their own normalization because the current sanitizer is shallow.
- ZIP import/export and Google Drive sync carry the entire settings object.
  Import merge is currently shallow, cloud sync is last-write-wins, and the
  conflict dialog counts only flat API-key fields.
- `FeatureModelPicker.svelte` derives choices from `addedProviders` and assumes
  every selectable id is a static registry id.
- The repository already has Vitest (`npm test`) and Svelte checking
  (`npm run check`). There is no need for a new dependency or test framework.

### Current baseline (verified 2026-07-14)

- `npm run check` exits successfully with 0 errors and 17 existing warnings.
- `npm test` has 246 passing tests and 3 stale failures:
  - two `tests/settings/FeatureModelPicker.test.svelte.js` assertions mount a
    provider that is not present/configured in the mocked `addedProviders`, so
    auto-collapse correctly renders Gemini instead of the requested control;
  - one `tests/summary/summarizeProviderResolution.test.js` assertion still
    expects `isAdvancedMode === false` to force Gemini, although the implemented
    provider-add flow deliberately removed that runtime behavior.

Phase 1 repairs those test expectations before feature work so later phases
have a meaningful green baseline.

### Goal & scope decision (confirmed with user)

- The user confirmed that **OpenAI Compatible must be addable more than once**.
- V1 implements multiple independent profiles. Each profile has a stable id,
  display name, Base URL, one API key, and a default model id.
- Summary, Chat, and Deep Dive can select different profiles. Profile identity
  must also work in future/legacy `chat.quickModels` entries.
- The existing static providers remain singleton entries. Only
  OpenAI-compatible is repeatable in V1.
- Existing users are migrated automatically from the three flat fields to one
  deterministic legacy profile without losing their active feature choices.
- Keep the flat OpenAI-compatible fields for downgrade/older-client
  compatibility. After migration they are mirrors, not the source of truth.
- No new dependencies and no IndexedDB schema change. Existing conversation
  metadata fields are reused.
- V1 does not rotate multiple keys within one profile; that is a separate quota
  management feature.

## Target settings and identity model

Add this top-level collection:

```js
openaiCompatibleProfiles: [
  {
    id: 'openai-compatible-550e8400-e29b-41d4-a716-446655440000',
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '...',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
  },
]
```

Rules:

- New ids use `openai-compatible-${generateUUID()}`. Reuse `generateUUID()`
  from `src/lib/utils/utils.js`; do not derive identity from a mutable name or
  URL.
- The migrated singleton uses the deterministic id
  `openai-compatible-legacy`, making migration idempotent.
- Trim string fields on save. Require a non-empty name, HTTP(S) Base URL, API
  key, and default model before the profile is considered configured.
  `http://localhost` remains valid. Do not log API keys.
- Auto-generated names are `OpenAI Compatible 1`, `OpenAI Compatible 2`, etc.
  Names must be case-insensitively unique so provider pickers are unambiguous.
- `summarize.provider`, `chat.provider`, Deep Dive, conversations, messages, and
  quick-model records store the stable profile id. Only the adapter call uses
  the static adapter id `openaiCompatible`.
- `addedProviders` continues to contain singleton catalog ids. Dynamic profiles
  live only in `openaiCompatibleProfiles`; do not duplicate their ids into
  `addedProviders`.

## Phase 1 — Restore a green provider test baseline

1. Update `tests/settings/FeatureModelPicker.test.svelte.js` to initialize the
   mocked settings for the provider under test instead of assuming a bound prop
   bypasses the component's configured-provider rules:
   - put the tested provider id in `settings.addedProviders`;
   - provide its required key or endpoint;
   - flush the component after each settings change;
   - cleanly unmount between loop iterations instead of only clearing
     `host.innerHTML`.
2. Replace the obsolete “forces Gemini Basic in basic mode” assertion in
   `tests/summary/summarizeProviderResolution.test.js` with the implemented
   contract: an explicitly configured `settings.summarize` provider/model is
   honored regardless of vestigial `isAdvancedMode`.
3. Do not change runtime code merely to satisfy the old expectations.

**Verify:**

```bash
npm test
npm run check
```

Expected: all tests pass; Svelte check has 0 errors. Record the existing warning
count in the Phase 1 walkthrough so later phases can detect newly introduced
warnings.

## Phase 2 — Profile domain model, normalization, CRUD, and registry resolution

1. Create `src/lib/providers/openAICompatibleProfiles.js` as a pure domain
   module. It should export focused helpers for:
   - detecting a profile id (`isOpenAICompatibleProfileId`);
   - normalizing one profile and a profile array from untrusted storage/import;
   - finding a profile by id;
   - generating a stable id and the next available default name;
   - validating required fields and HTTP(S) Base URLs;
   - merging two profile arrays by id for backup-import merge mode.
   Preserve array order, deduplicate ids, ignore malformed entries, and never
   print credentials.
2. Add `openaiCompatibleProfiles: []` to `DEFAULT_SETTINGS` in
   `src/stores/settingsStore.svelte.js` and add
   `'openaiCompatibleProfiles'` to `VALID_SETTING_KEYS` in
   `src/lib/config/settingsSchema.js`.
3. Extend `normalizeStoredSettings()` so every full ingress (local load,
   storage watch, cloud apply, import) normalizes nested profiles. If the key is
   absent and any legacy OpenAI-compatible field is non-empty, or
   `addedProviders` contains `openaiCompatible`, create exactly one
   `openai-compatible-legacy` profile from the flat fields. An explicitly
   present empty array means “the user deleted all profiles” and must not
   recreate the legacy profile.
4. Add store helpers near the current `addProvider()`/`removeProvider()`:
   - `addOpenAICompatibleProfile(initialValues?)` returns the created id;
   - `updateOpenAICompatibleProfile(id, patch)` allowlists only profile fields;
   - `removeOpenAICompatibleProfile(id)` removes it and repairs settings
     references in one `updateSettings()` call;
   - `getFallbackProviderSelection()` chooses the first configured added
     provider, falling back to Gemini/default model.
   Removal must repair `summarize`, `chat`, `tools.deepDive`, and filter matching
   `chat.quickModels`. Deleting `openai-compatible-legacy` also clears its three
   flat legacy fields so it does not become a downgrade zombie.
5. Keep compatibility mirrors:
   - migration reads the old flat fields only when the new collection is absent;
   - selecting any profile for Summary mirrors that profile's key, Base URL,
     and selected model to the existing flat fields through
     `applyFeatureModelMirrors()`;
   - updating a profile that is currently selected by Summary refreshes those
     mirrors atomically.
6. Extend `src/lib/providers/providerRegistry.js` without turning the static
   registry into mutable global state:
   - keep `getProvider(id)` for static catalog/template lookup;
   - add `resolveProviderEntry(id, settings)` which returns a static entry or a
     dynamic descriptor generated from a profile;
   - add `listAddedProviderEntries(settings)` which combines singleton ids from
     `addedProviders` with all dynamic profile descriptors;
   - make `normalizeProviderId`, `getApiKey`, `isProviderConfigured`,
     `getDefaultModel`, `getModelSource`, and `resolveAdapterCall` profile-aware.
7. A dynamic descriptor should expose `adapterId: 'openaiCompatible'`,
   `modelSource: 'freeText'`, `defaultModel` from the profile, and the profile
   name as its label. `resolveAdapterCall(profileId, modelId, settings)` must
   return the base adapter id plus a request-local settings overlay containing
   `openaiCompatibleApiKey`, `openaiCompatibleBaseUrl`, and
   `selectedOpenAICompatibleModel`. Do not copy secrets into the static
   `PROVIDER_LIST`.
8. Keep the static `openaiCompatible` registry entry as the repeatable **Add
   provider template** and legacy adapter identity, but mark it so selectable
   provider lists do not treat it as a configured singleton after migration.

Add `tests/settings/openAICompatibleProfiles.test.js` and extend
`tests/settings/providerRegistry.test.js` /
`tests/settings/addedProvidersMigration.test.js` to cover malformed nested
data, duplicate ids, deterministic migration, explicit-empty behavior, CRUD,
reference repair, dynamic labels/defaults/configuration, and adapter overlays.
Use fake keys only.

**Verify:**

```bash
npm test -- tests/settings/openAICompatibleProfiles.test.js tests/settings/providerRegistry.test.js tests/settings/addedProvidersMigration.test.js
npm test
npm run check
```

The existing singleton OpenAI-compatible path must still work at this phase;
the new profile helpers are available but not yet exposed in the UI.

## Phase 3 — Make every runtime consumer profile-aware

1. Update `src/lib/providers/featureModelResolver.js` to resolve entries with the
   current settings object. A valid dynamic profile id must survive
   normalization; a missing/unconfigured profile follows the existing Gemini
   fallback rule.
2. Update `src/lib/api/api.js`:
   - `resolveSummarizeProvider()` uses `resolveProviderEntry()` for dynamic
     labels and validation;
   - `providerSupportsStreaming()` recognizes resolved dynamic profiles;
   - remove the unused hardcoded `validateApiKey()` switch so it cannot drift
     from the registry again.
3. Keep `getAISDKModel()` in `src/lib/api/aiSdkAdapter.js` keyed by the static
   adapter id. Profile-specific credentials/model arrive only through the
   overlay returned by `resolveAdapterCall()`. Confirm both blocking and
   streaming summary paths receive the correct overlay.
4. Update `src/services/tools/toolProviderService.js` to pass `settings` to all
   profile-aware helpers. `getToolAIModel()` must resolve the dynamic profile to
   `openaiCompatible` immediately before constructing the AI SDK model.
5. Update `src/services/chat/chatService.js` carefully because conversations
   persist the feature/profile id:
   - continue persisting the dynamic profile id and model id for provenance;
   - before every send, retry, regenerate, or branch request, call
     `resolveAdapterCall(conversationProviderId, modelId, settings)`;
   - pass the returned adapter id and settings overlay to `streamRequest()`;
   - use the resolved entry's `capabilityProviderId` for context budgeting while
     retaining the profile id on conversation/message records;
   - if an old conversation references a deleted profile, fall back once to the
     current configured Chat selection, update the conversation metadata using
     the existing `updateConversationMetadata()`, and emit an `onWarnings`
     message explaining the provider change. Never silently send to a different
     endpoint.
6. Replace the hardcoded maps in
   `src/entrypoints/content/composables/useApiKeyValidation.svelte.js` with the
   registry/configuration helpers so a selected dynamic profile produces the
   correct setup prompt and display name.
7. Update or remove `src/lib/utils/apiKeyTester.js`: it is currently unreferenced
   and only understands flat fields. Prefer deletion if `rg` still shows no
   consumers; otherwise make it accept a resolved profile and its request-local
   overlay.

Extend tests in:

- `tests/summary/summarizeProviderResolution.test.js` — two profiles select
  different Base URLs/models and both blocking/streaming use the intended one;
- `tests/chat/chatService.test.js` — persisted profile identity, adapter
  conversion on every request path, and explicit deleted-profile fallback;
- add focused tool-provider tests if no existing suite covers
  `toolProviderService`.

**Verify:**

```bash
npm test -- tests/summary/summarizeProviderResolution.test.js tests/chat/chatService.test.js tests/chat/aiSdkAdapter.test.js
npm test
npm run check
```

Inspect test spies to prove API key A/Base URL A never leak into a request for
profile B.

## Phase 4 — Multi-profile settings UI and feature pickers

1. Update `src/components/settings/AIProviderSettings.svelte`:
   - render singleton added providers plus dynamic profiles from
     `listAddedProviderEntries(settings)`;
   - continue excluding already-added singleton providers from the menu;
   - always show the repeatable OpenAI-compatible template in the Add menu;
   - clicking that template calls `addOpenAICompatibleProfile()`, selects the
     returned id, and opens its editor;
   - key each row by the stable id and display the profile's editable name.
2. Create
   `src/components/settings/OpenAICompatibleProfileConfig.svelte` for the
   profile editor. Reuse existing input/button styling and `ApiKeyInputMulti`,
   but write through the profile store helpers rather than mutating a nested
   Svelte proxy. Use Svelte 5 runes (`$state` for a local draft, `$derived` for
   validation, callback/event attributes) and provide:
   - profile name;
   - Base URL;
   - API key;
   - default model id;
   - inline validation without exposing the key;
   - remove action with the same visual language as current provider removal.
3. Keep `ProviderKeyConfig.svelte` for singleton providers. Do not add dynamic
   field-name tricks to it; the separate component keeps flat singleton storage
   and nested profile storage explicit.
4. Update `src/components/inputs/FeatureModelPicker.svelte` to use
   `listAddedProviderEntries(settings)` and profile-aware configuration/default
   helpers:
   - dynamic profiles participate in the existing “hide provider select when
     fewer than two configured providers” behavior;
   - selecting a profile initializes the model from its `defaultModel`;
   - an unconfigured/current profile remains visible with the existing warning;
   - renamed profiles update their label without changing the bound id;
   - dynamic profiles use the existing free-text model input.
5. Activate the idempotent reference migration after the dynamic UI and runtime
   are ready:
   - replace exact legacy provider id `openaiCompatible` with
     `openai-compatible-legacy` in Summary, Chat, Deep Dive, and quick models
     when that migrated profile exists;
   - remove the static `openaiCompatible` id from `addedProviders`;
   - do not rewrite already-dynamic ids or recreate a deleted legacy profile.
6. Add translated strings for profile name, default model, validation, create,
   and remove actions in every locale under `src/lib/locales/` (`en`, `de`,
   `es`, `fr`, `ja`, `ko`, `vi`, `zh-CN`). Reuse current provider settings keys
   where the wording already fits.
7. Extend `tests/settings/FeatureModelPicker.test.svelte.js` and add a focused
   Svelte component test for creating two profiles, renaming one, selecting
   each, auto-collapse behavior, and deletion/reference fallback.

**Verify:**

```bash
npm test -- tests/settings/FeatureModelPicker.test.svelte.js tests/settings/openAICompatibleProfiles.test.js
npm test
npm run check
npm run dev
```

In the unpacked Chrome build, add two OpenAI-compatible profiles. Confirm both
remain visible after closing/reopening settings, each has an independent key and
URL, and Summary/Chat/Deep Dive can select them independently.

## Phase 5 — Import/export, cloud sync, and compatibility polish

1. Ensure `SETTING_CATEGORIES.providers` in
   `src/lib/config/settingsSchema.js` explicitly includes
   `openaiCompatibleProfiles`; its current string heuristics will not categorize
   that collection as a provider setting.
2. Update ZIP import merge behavior in
   `src/components/settings/ExportImport.svelte`:
   - Replace mode replaces the normalized profile array;
   - Merge mode merges by stable id using the Phase 2 helper, retains local-only
     profiles, and lets imported data win for the same id;
   - both paths go through `normalizeStoredSettings()`/profile normalization,
     not only the shallow top-level sanitizer.
3. `src/lib/exportImport/exportService.js` should continue exporting the whole
   sanitized settings object. Add a test proving profile objects and credentials
   survive a backup round trip exactly once; do not add a second credential file
   for provider profiles.
4. Google Drive settings sync in
   `src/services/cloudSync/cloudSyncService.svelte.js` remains last-write-wins.
   Confirm `updateSettingsFromCloud()` normalizes profiles and migration is
   idempotent. Do not introduce an item-level merge that conflicts with the
   service's existing settings semantics.
5. Update
   `src/components/tools/cloudsync/SettingsConflictDialog.svelte` so its API-key
   count includes profile keys and does not double-count the flat compatibility
   mirror.
6. Document and test accepted older-client behavior: flat fields mirror only the
   currently selected Summary profile. An older extension can therefore use
   that one profile, but it cannot preserve or select the complete multi-profile
   collection. The current version must not lose profiles when importing or
   applying current-version cloud data.

**Verify:**

```bash
npm test
npm run check
```

Manual backup test: export with two profiles, delete them locally, import in
Replace mode and confirm both return; repeat Merge mode with one additional
local profile and confirm all three remain. If cloud sync credentials are
available, perform a two-device conflict preview and verify the displayed key
count is correct without duplicating the mirrored key.

## Phase 6 — Cross-browser end-to-end verification and handoff

1. Run all automated checks and production builds.
2. Test a fresh install and an upgrade fixture containing only the three legacy
   flat fields. The upgrade must create one `openai-compatible-legacy` profile,
   preserve Summary/Chat/Deep Dive choices, and remain idempotent over two
   reloads.
3. With two real or local test endpoints, verify from the network/background
   console that each feature uses its selected Base URL, API key, and model.
   Redact secrets from screenshots/logs.
4. Rename a profile while it is selected; all selections and persisted
   conversations must continue working because ids are stable.
5. Delete a selected profile; Summary/Chat/Deep Dive settings must repair to a
   configured fallback. Continuing a conversation that referenced the deleted
   profile must show the explicit fallback warning and update its metadata.
6. Verify English, Vietnamese, and one additional locale at desktop and narrow
   popup widths. No raw i18n keys, overflow, duplicate DOM ids, or newly
   introduced Svelte accessibility warnings.
7. Write `docs/openai-compatible-multi-profile-v1/walkthrough-Phase-N.md` after
   each implemented phase, following the repository's existing walkthrough
   convention.

**Verify:**

```bash
npm test
npm run check
npm run build
npm run build:firefox
git diff --check
```

Load `.output/chrome-mv3` (or the actual Chrome output directory emitted by
WXT) and `.output/firefox-mv2`/the emitted Firefox directory as appropriate;
complete the manual matrix above before declaring V1 complete.

## Out of scope (V1)

- Multiple keys and round-robin/failover within one profile.
- Automatic `/models` discovery for arbitrary OpenAI-compatible endpoints; the
  model id remains free text.
- Custom headers, query parameters, organization/project ids, or per-profile
  generation parameters.
- No-auth arbitrary OpenAI-compatible servers. Ollama and LM Studio remain the
  supported local/no-key choices in V1.
- Making Gemini, OpenAI, Groq, DeepSeek, OpenRouter, Cerebras, Ollama, or LM
  Studio repeatable.
- Encrypting local/cloud provider credentials or redesigning cloud sync.
- Removing the flat OpenAI-compatible compatibility fields in the same release.
- An IndexedDB schema migration or rewriting historical message provenance.
- A new “Test connection” UI; preserve or remove the currently unused helper as
  described in Phase 3.

## Final verification checklist

- [ ] `npm test` passes with no stale provider tests.
- [ ] `npm run check` has 0 errors and no new warnings introduced by this work.
- [ ] Chrome and Firefox production builds pass.
- [ ] Fresh users can create, rename, edit, and delete two or more profiles.
- [ ] Legacy flat settings migrate once to `openai-compatible-legacy` without
      data loss or repeated recreation.
- [ ] Summary, Chat, and Deep Dive independently select profiles by stable id.
- [ ] Blocking, streaming, retry, regenerate, and branch chat paths resolve the
      correct adapter overlay.
- [ ] Profile A credentials never appear in profile B requests or logs.
- [ ] Rename preserves selections and conversation continuity.
- [ ] Delete repairs feature settings and gives old conversations an explicit
      fallback warning.
- [ ] ZIP Replace/Merge and current-version cloud apply preserve nested profiles.
- [ ] Cloud conflict key counts do not double-count compatibility mirrors.
- [ ] English, Vietnamese, and one additional locale render without raw keys or
      layout regressions.
- [ ] `git diff --check` passes and each phase has a walkthrough.

## Notable files

- `src/lib/providers/openAICompatibleProfiles.js` — new pure profile identity,
  normalization, validation, and merge helpers.
- `src/stores/settingsStore.svelte.js` — profile defaults, migration, CRUD,
  reference repair, and compatibility mirrors.
- `src/lib/config/settingsSchema.js` — top-level allowlist/category support for
  the profile collection.
- `src/lib/providers/providerRegistry.js` — static-template plus dynamic-profile
  resolution and request overlay creation.
- `src/lib/providers/featureModelResolver.js` — feature selection/fallback for
  dynamic ids.
- `src/lib/api/api.js`, `src/lib/api/aiSdkAdapter.js` — Summary validation and
  static adapter execution with profile overlays.
- `src/services/chat/chatService.js` — persisted profile provenance, adapter
  conversion, and deleted-profile fallback.
- `src/services/tools/toolProviderService.js` — Deep Dive resolution.
- `src/components/settings/AIProviderSettings.svelte` — repeatable Add flow and
  combined provider/profile list.
- `src/components/settings/OpenAICompatibleProfileConfig.svelte` — nested
  profile editor.
- `src/components/inputs/FeatureModelPicker.svelte` — dynamic profile selection
  for Summary, Chat, and Deep Dive.
- `src/components/settings/ExportImport.svelte`,
  `src/lib/exportImport/exportService.js`, and
  `src/components/tools/cloudsync/SettingsConflictDialog.svelte` — persistence
  round trip and conflict presentation.
- `tests/settings/openAICompatibleProfiles.test.js` plus existing provider,
  picker, summary, adapter, and chat suites — regression coverage.
