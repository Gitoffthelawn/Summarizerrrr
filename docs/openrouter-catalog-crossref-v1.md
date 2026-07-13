# OpenRouter Catalog Cross-Reference — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session with no prior context. Start at Phase 1 and go in order. Each
> phase ends with a **Verify** step — don't move on until it passes. This plan
> is a focused companion to
> [`docs/model-context-discovery-v1.md`](./model-context-discovery-v1.md); read
> its Context section for background, but this file stands alone.

## Context

The chat context budgeter splits a fixed token budget between grounding sources
and history, derived from the **model's context window**, resolved by
`getProviderCapabilities(providerId, modelId)` in
[`src/lib/chat/providerCapabilities.js`](../src/lib/chat/providerCapabilities.js).

Today that resolver has **3 layers** (see
[`providerCapabilities.js:87`](../src/lib/chat/providerCapabilities.js#L87)):

1. **Runtime registry** (`discoveredCapabilities` Map, keyed `providerId:modelId`)
   — exact limits discovered from a provider's own `/models` API. Populated by
   `registerModelCapability(...)`. Groq / Cerebras / OpenRouter feed this when
   their API carries context length.
2. **Static table** (`KNOWN_MODEL_CAPABILITIES`) — hand-curated entries for
   providers whose API omits context length (`gemini`, `openai`, `chatgpt`,
   `deepseek`).
3. **Default fallback** — `DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000`.

### The gap this plan closes

Several **cloud** providers the app offers do **not** expose context length in
their `/models` response, so they rely on the hand-maintained static table or
fall through to a blind 128K default. When a new model ships (or the table
simply lacks it), the budgeter over- or under-estimates the window. Maintaining
that table by hand is toil and always lags reality.

**OpenRouter already solves this for us.** Its keyless endpoint
`GET https://openrouter.ai/api/v1/models` returns hundreds of models, each with
a real `context_length` and a **vendor-namespaced id** (`openai/gpt-4o`,
`anthropic/claude-3.5-sonnet`, `google/gemini-2.5-pro`,
`deepseek/deepseek-chat`). This is effectively a live, self-updating community
catalog of context windows — and the app **already fetches it** in
[`OpenrouterConfig.svelte`](../src/components/providerConfigs/OpenrouterConfig.svelte),
only to discard everything but the id list.

The idea: reuse that catalog as a **cross-reference layer** — when resolving the
window for a model on *another* cloud provider (e.g. `chatgpt` + `gpt-4o`), look
it up in the OpenRouter catalog (`openai/gpt-4o` → `context_length`) instead of
requiring a static-table entry.

### Why this is not a redesign, and where the risk is

- OpenRouter ids are vendor-namespaced; the app's per-provider model ids are
  **not** (`gpt-4o`, `deepseek-chat`, `gemini-2.5-pro`, sometimes with a date
  suffix like `claude-3-5-sonnet-20241022`). Bridging the two needs an **id
  normalization + vendor-scoped match** layer. That matching is the only real
  complexity, and it **must fail safe**: no confident match → fall through, never
  guess.
- This helps **cloud** providers only. **Local** providers (`ollama`,
  `lmstudio`, `openaiCompatible`) set their context window at runtime
  (`num_ctx` / loaded context), so OpenRouter's number for a same-named model is
  actively wrong. They are **excluded** from the catalog layer by construction.

### Goal & scope decision (confirmed with user)

- **Use OpenRouter purely as a cross-reference catalog for cloud models.** It is
  a new layer inside the *existing* resolver, not a parallel mechanism and not a
  replacement for a provider's own exact discovery.
- **Insert it below the curated static table, above the default.** New order:
  `discovered (exact) → static table (curated) → OpenRouter catalog (fuzzy,
  vendor-scoped, fail-safe) → default`. Curated entries always win; the catalog
  fills the gaps the table doesn't cover, replacing 128K guesses with real
  numbers. (This also means the static-table expansion sketched in the companion
  doc's Phase 3 becomes largely unnecessary for cloud providers.)
- **Never let the catalog touch local providers.** Only providers in an explicit
  `providerId → OpenRouter vendor` allowlist consult it. `ollama` / `lmstudio` /
  `openaiCompatible` / `groq` / `cerebras` are not in it (Groq/Cerebras already
  have exact discovery; local is runtime-configured).
- **Fetch keyless and persist.** The endpoint needs no API key. Cache the parsed
  catalog to local storage with a timestamp so it works offline and before the
  user ever opens OpenRouter settings; refresh when stale.
- **No new dependencies, no new remote services** beyond OpenRouter's own
  already-used `/models` endpoint. Do not change the budgeter's fraction policy,
  the exact `discovered` layer, or the local-discovery work (companion doc
  Phases 4–5).

## Phase 1 — Build the normalized catalog module (pure, unit-tested)

Create a self-contained module that turns an OpenRouter `/models` body into a
lookup usable by the resolver. No wiring into the resolver yet.

1. Create `src/lib/chat/openrouterCatalog.js` with:
   - `PROVIDER_VENDOR_MAP` — the allowlist mapping app `providerId` → OpenRouter
     vendor prefix. **Cloud, non-Groq/Cerebras, non-local only:**
     ```js
     const PROVIDER_VENDOR_MAP = {
       chatgpt: 'openai',
       openai: 'openai',
       deepseek: 'deepseek',
       gemini: 'google',
       anthropic: 'anthropic', // reserved: not a selectable provider today, harmless
     }
     ```
     (Deliberately excludes `ollama`, `lmstudio`, `openaiCompatible`, `groq`,
     `cerebras`, and `openrouter` itself.)
   - `normalizeModelSlug(id)` — lowercase; strip a leading `vendor/` prefix if
     present; drop a trailing date suffix (`/-\d{6,8}$/`) and a trailing
     `-latest`; unify separators by replacing `.` and `_` with `-`; collapse
     repeated `-`. Example equivalences it must produce:
     `openai/gpt-4o` → `gpt-4o`; `gpt-4o` → `gpt-4o`;
     `anthropic/claude-3.5-sonnet` → `claude-3-5-sonnet`;
     `claude-3-5-sonnet-20241022` → `claude-3-5-sonnet`;
     `google/gemini-2.5-pro` → `gemini-2-5-pro`; `gemini-2.5-pro` → `gemini-2-5-pro`.
   - `buildCatalog(body)` — from an OpenRouter `/models` body (`body.data[]`,
     each `{ id, context_length }`; ignore `top_provider` for V1), produce a Map
     keyed `"<vendor>:<normalizedSlug>"` → `contextWindowTokens`. Derive
     `<vendor>` from the id's namespace (`id.split('/')[0]`). Skip entries with
     no `/`, no positive numeric `context_length`, or a duplicate key (first
     wins). Return a plain object (JSON-serializable for storage) — callers wrap
     it in a Map as needed.
   - `lookupCatalogWindow(catalog, providerId, modelId)` — the fail-safe query.
     Resolve `vendor = PROVIDER_VENDOR_MAP[providerId]`; if none, return `null`
     (this is what excludes local providers). Otherwise look up
     `catalog["<vendor>:" + normalizeModelSlug(modelId)]`; return the number or
     `null`. Never throw, never partial-match across vendors.

2. Keep this module free of any storage or network import — it is pure data
   transformation, wired by later phases.

**Verify:** Create `tests/chat/openrouterCatalog.test.js` mirroring the style of
[`tests/chat/providerModelService.test.js`](../tests/chat/providerModelService.test.js).
Assert: `normalizeModelSlug` produces the equivalences listed above;
`buildCatalog` on a small fixture body maps `openai:gpt-4o → 128000` etc. and
skips malformed rows; `lookupCatalogWindow(catalog, 'chatgpt', 'gpt-4o')` returns
the number; `lookupCatalogWindow(catalog, 'ollama', 'gpt-4o')` returns `null`
(no vendor mapping); `lookupCatalogWindow(catalog, 'deepseek', 'totally-made-up')`
returns `null`. `npx vitest run tests/chat/openrouterCatalog.test.js` is green.

## Phase 2 — Insert the catalog as resolver layer 2.5 (fail-safe)

Wire the catalog into `getProviderCapabilities` **between** the static table and
the default, without disturbing the two layers above it.

1. In [`src/lib/chat/providerCapabilities.js`](../src/lib/chat/providerCapabilities.js):
   - Add a module-level `let openrouterCatalog = null` (a plain object or `null`).
   - Export `setOpenrouterCatalog(catalogObject)` — stores the object (validate
     it's a non-null object; ignore otherwise) so Phase 3 can hydrate it. Also
     export `clearOpenrouterCatalog()` as a test/reset hook, mirroring
     `clearDiscoveredCapabilities()`.
   - Import `lookupCatalogWindow` from `./openrouterCatalog.js`.
   - In `getProviderCapabilities`, **after** the `KNOWN_MODEL_CAPABILITIES`
     block returns nothing and **before** the default-fallback return, add:
     ```js
     // 3. OpenRouter catalog cross-reference (cloud providers only, fail-safe).
     if (openrouterCatalog && typeof modelId === 'string') {
       const catalogWindow = lookupCatalogWindow(openrouterCatalog, providerId, modelId)
       if (catalogWindow) {
         return {
           providerId,
           modelId,
           contextWindowTokens: catalogWindow,
           defaultOutputTokens: DEFAULT_OUTPUT_TOKENS,
           source: 'openrouter-catalog',
         }
       }
     }
     ```
   - Renumber the trailing comment so the default becomes layer 4. **Do not**
     reorder the existing exact-discovery or static-table layers.

2. Do **not** register catalog numbers into `discoveredCapabilities` — keep the
   catalog a separate, lower-priority source so an exact discovery or a curated
   table entry always overrides it.

**Verify:** Extend
[`tests/chat/contextPipeline/contextPipeline.test.js`](../tests/chat/contextPipeline/contextPipeline.test.js)
(mirror the existing capability assertions). With a catalog set via
`setOpenrouterCatalog({ 'openai:gpt-4o': 128000, 'deepseek:deepseek-chat': 64000 })`:
`getProviderCapabilities('chatgpt', 'gpt-4o')` → `128000`,
`source: 'openrouter-catalog'`; a curated static-table model still returns
`source: 'known-model'` (table wins); `getProviderCapabilities('ollama', 'gpt-4o')`
→ 128K/16K fallback, **not** `openrouter-catalog` (local excluded); an unknown
cloud model with no catalog entry still returns `source: 'default-fallback'`.
Call `clearOpenrouterCatalog()` in `afterEach`. `npx vitest run tests/chat/` is
green and `npm check` passes.

## Phase 3 — Populate & persist the catalog

Give the catalog a real data source and make it survive reloads, so the resolver
benefits even when the user never opens OpenRouter settings.

1. **Storage item.** In
   [`src/services/wxtStorageService.js`](../src/services/wxtStorageService.js),
   add (mirror the existing `defineItem` calls like `settingsStorage`):
   ```js
   export const openrouterCatalogStorage = storage.defineItem('local:openrouterCatalog', {
     fallback: { fetchedAt: 0, entries: {} }, // entries: { "<vendor>:<slug>": contextWindowTokens }
   })
   ```

2. **Fetch + persist helper.** In `src/lib/chat/openrouterCatalog.js` add
   `async function fetchAndStoreCatalog(fetchFn = fetch)`:
   - `GET https://openrouter.ai/api/v1/models` (keyless — no `Authorization`
     header, matching the current inline fetch).
   - On success: `const entries = buildCatalog(body)`, then
     `openrouterCatalogStorage.setValue({ fetchedAt: Date.now(), entries })`, and
     `setOpenrouterCatalog(entries)` so it's live immediately. Import the storage
     item here (this module may now import storage; keep `providerCapabilities.js`
     storage-free to avoid a cycle).
   - Wrap in try/catch; on failure log `[openrouterCatalog]` and return without
     throwing (offline must not break chat).
   - Export a `hydrateCatalogFromStorage()` that reads
     `openrouterCatalogStorage.getValue()`, calls `setOpenrouterCatalog(entries)`,
     and — if `entries` is empty or `fetchedAt` is older than
     `CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000` — kicks off `fetchAndStoreCatalog()`
     in the background (fire-and-forget; do not await).

3. **Hydrate on startup.** Find the chat boot path that already reads settings at
   startup (search for `settingsStorage.getValue()` in the side panel /
   background entry — same spot the companion doc's Phase 2 hydration targets)
   and call `hydrateCatalogFromStorage()` there, early, before the first chat
   `send()`. It must not block startup.

4. **Opportunistic refresh from the existing OpenRouter fetch.** Refactor
   [`OpenrouterConfig.svelte`](../src/components/providerConfigs/OpenrouterConfig.svelte)'s
   `onMount`: keep rendering the id list exactly as today, but after a successful
   fetch also call `setOpenrouterCatalog(buildCatalog(body))` and persist via
   `openrouterCatalogStorage.setValue(...)` (or simply call the shared helper and
   reuse its body). Do not change the combobox behavior or `modelLoadError`
   handling. This means opening OpenRouter settings refreshes the catalog for
   free.

**Verify:** In a dev build (`npm run dev`, load `.output/chrome`):
(a) Fresh profile, select provider **ChatGPT**, pick `gpt-4o`, start a chat
*without* opening OpenRouter settings. Add a temporary `console.log` in
`getProviderCapabilities` and confirm it resolves `source: 'openrouter-catalog'`
with `gpt-4o`'s real window (not a blind 128K default) once the background fetch
lands. (b) DevTools → Application → Extension storage shows `local:openrouterCatalog`
with `{ fetchedAt, entries: { "openai:gpt-4o": … } }`. (c) Reload the extension
without opening settings → the same model still resolves `source: 'openrouter-catalog'`
from persisted data. (d) Switch to **Ollama** with any model → it resolves the
local/default fallback, **never** `openrouter-catalog`. Remove the temp log.

## Phase 4 — Context window meter UI

Surface the resolved window and per-turn usage to the user. Most of the data
already flows to the UI — this phase adds a small emission + a meter component.
It reads better once Phases 1–3 land (the catalog makes `window` accurate), but
is independent and can ship on its own.

**What already exists (do not rebuild):**
- The budgeter computes `estimatedInputTokens` and `inputBudgetTokens`
  ([`contextBudgeter.js:185`](../src/lib/chat/contextPipeline/contextBudgeter.js#L185)).
- The pipeline returns `capabilities.contextWindowTokens` + `capabilities.source`
  ([`contextPipeline/index.js:73`](../src/lib/chat/contextPipeline/index.js#L73)).
- Warnings already flow: `onWarnings` in
  [`chatService.js:176`](../src/services/chat/chatService.js#L176) →
  `chatState.contextWarnings` in
  [`chatStore.svelte.js`](../src/stores/chatStore.svelte.js) →
  [`ChatContextWarning.svelte`](../src/components/chat/ChatContextWarning.svelte),
  rendered in [`ChatShell.svelte:45`](../src/components/chat/ChatShell.svelte#L45).

**Steps:**

1. **Emit usage alongside warnings.** In
   [`chatService.js`](../src/services/chat/chatService.js), wherever
   `onWarnings?.(pipeline.warnings)` fires (line ~176 for the send path; mirror
   in the edit/regenerate path near line ~259/420 that also has `onWarnings`),
   add an `onDiagnostics` callback:
   ```js
   onDiagnostics?.({
     used: pipeline.estimatedInputTokens,
     inputBudget: pipeline.inputBudgetTokens,       // see step 2
     window: pipeline.capabilities?.contextWindowTokens,
     source: pipeline.capabilities?.source,
   })
   ```
   Thread `onDiagnostics` through the same options object that already carries
   `onWarnings`/`onChunk`. It must be optional (never required).

2. **Expose `inputBudgetTokens` on the pipeline output.** In
   [`contextAssembler.js`](../src/lib/chat/contextPipeline/contextAssembler.js)
   (return block around line 60–67, which already forwards
   `estimatedInputTokens`), add `inputBudgetTokens: diagnostics?.inputBudgetTokens || 0`.
   (`budgetContext` already returns it; assemble just needs to pass it through.)

3. **Hold usage in the chat store.** In
   [`chatStore.svelte.js`](../src/stores/chatStore.svelte.js):
   - Add `contextUsage: null` to `createChatSessionState()` (next to
     `contextWarnings: []`), and reset it in the same spots `contextWarnings` is
     reset (the `contextWarnings: []` resets and the send-start patch ~line 351).
   - In the `chatService.send({...})` call (~line 358), add an `onDiagnostics`
     handler mirroring `onWarnings`:
     ```js
     onDiagnostics: (usage) => { writeSession(targetTabId, { contextUsage: usage }) },
     ```

4. **Meter component.** Create
   `src/components/chat/ChatContextMeter.svelte` — props `{ usage }`. Render
   nothing when `usage` is null. Otherwise a compact bar + label:
   - Percentage = `used / window` (clamp 0–100). Bar turns `warning` color above
     ~80%, `error` above ~95% (reuse the Tailwind `warning`/`error` tokens the
     warning component already uses).
   - Label: `~{formatK(used)} / {formatK(window)}` where `formatK(12300)` →
     `12.3K`. Prefix `~` because the estimate is `length / 4`, **not** a real
     tokenizer, and it reflects the **last sent turn** (pipeline runs on send),
     not live composer typing.
   - A small muted badge for `source` (`discovered` / `openrouter-catalog` /
     `known-model` / `default-fallback`) so users understand why the limit is
     that number — e.g. a `default-fallback` 128K is a guess, a `discovered`
     value is exact. Keep it subtle (tooltip or tiny text).
5. **Render it.** In [`ChatShell.svelte`](../src/components/chat/ChatShell.svelte),
   next to the existing `ChatContextWarning` (line 45), add
   `<ChatContextMeter usage={chatState.contextUsage} />`. Place it near the
   composer so it reads as "capacity of the next send".

**Verify:** In a dev build, start a chat and send a message with a large `@tab`
source attached. The meter appears showing `~<used> / <window>` with a filled
bar proportional to usage, and the `source` badge matches what
`getProviderCapabilities` resolved (e.g. `openrouter-catalog` once Phases 1–3
are in, or `default-fallback` before). Attach enough content to trip a
`Dropped source` warning and confirm the meter reads near/over 100% and the bar
shows the warning/error color, consistent with the existing warning text.
`npm check` passes.

## Out of scope (V1)

- **Local providers** (`ollama`, `lmstudio`, `openaiCompatible`) — their window
  is runtime-configured; keep their per-model discovery as in the companion doc
  (Phases 4–5). The catalog must never speak for them.
- **Replacing the exact-discovery layer.** Groq/Cerebras/OpenRouter keep their
  own precise `discoveredCapabilities` entries; the catalog is strictly a
  lower-priority gap-filler.
- **Using `top_provider.context_length` or per-route nuances.** V1 uses the
  model-level `context_length` as the proxy; refine only if it proves wrong.
- **Aggressive fuzzy matching** (version-family guessing, Levenshtein, etc.).
  V1 matches only on vendor + normalized slug and fails safe; broaden only if
  coverage proves insufficient.
- **Live/typing-time token preview in the meter (Phase 4).** V1 shows the
  last-sent turn's estimate. Running the budgeter against composer text on every
  keystroke for a real-time preview is a separate enhancement.
- **Exact tokenizer counts.** The meter uses the existing `length / 4` estimate;
  wiring a per-provider tokenizer is out of scope.
- Changing the budgeter's `SOURCE_BUDGET_FRACTION` or the `Dropped source`
  warning copy — separate concerns.

## Final verification checklist

- [ ] `npm check` passes (0 errors).
- [ ] `npx vitest run tests/chat/` is green, including the new
      `openrouterCatalog` tests and the resolver-layer assertions.
- [ ] `npm run build` succeeds (add `npm run build:firefox` if the startup
      hydration path touches a Firefox-specific entry).
- [ ] A cloud model with no static-table entry resolves `source: 'openrouter-catalog'`
      with a real window; a curated model still resolves `source: 'known-model'`
      (table wins); a local (`ollama`/`lmstudio`) model **never** resolves via
      the catalog; a truly unknown cloud model still resolves 128K default.
- [ ] Catalog survives an extension reload (persisted in `local:openrouterCatalog`)
      and refreshes when older than the TTL.
- [ ] (Phase 4) The context meter renders after a send, shows `~used / window`
      with a proportional bar and the correct `source` badge, and turns
      warning/error color near/over capacity.
- [ ] `git diff --check` reports no whitespace errors; no unrelated files changed.

## Notable files

- **`src/lib/chat/openrouterCatalog.js`** *(new)* — vendor map, id
  normalization, `buildCatalog`, `lookupCatalogWindow`, fetch/persist/hydrate
  helpers. The only place the OpenRouter-specific mapping logic lives.
- [`src/lib/chat/providerCapabilities.js`](../src/lib/chat/providerCapabilities.js)
  — add the catalog layer between the static table and the default, plus
  `setOpenrouterCatalog` / `clearOpenrouterCatalog`. **Do not** reorder the exact
  or static layers.
- [`src/services/wxtStorageService.js`](../src/services/wxtStorageService.js)
  — add `openrouterCatalogStorage` (mirror existing `defineItem` calls).
- [`src/components/providerConfigs/OpenrouterConfig.svelte`](../src/components/providerConfigs/OpenrouterConfig.svelte)
  — reuse its existing `/models` fetch to also refresh the catalog; keep the id
  list / combobox rendering unchanged.
- Chat startup entry (side panel / background, where `settingsStorage.getValue()`
  runs) — call `hydrateCatalogFromStorage()` early, non-blocking.
- [`tests/chat/openrouterCatalog.test.js`](../tests/chat/openrouterCatalog.test.js)
  *(new)* and
  [`tests/chat/contextPipeline/contextPipeline.test.js`](../tests/chat/contextPipeline/contextPipeline.test.js)
  — normalization/build/lookup tests + resolver-layer assertions.
- [`src/lib/chat/contextPipeline/index.js`](../src/lib/chat/contextPipeline/index.js)
  — the sole consumer of `getProviderCapabilities`; read-only reference for
  Phases 1–3.

**Phase 4 (meter UI):**

- **`src/components/chat/ChatContextMeter.svelte`** *(new)* — the bar + label +
  source badge; mirror [`ChatContextWarning.svelte`](../src/components/chat/ChatContextWarning.svelte)'s
  style and Tailwind tokens.
- [`src/services/chat/chatService.js`](../src/services/chat/chatService.js)
  — emit `onDiagnostics` wherever `onWarnings` fires (send + edit paths).
- [`src/lib/chat/contextPipeline/contextAssembler.js`](../src/lib/chat/contextPipeline/contextAssembler.js)
  — forward `inputBudgetTokens` in the assembled return.
- [`src/stores/chatStore.svelte.js`](../src/stores/chatStore.svelte.js)
  — add/reset `contextUsage` and wire the `onDiagnostics` handler.
- [`src/components/chat/ChatShell.svelte`](../src/components/chat/ChatShell.svelte)
  — render `<ChatContextMeter>` next to `ChatContextWarning` (line 45).
