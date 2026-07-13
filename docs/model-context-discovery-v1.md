# Automatic Model Context-Window Discovery — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session with no prior context. Start at Phase 1 and go in order. Each
> phase ends with a **Verify** step — don't move on until it passes.

## Context

The chat context budgeter ([`src/lib/chat/contextPipeline/contextBudgeter.js`](../src/lib/chat/contextPipeline/contextBudgeter.js))
splits a fixed token budget between grounding sources and history. That budget is
derived from the **model's context window**, resolved by
`getProviderCapabilities(providerId, modelId)` in
[`src/lib/chat/providerCapabilities.js`](../src/lib/chat/providerCapabilities.js).

A prior change already landed a **3-layer resolver** there:

1. **Runtime registry** (`discoveredCapabilities` Map) — exact limits discovered
   from a provider's models API. Populated via `registerModelCapability(providerId, modelId, { contextWindowTokens })`.
   Consulted first.
2. **Static table** (`KNOWN_MODEL_CAPABILITIES`) — providers whose API omits
   context length: currently `gemini`, `openai`, `chatgpt`, `deepseek`.
3. **Default fallback** — `DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000` for unknown
   models (`source: 'default-fallback'`).

Discovery-side, [`src/lib/api/providerModelService.js`](../src/lib/api/providerModelService.js)
has `fetchProviderModels(providerId, apiKey, fetchFn)` and a helper
`registerCapabilitiesFromBody(providerId, body)` that already reads both
`context_window` (Groq) and `context_length` (OpenRouter) from a `/models`
response and feeds the registry. **Groq is fully wired today.**

### The problem this plan solves

Discovery is **fragmented and incomplete**, so most providers still fall back to
the 128K default — which is fine when the real window is ≥128K but **dangerous
when it is smaller** (over-estimating a small local model makes the budgeter pack
too much and the API returns a hard context-length error, which is worse than a
dropped-source warning). Concretely today:

- **Groq / Cerebras** → go through `providerModelService.js`. ✅ registered.
- **OpenRouter** → fetched **inline** in
  [`src/components/providerConfigs/OpenrouterConfig.svelte`](../src/components/providerConfigs/OpenrouterConfig.svelte)
  (`onMount` → `fetch('https://openrouter.ai/api/v1/models')` → `body.data.map(m => m.id)`).
  The response carries `context_length` per model, but it is **discarded** and
  never reaches the registry.
- **Ollama** → fetched inline in
  [`src/components/providerConfigs/OllamaConfig.svelte`](../src/components/providerConfigs/OllamaConfig.svelte)
  (`fetch('${endpoint}api/tags')` → `data.models.map(m => m.name)`). `/api/tags`
  does **not** include context length — needs a per-model `/api/show` call
  (`model_info["<arch>.context_length"]`).
- **LM Studio** → no dynamic discovery at all. Its native REST endpoint
  `GET {endpoint}/api/v0/models` returns `max_context_length` per model.
- **Gemini** → static table only (families 2.5/3.x = 1M, gemma-4 = 128K). Good
  enough; dynamic `inputTokenLimit` via `/v1beta/models` is optional polish.
- **OpenAI / DeepSeek / Anthropic** → their `/models` APIs **omit** context
  length by design, so these must stay in the static table. Anthropic (Claude)
  is offered but **absent** from the table → currently 128K default (Claude is
  200K).

Two secondary gaps:

- The registry is **runtime-only**. It is populated only when the user opens the
  model picker in Settings (which triggers discovery). If they haven't this
  session, the pipeline uses the static table / fallback. Discovered limits
  should **persist** across sessions.
- The 128K default over-estimates **local** models (Ollama/LM Studio commonly
  8K–32K) until they're discovered.

### Goal & scope decision (confirmed with user)

- **Extend the existing 3-layer resolver — do not redesign it.** Reuse
  `registerModelCapability` and `registerCapabilitiesFromBody`; don't invent a
  parallel mechanism.
- **Consolidate discovery through `providerModelService.js`.** Move OpenRouter
  (and add Ollama/LM Studio) into that service so context capture happens in one
  place, rather than scattering `registerModelCapability` calls across Svelte
  components. Components call the service and render the returned id list exactly
  as before.
- **`fetchProviderModels` keeps returning `string[]`** (ids). Callers
  (`ProviderModelSelect.svelte`, the config components) rely on that shape
  (`.includes()`, array spread). Capability capture stays a **side-effect** into
  the registry.
- **Persist discovered capabilities** to local storage so the pipeline benefits
  even before Settings is opened.
- **Protect against over-estimation**: give known-small-context providers
  (`ollama`, `lmstudio`) a lower per-provider default until a real value is
  discovered.
- **No new dependencies, no new remote services** beyond the providers' own
  already-used endpoints. Do not touch the budgeter's fraction policy or the
  legacy summary/archive/deep-dive paths.

## Phase 1 — OpenRouter: capture `context_length` via the shared service

Highest value (this is where "very many models" live) and lowest risk — the
response field already exists and `registerCapabilitiesFromBody` already reads it.

1. In [`src/lib/api/providerModelService.js`](../src/lib/api/providerModelService.js),
   add an `openrouter` entry to `PROVIDER_CONFIG`:
   ```js
   openrouter: { url: 'https://openrouter.ai/api/v1/models', requiresApiKey: false },
   ```
   Add a matching `FALLBACK_PROVIDER_MODELS.openrouter` (a short curated list of
   common ids is fine; copy whatever the current OpenRouter UI shows as defaults,
   or an empty array if none).
2. `normalizeModels` currently filters Groq-specifically and otherwise passes all
   ids — confirm it handles an OpenRouter body (it should: it only special-cases
   `providerId === 'groq'`). `registerCapabilitiesFromBody` already reads
   `model.context_length`, so no change needed there.
3. Refactor [`src/components/providerConfigs/OpenrouterConfig.svelte`](../src/components/providerConfigs/OpenrouterConfig.svelte)
   to call `fetchProviderModels('openrouter')` in `onMount` instead of its inline
   `fetch(...)`. Map the returned ids into `openrouterModels` exactly as today
   (`comboboxItems` derivation is unchanged). Keep the existing `modelLoadError`
   handling. This deletes the duplicate inline fetch and routes capture through
   the registry.

**Verify:** In a dev build, open Settings → OpenRouter provider. The model list
still loads. Add a temporary `console.log` (or a breakpoint) in
`getProviderCapabilities` and start a chat on an OpenRouter model — confirm it
returns `source: 'discovered'` with the model's real `contextWindowTokens`
(e.g. a 1M-context model reports 1_000_000, not 128_000). Remove the temp log.

## Phase 2 — Persist discovered capabilities across sessions

Make the registry survive reloads so the pipeline sees real limits even when the
user never opens Settings this session.

1. In [`src/services/wxtStorageService.js`](../src/services/wxtStorageService.js),
   add a storage item mirroring the existing `defineItem` pattern:
   ```js
   export const modelCapabilitiesStorage = storage.defineItem('local:modelCapabilities', {
     fallback: {}, // { "<providerId>:<modelId>": { contextWindowTokens, defaultOutputTokens? } }
   })
   ```
2. In [`src/lib/chat/providerCapabilities.js`](../src/lib/chat/providerCapabilities.js):
   - Add `export function hydrateDiscoveredCapabilities(entries)` that bulk-loads
     a plain object/map into `discoveredCapabilities` (reusing the same
     validation as `registerModelCapability`).
   - Add `export function snapshotDiscoveredCapabilities()` returning a plain
     object of the current map (for persistence).
   - Keep the module free of a direct storage import (no cycle); persistence is
     wired by the caller below.
3. Persist on write: after discovery registers new capabilities (in
   `fetchProviderModels`, or a thin wrapper), call `modelCapabilitiesStorage.setValue(snapshotDiscoveredCapabilities())`.
   Debounce/merge is unnecessary at this scale.
4. Hydrate on startup: in the side panel / background entry that already boots
   chat (search for where `settingsStorage.getValue()` is read at startup), call
   `modelCapabilitiesStorage.getValue().then(hydrateDiscoveredCapabilities)`
   early, before the first `send()`.

**Verify:** In a dev build, open Settings once to trigger discovery, then reload
the extension **without** reopening Settings. Start a chat and confirm (temp log
in `getProviderCapabilities`) the model still resolves `source: 'discovered'`.
Inspect DevTools → Application → Extension storage: `local:modelCapabilities`
holds the `{ "provider:model": { contextWindowTokens } }` map.

## Phase 3 — Expand the static table + per-provider safe fallback

Cover providers whose API omits context length, and stop over-estimating small
local models.

1. In `KNOWN_MODEL_CAPABILITIES` ([`providerCapabilities.js`](../src/lib/chat/providerCapabilities.js))
   add:
   - `anthropic` — Claude models (`/^claude-/`) → `200_000`.
   - Broaden `openai`/`chatgpt` families if the app offers non-`gpt-5`/`o*`
     models (e.g. `gpt-4o` → 128_000). Only add patterns for models the app
     actually lists in its OpenAI config.
   - Leave `deepseek` (already 64K) as-is.
2. Introduce a per-provider fallback so unknown **local** models aren't assumed
   128K. Add:
   ```js
   const PROVIDER_FALLBACK_CONTEXT = { ollama: 16_384, lmstudio: 16_384 }
   ```
   In `getProviderCapabilities`, the layer-3 fallback becomes
   `PROVIDER_FALLBACK_CONTEXT[providerId] ?? DEFAULT_CONTEXT_WINDOW_TOKENS`.
   (Phases 4–5 then replace these with discovered values when available.)

**Verify:** `npm check` passes. Add unit assertions in
[`tests/chat/contextPipeline/contextPipeline.test.js`](../tests/chat/contextPipeline/contextPipeline.test.js)
mirroring the existing capability tests: `getProviderCapabilities('anthropic', 'claude-...')`
→ 200_000 `source: 'known-model'`; `getProviderCapabilities('ollama', 'unknown-model')`
→ 16_384 `source: 'default-fallback'`. `npx vitest run tests/chat/` is green.

## Phase 4 — Ollama discovery via `/api/show`

`/api/tags` lists names only; the real window comes from `/api/show` per model.

1. In `providerModelService.js`, add `ollama` handling. Because Ollama's endpoint
   is user-configured (`settings.ollamaEndpoint`) and needs per-model detail,
   give it a dedicated path rather than the generic `PROVIDER_CONFIG` shape:
   - List names via `GET {endpoint}api/tags` → `data.models[].name` (mirror the
     current `OllamaConfig.svelte` logic).
   - For each name, `POST {endpoint}api/show` with `{ name }`; read
     `model_info["<arch>.context_length"]` where `<arch> = model_info["general.architecture"]`.
     Register via `registerModelCapability('ollama', name, { contextWindowTokens })`.
   - Fetch `/api/show` calls **lazily/capped** (e.g. only for the currently
     selected model, or throttle) to avoid an N+1 storm on large local catalogs.
2. Refactor [`src/components/providerConfigs/OllamaConfig.svelte`](../src/components/providerConfigs/OllamaConfig.svelte)
   to call the new service function; keep rendering `ollamaModels` as names.

**Verify:** With a local Ollama running, open Settings → Ollama. Model list loads.
Select a model whose context you know (e.g. an 8K model). Confirm (temp log) the
pipeline resolves that model to `source: 'discovered'` with the correct small
window — and that a chat with a large source now truncates/drops predictably
rather than erroring with a context-length API error.

## Phase 5 — LM Studio discovery via `/api/v0/models`

1. In `providerModelService.js`, add `lmstudio` handling: `GET {endpoint}/api/v0/models`
   returns objects with `id` and `max_context_length` (and `loaded_context_length`).
   Register `registerModelCapability('lmstudio', id, { contextWindowTokens: max_context_length })`.
   Fall back to the OpenAI-compatible `GET {endpoint}/v1/models` (ids only) if the
   native endpoint isn't present.
2. Wire whichever config surface lists LM Studio models to call it (search for
   `LMStudioConfig.svelte`; it currently has no discovery — add one modeled on
   the Ollama refactor).

**Verify:** With LM Studio running and a model loaded, open its Settings config.
Model list loads and (temp log) the loaded model resolves `source: 'discovered'`
with `max_context_length`. `npm check` passes.

## Phase 6 (optional polish) — Gemini dynamic `inputTokenLimit`

The static table already covers Gemini families well, so this is optional. If
done: `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` →
each model has `inputTokenLimit`; register it so newly released Gemini models are
correct without a table edit. Guard the API key; never place it in logs.

**Verify:** Temp log shows a current Gemini model resolving `source: 'discovered'`
with its `inputTokenLimit`, and an unlisted future-named Gemini model resolves
correctly instead of falling to the static family default.

## Out of scope (V1)

- Changing the budgeter's `SOURCE_BUDGET_FRACTION` (0.6) or making `@` sources
  soft-truncate instead of drop-whole. Separate concern; the earlier
  `Dropped source` warning is mitigated by correct context windows here.
- Improving the `Dropped source <uuid>` warning copy (worth doing, but tracked
  separately from discovery).
- A bundled community dataset (LiteLLM `model_prices_and_context_window.json` /
  models.dev) as a catch-all. Viable alternative to per-provider wiring, but adds
  a data dependency and staleness; revisit only if per-provider coverage proves
  insufficient.
- OpenAI / DeepSeek / Anthropic dynamic discovery — their APIs don't expose
  context length; the static table is the correct home for them.

## Final verification checklist

- [ ] `npm check` passes (0 errors).
- [ ] `npx vitest run tests/chat/` is green, including new capability assertions.
- [ ] `npm run build` succeeds (add `npm run build:firefox` if any Firefox path
      was touched).
- [ ] OpenRouter, Groq, (and any wired local provider) resolve `source: 'discovered'`
      with real windows; Anthropic resolves 200K via the static table; a truly
      unknown cloud model still resolves 128K; an unknown `ollama`/`lmstudio`
      model resolves the conservative 16K, not 128K.
- [ ] Discovered capabilities survive an extension reload (persisted in
      `local:modelCapabilities`).
- [ ] `git diff --check` reports no whitespace errors; no unrelated files changed.

## Notable files

- [`src/lib/chat/providerCapabilities.js`](../src/lib/chat/providerCapabilities.js)
  — 3-layer resolver; add static entries, per-provider fallback, and
  hydrate/snapshot helpers. **Do not** change the resolution order.
- [`src/lib/api/providerModelService.js`](../src/lib/api/providerModelService.js)
  — the single place discovery + `registerCapabilitiesFromBody` live; add
  OpenRouter/Ollama/LM Studio here.
- [`src/services/wxtStorageService.js`](../src/services/wxtStorageService.js)
  — add the `modelCapabilitiesStorage` item (mirror existing `defineItem` calls).
- [`src/components/providerConfigs/OpenrouterConfig.svelte`](../src/components/providerConfigs/OpenrouterConfig.svelte),
  [`OllamaConfig.svelte`](../src/components/providerConfigs/OllamaConfig.svelte),
  `LMStudioConfig.svelte` — replace inline/absent discovery with the shared
  service; keep rendering id lists unchanged.
- [`src/components/providerConfigs/ProviderModelSelect.svelte`](../src/components/providerConfigs/ProviderModelSelect.svelte)
  — reference caller; confirms `fetchProviderModels` must keep returning `string[]`.
- [`tests/chat/contextPipeline/contextPipeline.test.js`](../tests/chat/contextPipeline/contextPipeline.test.js),
  [`tests/chat/providerModelService.test.js`](../tests/chat/providerModelService.test.js)
  — existing capability/discovery tests to mirror for the new providers.
- [`src/lib/chat/contextPipeline/contextBudgeter.js`](../src/lib/chat/contextPipeline/contextBudgeter.js)
  — the consumer of the resolved window; read-only reference, do not modify.
```
