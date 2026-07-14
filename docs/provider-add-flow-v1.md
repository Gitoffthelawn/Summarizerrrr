# Provider Settings — Remove Basic/Advanced, add "Add provider" flow — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — don't move on until it passes.

## Context

The provider-settings restructure (`docs/provider-settings-restructure-v1.md`) is
already implemented, but the resulting UI keeps a **Basic/Advanced** split that no
longer fits. Today:

- `src/components/settings/AIProviderSettings.svelte` ("Model AI" section) has a
  Basic/Advanced `Switch`. **Advanced** mode renders **all 9 providers** as an
  accordion of `ProviderKeyConfig` cards; **Basic** mode renders a Gemini-only
  `GeminiBasicConfig`.
- `SummarySettings.svelte` has its **own** `isSummaryAdvancedMode` toggle that gates
  both the `FeatureModelPicker` **and** the Custom Prompts section.
- `ChatSettings.svelte` gates its `FeatureModelPicker` on the global `isAdvancedMode`.
- `FeatureModelPicker.svelte` always renders a provider dropdown (fed by
  `listConfiguredProviders`), even when only one provider is configured.

The desired model is simpler:

- **Drop Basic/Advanced entirely.**
- Providers become things you **explicitly add**: an **"Add provider"** button, with
  **Gemini present by default**. You add the providers you use, then enter their key.
- In the per-feature pickers (Summary / Chat / Deep Dive): if **only one provider is
  configured** (has a key), show **only a model selector** — no provider dropdown. If
  **two or more providers have keys**, show the provider selector too.

### Goal & scope decision (confirmed with user)

- **Custom Prompts** (currently gated by the Summary Advanced toggle) → **always
  visible** in the Summary panel, not gated by any advanced flag (each prompt keeps
  its own per-item on/off switch).
- **Deep Dive** → remove its own "Gemini Basic / Custom" toggle; it uses the same
  auto-collapsing `FeatureModelPicker` as Summary/Chat.
- **Removing an added provider is non-destructive**: it drops the card but keeps the
  stored API key (re-adding restores it). **Gemini cannot be removed.**
- **Keep** `isAdvancedMode` / `isSummaryAdvancedMode` keys in the schema and the mirror
  writes as **vestigial sync keys** — they stop driving UI/resolution but stay for
  legacy-client sync compatibility. No new dependencies, no IndexedDB changes.

### Facts the executor needs (verified during exploration)

- Provider availability is **derived** via `isProviderConfigured(id, settings)` in
  `src/lib/providers/providerRegistry.js` (has a non-empty key, or `requiresKey: false`
  with a non-empty endpoint). There is **no** stored "added/enabled" flag today — that
  is genuinely new state.
- `PROVIDER_LIST` in the registry has **9** entries (`geminiAdvanced` was merged into
  `gemini`). Helpers already present: `getProvider`, `listConfiguredProviders`,
  `isProviderConfigured`, `getApiKey`, `getDefaultModel`, `getLegacyModel`.
- `sanitizeSettings` in `src/lib/config/settingsSchema.js` **strips any key not in
  `VALID_SETTING_KEYS`** — new settings keys MUST be registered there or they vanish on
  every load/save/sync.
- `applyFeatureModelMirrors` (`settingsStore.svelte.js`) already mirrors a `summarize`
  block change onto `selectedProvider` + `selected*Model` (and flips the advanced
  flags). This keeps the legacy keys correct after we remove the force branches.
- The "force Gemini when not advanced" logic lives in:
  - `src/lib/providers/featureModelResolver.js` line ~31.
  - `src/stores/summaryStore.svelte.js` at **5** sites: lines ~313, 505, 641, 1309, 1498
    (`if (!userSettings.isAdvancedMode) selectedProviderId = 'gemini'`).
  - Custom-prompt gating on `isSummaryAdvancedMode` is in `src/lib/api/api.js` at lines
    ~161, 260, 532.
- Gemini's **thinking-level** control (`geminiThinkingLevel`, 3 `ButtonSet`s) exists
  **only** in `GeminiBasicConfig.svelte`. It must be ported into Gemini's provider card
  before that component is deleted.

## Phase 1 — New `addedProviders` state + migration

1. `src/stores/settingsStore.svelte.js`:
   - Add `addedProviders: ['gemini']` to `DEFAULT_SETTINGS`.
   - Add two store helpers (near `updateFeatureSettings`):
     - `addProvider(id)` — dedupe-append `id` to `addedProviders` via `updateSettings`.
     - `removeProvider(id)` — filter `id` out; **never** remove `'gemini'`;
       **do not** clear the provider's API key (non-destructive).
   - In the migration path (`migrateFeatureModelSettings` / wherever
     `normalizeStoredSettings` seeds absent blocks): when `addedProviders` is absent,
     seed it to `['gemini']` ∪ `listConfiguredProviders(settings).map(p => p.id)` so
     existing users keep every provider they already keyed. Make it idempotent (only
     when absent).
2. `src/lib/config/settingsSchema.js`: append `'addedProviders'` to `VALID_SETTING_KEYS`
   (Provider Configuration area).

**Verify:**

```bash
npm test                # existing suites still pass
npm check
```

Add/extend a migration test asserting: fresh install → `addedProviders === ['gemini']`;
a legacy settings object with `deepseekApiKey` set → `addedProviders` contains both
`gemini` and `deepseek`; running migration twice is idempotent.

## Phase 2 — "Model AI" settings: added-list + Add provider button

1. Rewrite `src/components/settings/AIProviderSettings.svelte`:
   - **Remove** the Basic/Advanced `Switch`, `TextScramble`, `handleAdvancedModeToggle`,
     the `GeminiBasicConfig` import, and the entire `{#if settings.isAdvancedMode}` /
     `{:else}` split.
   - Render one `ProviderKeyConfig` per id in `settings.addedProviders`
     (`getProvider(id)`), keeping the existing single-open accordion state
     (`expandedProviderId` / `toggleProvider`).
   - Add an **"Add provider"** control below the list: a small menu of not-yet-added
     providers (`PROVIDER_LIST.filter(p => !settings.addedProviders.includes(p.id))`);
     selecting one calls `addProvider(id)` and auto-expands it.
   - Keep the streaming / non-streaming `ButtonSet` (now always shown) and the
     setup-guide link.
2. `src/components/settings/ProviderKeyConfig.svelte`:
   - Add an optional **remove** control (props `removable`, `onRemove`) in the header,
     shown for non-Gemini cards → `removeProvider(entry.id)`.
   - Add a **Gemini-only** thinking-level block (`{#if entry.id === 'gemini'}`) with the
     3 `ButtonSet`s writing `geminiThinkingLevel`, ported from `GeminiBasicConfig.svelte`
     (reuse the existing `settings.gemini_basic_config.thinking_level*` i18n keys).

**Verify:** `npm run dev`, load `.output/chrome`. Only Gemini shows initially; "Add
provider" adds a keyless card that persists across a settings reload; removing a
non-Gemini provider drops its card but keeps its key on re-add; Gemini has no remove
button and shows thinking-level buttons that persist.

## Phase 3 — Feature picker auto-collapse

Edit `src/components/inputs/FeatureModelPicker.svelte` to implement the "hide provider
dropdown when ≤1 provider has a key" rule:

- Compute `configured = listConfiguredProviders(settings)`.
- **If `configured.length <= 1`:** hide the provider `ReusableSelect`. Let
  `effectiveProvider = configured[0]?.id ?? 'gemini'`; if the bound `provider` differs,
  fire `onchange(effectiveProvider, <its current or default model>)` to keep the feature
  block consistent; render **only** the model control for `effectiveProvider` (per its
  `modelSource`: discovery / static / freeText).
- **If `configured.length >= 2`:** current behavior — provider dropdown (fed by
  `listConfiguredProviders`, plus the current selection if unconfigured, with the
  `(unconfigured)` suffix) + model control.

**Verify:** add/extend a `FeatureModelPicker` test asserting the provider dropdown is
absent with ≤1 configured provider and present with ≥2. Then manually: with only Gemini
keyed, Summary/Chat show a model-only control; after adding+keying a second provider, the
provider dropdown appears.

## Phase 4 — Per-feature screens use the pickers unconditionally

1. `src/components/settings/SummarySettings.svelte`:
   - Remove the `isSummaryAdvancedMode` `Switch` + its `TextScramble`.
   - Always render `FeatureModelPicker` bound to `settings.summarize`; delete the
     "Uses Gemini Basic" `{:else}` block.
   - Move the **Custom Prompts** section out of the `{#if settings.isSummaryAdvancedMode}`
     block so it renders **always** (no toggle/disclosure). Each prompt still has its own
     per-item on/off switch.
2. `src/components/settings/ChatSettings.svelte`: remove the `{#if settings.isAdvancedMode}`
   gate; always render `FeatureModelPicker` bound to `settings.chat`; delete the
   "Uses Gemini Basic" block.
3. `src/components/settings/tools/DeepDiveToolSettings.svelte`:
   - Remove the `useGeminiBasic` `ButtonSet`; always render `FeatureModelPicker` bound to
     `tools.deepDive.customProvider/customModel`.
   - Force `tools.deepDive.useGeminiBasic = false` (via migration + on mount) so
     `toolProviderService` always resolves the custom provider — it already falls back
     through `getFallbackProvider` when unconfigured, so Gemini-only users still get a
     working model-only picker.

**Verify:** `npm run dev`. Summary shows the picker + a collapsible Custom Prompts
section (enabling an item applies at runtime). Chat shows the picker. Deep Dive shows no
Basic/Custom toggle and a model-only picker with one provider.

## Phase 5 — Retire the Basic/Advanced runtime forcing

1. `src/lib/providers/featureModelResolver.js`: delete the
   `if (settings.isAdvancedMode === false) { … force gemini … }` branch. Always read
   `settings[feature].provider/model`, then the legacy fallback, then the existing
   "unconfigured → Gemini" fallback.
2. `src/stores/summaryStore.svelte.js`: at all **5** sites, remove the
   `if (!userSettings.isAdvancedMode) selectedProviderId = 'gemini'` force so
   `selectedProviderId = userSettings.selectedProvider || 'gemini'` (kept correct by the
   summarize mirror).
3. `src/lib/api/api.js`: drop the `userSettings.isSummaryAdvancedMode &&` condition at the
   3 custom-prompt sites so custom prompts apply based purely on their per-item selection
   + content.
4. Keep `isAdvancedMode` / `isSummaryAdvancedMode` in `DEFAULT_SETTINGS`,
   `VALID_SETTING_KEYS`, and the mirror writes (vestigial sync keys only).

**Verify:**

```bash
npm test
grep -rn "Force Gemini in basic mode" src/   # expect zero hits
```

Update/remove the old "basic-mode force" assertions in the resolver test; add one
asserting `resolveFeatureModel('summarize', settings)` honors the feature block
**regardless of `isAdvancedMode`**. Manual: with `isAdvancedMode` absent/false, a
non-Gemini configured provider is actually used for summarize (check the network call).

## Phase 6 — Delete dead components + i18n

1. Delete `src/components/providerConfigs/GeminiBasicConfig.svelte` (thinking-level now
   lives in `ProviderKeyConfig`). `grep -rn GeminiBasicConfig src/` must be clean.
2. Delete `src/components/inputs/ProvidersSelect.svelte` (already unused); confirm no
   importers.
3. i18n — add new keys to **all 8** locales in `src/lib/locales/` (`en`, `de`, `es`, `fr`,
   `ja`, `ko`, `vi`, `zh-CN`), reusing existing `settings.*` keys where possible:
   - `settings.provider_key_config.add_provider` ("Add provider")
   - `settings.provider_key_config.remove_provider` ("Remove")
   - (Custom Prompts reuses the existing `settings.summary.custom_prompts.*` keys — no
     new strings needed.)

**Verify:**

```bash
npm test
npm check
npm run build
npm run build:firefox
grep -rn "GeminiBasicConfig\|ProvidersSelect" src/   # expect no dead refs
```

Switch UI language to `vi` and one more locale — no raw i18n ids in the settings UI.

## Out of scope (V1)

- Removing the legacy `selectedProvider` / `selected*Model` / `isAdvancedMode` keys — kept
  as sync mirrors for at least one release.
- Chat quick-model switcher and per-feature reasoning control (see
  `docs/chat-model-quick-select-v1.md`, `docs/chat-reasoning-control-v1.md`).
- Rewriting the `getAISDKModel` switch or `providerModelService.PROVIDER_CONFIG`.
- Per-provider default-model selection on the Providers tab.

## Final verification checklist

- [ ] `npm test`, `npm check`, `npm run build`, `npm run build:firefox` all pass.
- [ ] Fresh install: only Gemini card; enter a key → Summary/Chat show model-only.
- [ ] "Add provider" adds a keyless card that persists; keying it makes the feature
      pickers show the provider dropdown (≥2 configured).
- [ ] Removing a provider is non-destructive; Gemini is not removable.
- [ ] Gemini thinking-level control works from its provider card.
- [ ] Custom Prompts are always visible and apply at runtime when enabled.
- [ ] Deep Dive has no Basic/Custom toggle; picker auto-collapses with one provider.
- [ ] Summarize actually uses the chosen non-Gemini provider (mirrors updated).
- [ ] `grep` shows no `GeminiBasicConfig`/`ProvidersSelect` dead refs; no raw i18n ids.
- [ ] `git diff --check` passes.

## Notable files

- `src/stores/settingsStore.svelte.js` — `addedProviders` default, `addProvider`/
  `removeProvider`, seed migration.
- `src/lib/config/settingsSchema.js` — `'addedProviders'` in `VALID_SETTING_KEYS`.
- `src/components/settings/AIProviderSettings.svelte` — remove toggle; added-list + Add
  provider button.
- `src/components/settings/ProviderKeyConfig.svelte` — remove control + Gemini
  thinking-level block.
- `src/components/inputs/FeatureModelPicker.svelte` — hide provider dropdown when ≤1
  configured.
- `src/components/settings/SummarySettings.svelte` — drop advanced toggle; Custom Prompts
  always visible.
- `src/components/settings/ChatSettings.svelte` — always show picker.
- `src/components/settings/tools/DeepDiveToolSettings.svelte` — drop Basic/Custom toggle.
- `src/lib/providers/featureModelResolver.js`, `src/stores/summaryStore.svelte.js`,
  `src/lib/api/api.js` — retire Basic/Advanced runtime forcing.
- **Deleted:** `src/components/providerConfigs/GeminiBasicConfig.svelte`,
  `src/components/inputs/ProvidersSelect.svelte`.
