---
type: plan
status: done
---

# Feature Reasoning Control — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — do not move on until it passes.

## Context

Gemini's "Thinking Level" (Minimal/Medium/High) currently lives in the **provider**
configuration UI — [`src/components/settings/ProviderKeyConfig.svelte`](../src/components/settings/ProviderKeyConfig.svelte)
lines 216–247, gated by `{#if isExpanded && entry.id === 'gemini'}`. It writes to a flat
global settings key `geminiThinkingLevel` (default `'minimal'`, declared at
[`settingsStore.svelte.js:29`](../src/stores/settingsStore.svelte.js)).

The adapter then reads that key **directly out of settings**, at two identical sites in
[`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js) — lines ~385–393
(`generateContentRequest`) and ~660–668 (`generateContentStreamRequest`):

```js
const hasExplicitReasoning = 'reasoning' in generationOptions
const thinkingLevel = currentSettings.geminiThinkingLevel || 'high'
const thinkingProviderOptions =
  providerId === 'gemini' && !hasExplicitReasoning
    ? buildThinkingProviderOptions(modelName, thinkingLevel)
    : {}
```

This is wrong on two counts:

1. **Wrong home.** Thinking level is a property of the *task*, not the *provider*.
   Summarization needs little or no reasoning; Deep Dive is a different workload. One
   global key cannot express that, and it silently applies to every Gemini call.
2. **Wrong plumbing.** Chat already solved this correctly: `chat-reasoning-control-v1`
   added a per-session control next to Send
   ([`ChatReasoningSelect.svelte`](../src/components/chat/ChatReasoningSelect.svelte))
   that passes reasoning as a **request parameter**. The `'reasoning' in generationOptions`
   guard above exists purely so the two systems don't collide. Summary/Deep Dive should
   use the chat approach; then the guard — and the settings read — can go away entirely.

**Intended outcome:** remove Thinking Level from provider config; add an
`Off / Low / Medium` control (default **Off**) to the Summary tab and the Deep Dive tab;
route reasoning through request options instead of an implicit settings read.

### Goal & scope decision (confirmed with user)

- **Choice set is `Off / Low / Medium`** for both Summary and Deep Dive. No "Auto" —
  the override is always sent, so behaviour is predictable. Summarization does not need
  reasoning, so **`Off` is the default**.
- **Models that cannot disable reasoning** (Gemini 3 Pro, o-series, DeepSeek R1…) get
  **best-effort down-mapping** to the lowest level the model allows. Do **not** hide or
  disable the `Off` button per model.
- **Scope is the Summary tab and the Deep Dive tab only.** Chat is out of scope — its
  control already exists and must not regress.
- **No new dependencies.** No changes to prompt content, DB schema, or routing.
- `Off` as the default matches today's effective behaviour (`geminiThinkingLevel`
  defaults to `'minimal'` → Gemini 2.5 `thinkingBudget: 0`), so existing users see no
  change in speed or cost after migration.

### Findings that constrain the design (verified against `node_modules`, do not re-litigate)

**1. AI SDK 7 exposes a portable `reasoning` option that already accepts `'none'`.**
`@ai-sdk/provider/dist/index.d.ts:2166`:

```ts
reasoning?: 'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
```

This is the default path for every provider **except Gemini**.

**2. But `@ai-sdk/google`'s automatic mapping is wrong for exactly the two families the
repo already hand-codes.** `resolveThinkingConfig` (`@ai-sdk/google/dist/index.js:2345`)
only branches Gemini 3 vs 2.5:

- **Gemini 3 Pro** — `isGemini3Model` is `/gemini-3[\.\-]/i`, so `gemini-3-pro-*` matches
  → `resolveGemini3ThinkingConfig` → `'none'` returns `thinkingLevel: 'minimal'`. But
  3 Pro does **not** support `minimal`; the repo's
  [`geminiThinkingConfig.js:86-96`](../src/lib/utils/geminiThinkingConfig.js) deliberately
  maps it **up** to `'medium'`. The SDK path risks an API error.
- **Gemma 4** — `gemma-4-*` does **not** match `isGemini3Model`, so it falls through to
  `resolveGemini25ThinkingConfig` → returns `thinkingBudget`. But Gemma 4 uses
  `thinkingLevel`, not a budget. This is not hypothetical: `gemma-4-26b-a4b-it` is the
  **default Deep Dive model** (`tools.deepDive.customModel`).

→ **Keep `geminiThinkingConfig.js` for the Gemini branch.** Do not replace it with portable
`reasoning`.

**3. Explicit `providerOptions.google.thinkingConfig` beats portable `reasoning`.**
`@ai-sdk/google/dist/index.js:1688`: `{ ...resolvedThinking, ...googleOptions?.thinkingConfig }`.
So sending providerOptions explicitly overrides the SDK's mapping — which is what makes
point 2 fixable.

**4. OpenRouter supports `effort: 'none'`.**
`@openrouter/ai-sdk-provider/dist/index.d.ts:394` lists
`'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'`. Keep the existing
providerOptions shape.

**5. Cerebras uses `reasoningEffort: z.ZodString`** (openai-compatible schema — a free
string, not an enum), so the schema won't catch a bad value; only the API will. **Verify
`'none'` against Cerebras before shipping it**; if unconfirmed, map `Off → 'low'`, which
still satisfies the agreed "lowest supported level" policy.

---

## Phase 1 — Extend the shared reasoning vocabulary

### 1a. Move the module to a neutral home

`reasoningConfig.js` will now serve chat *and* summary/deep-dive, so `src/lib/chat/` is the
wrong location.

- Move `src/lib/chat/reasoningConfig.js` → `src/lib/api/reasoningConfig.js`.
- Update imports in 5 files: [`chatStore.svelte.js`](../src/stores/chatStore.svelte.js),
  [`ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte),
  [`chatService.js`](../src/services/chat/chatService.js),
  [`tests/chat/reasoningConfig.test.js`](../tests/chat/reasoningConfig.test.js),
  [`tests/chat/chatStoreTabs.test.js`](../tests/chat/chatStoreTabs.test.js).
- Move the test to `tests/api/reasoningConfig.test.js` to match.

### 1b. Add the `'off'` level and the task choice set

In `reasoningConfig.js`:

```js
// Choice set for one-shot tasks (summary, deep dive). No Auto.
export const TASK_REASONING_CHOICES = Object.freeze([
  { value: 'off',    label: 'Off',    description: 'Answer directly, fastest' },
  { value: 'low',    label: 'Low',    description: 'Light reasoning' },
  { value: 'medium', label: 'Medium', description: 'Balanced depth and speed' },
])
```

- Add `'off'` to `VALID_LEVELS` so `normalizeChatReasoningLevel` accepts it. This is safe
  for chat: the chat UI never offers `'off'`, and `buildReasoningRequestOptions` handles it.
- Add `export function normalizeTaskReasoningLevel(value)` falling back to `'off'`.
  A separate function is required because chat falls back to `'provider-default'` — the two
  features have genuinely different defaults.

### 1c. Teach `buildReasoningRequestOptions` about `modelId`

New signature: `buildReasoningRequestOptions(providerId, level, modelId = null)`.
`modelId` is required by the Gemini `'off'` branch for family detection.
`getChatReasoningOptions` already accepts a `modelId` it doesn't use, so this is consistent.

`Off` handling:

| Provider | `Off` → |
|---|---|
| `gemini` | `buildThinkingProviderOptions(modelId, 'minimal')` — reuses the known 3 Pro & Gemma 4 quirks |
| `openrouter` | `{ providerOptions: { openrouter: { reasoning: { effort: 'none' } } } }` |
| `cerebras` | `{ providerOptions: { cerebras: { reasoningEffort: 'none' } } }` — **verify first**; fall back to `'low'` |
| `chatgpt`, `deepseek`, `groq`, `ollama` | `{ reasoning: 'none' }` (portable) |
| `openaiCompatible`, `lmstudio`, unknown | `{}` (unchanged Auto-only behaviour) |

`low`/`medium`/`high` keep their current paths **except for Gemini**, which must also route
through `buildThinkingProviderOptions` to avoid the SDK mis-mapping Gemma 4 / 3 Pro. That
requires `geminiThinkingConfig.js` to accept `'low'` (it currently only knows
`minimal|medium|high`): add `low` to each `levelMap`, and alias `off → minimal` at the top
of the function for backward compatibility.

**Verify:** `npx vitest run tests/api/reasoningConfig.test.js` passes, including new cases
for `'off'` against each Gemini family — 2.5 → `{ thinkingBudget: 0 }`; 3 Flash →
`{ thinkingLevel: 'minimal' }`; 3 Pro → `{ thinkingLevel: 'medium' }`; Gemma 4 →
`{ thinkingLevel: 'minimal' }`.

---

## Phase 2 — Summary

**Store** — add to the `summarize` block ([`settingsStore.svelte.js:155`](../src/stores/settingsStore.svelte.js)):

```js
summarize: { provider: 'gemini', model: 'gemini-3-flash-preview', reasoningLevel: 'off' },
```

No `settingsSchema.js` change needed: `'summarize'` is already whitelisted as a whole block.
(A flat key such as `summaryReasoningLevel` **would** need a schema entry or
`sanitizeSettings()` silently strips it on load — this is why the nested key was chosen.)

**Thread it through the request** — [`api.js`](../src/lib/api/api.js). `summarizeContent`
reads settings directly (`const userSettings = settings`, line 83), so **no caller changes
are needed**. For each summarize function:

```js
const { providerId: featureProviderId, modelId } = resolveFeatureModel('summarize', userSettings)
const reasoningOptions = buildReasoningRequestOptions(
  featureProviderId,
  normalizeTaskReasoningLevel(userSettings.summarize?.reasoningLevel),
  modelId
)
// ...
await aiSdkGenerateContent(providerId, resolvedSettings, systemInstruction, userPrompt, {
  abortSignal,
  ...reasoningOptions,
})
```

> **Trap:** use the `providerId` from `resolveFeatureModel`, **not** the one
> `resolveSummarizeProvider` returns. The latter is the *adapter* id — an OpenAI-compatible
> profile id collapses to `openaiCompatible` — and would look up the wrong reasoning row.
> Consider having `resolveSummarizeProvider` ([`api.js:45`](../src/lib/api/api.js)) also
> return `featureProviderId` + `modelId` so `resolveFeatureModel` isn't called twice.

Six call sites in `api.js`: lines **149, 255, 312, 351, 394, 525**.

**UI** — [`SummarySettings.svelte`](../src/components/settings/SummarySettings.svelte), new
`Reasoning` section after Tone. Follow the data-driven `{#each}` pattern from
[`ChatSettings.svelte`](../src/components/settings/ChatSettings.svelte) (its Tone section)
rather than the hardcoded three-button pattern in `ProviderKeyConfig.svelte`:

```svelte
<div class="grid grid-cols-3 w-full gap-1">
  {#each TASK_REASONING_CHOICES as option (option.value)}
    <ButtonSet
      title={$t(`settings.summary.reasoning.${option.value}`, { default: option.label })}
      Description={option.description}
      class={settings.summarize?.reasoningLevel === option.value ? 'active' : ''}
      onclick={() => updateFeatureSettings('summarize', { reasoningLevel: option.value })}
    />
  {/each}
</div>
```

Use `updateFeatureSettings('summarize', patch)`
([`settingsStore.svelte.js:1011`](../src/stores/settingsStore.svelte.js)), not `updateSettings`.
Keep the section markup convention: `setting-block` → header → `setting-secsion`
(the misspelling `secsion` is load-bearing — it is styled).

**i18n** — add `settings.summary.reasoning.{off,low,medium}` plus a section label to
[`en.json`](../src/lib/locales/en.json) and the other locales.

**Verify:** `npm run dev`, load `.output/chrome` unpacked → Settings › Summary → change
Reasoning → summarize a page → in the Network tab, `Off` produces
`thinkingConfig: { thinkingBudget: 0 }` (Gemini 2.5) or `{ thinkingLevel: 'minimal' }`
(Gemini 3 Flash) in the request body, and `Medium` produces something different. Switch the
Summary provider to OpenRouter and confirm `reasoning.effort` appears in the body.

---

## Phase 3 — Deep Dive

**Store** — add `reasoningLevel: 'off'` to the `tools.deepDive` block
([`settingsStore.svelte.js:142`](../src/stores/settingsStore.svelte.js)).

**Replace the hardcoded logic.**
[`deepDiveService.js:553`](../src/services/tools/deepDiveService.js) defines
`buildNoThinkingProviderOptions(providerId, modelName)` — a *third* copy of the same
family-detection logic, force-disabling thinking. It is passed in at lines **100** and **129**
as `{ providerOptions: noThinkingOptions, abortSignal }`.

- Delete `buildNoThinkingProviderOptions`; replace with
  `buildReasoningRequestOptions(providerId, normalizeTaskReasoningLevel(settings.tools.deepDive.reasoningLevel), modelName)`.
- Because the default is `'off'`, **default behaviour is unchanged** — users simply gain the
  ability to override.
- ⚠️ **Check both call sites (100 and 129) before editing.** If only one is "generate
  follow-up questions" (where forcing Off is intentional) and the other is the main
  generation, apply the user setting only to the latter and leave the question-generation
  call forced to Off.
- ⚠️ **The return shape differs.** The old helper returns `{ google: {...} }` — the *inside*
  of `providerOptions`. The new one returns `{ providerOptions: { google: {...} } }` or
  `{ reasoning: 'none' }`, i.e. an object to **spread**. Change the call sites from
  `{ providerOptions: noThinkingOptions, abortSignal }` to `{ abortSignal, ...reasoningOptions }`.

**UI** — [`DeepDiveToolSettings.svelte`](../src/components/settings/tools/DeepDiveToolSettings.svelte),
new Reasoning section after the Manual/Auto buttons. Same pattern as Phase 2, but use
`updateToolSettings('deepDive', { reasoningLevel })`
([`settingsStore.svelte.js:964`](../src/stores/settingsStore.svelte.js)).

**Verify:** summarize a page → open Deep Dive → in the Network tab, the default model
`gemma-4-26b-a4b-it` with `Off` sends `thinkingLevel: 'minimal'` — **not** `thinkingBudget`.
(That is precisely the Gemma 4 quirk the SDK gets wrong; seeing `thinkingBudget` here means
the Gemini branch is not being used.) Switch to `Medium` and confirm the request changes.

---

## Phase 4 — Remove Thinking Level from provider config + migrate

1. **Delete the UI.** Remove the `{#if isExpanded && entry.id === 'gemini'}` block at
   [`ProviderKeyConfig.svelte:216-247`](../src/components/settings/ProviderKeyConfig.svelte).
   Drop the `ButtonSet` import if now unused.

2. **Delete the implicit settings read in the adapter.** Remove the two identical blocks at
   [`aiSdkAdapter.js:385-393`](../src/lib/api/aiSdkAdapter.js) and `:660-668`
   (`hasExplicitReasoning` / `thinkingLevel` / `mergedProviderOptions`). After Phases 2–3
   reasoning always arrives from the caller, so the adapter must not read settings.
   Leave the `...generationOptions` and `providerOptions` passthrough intact.
   - This also removes a latent **default mismatch**: the store defaults to `'minimal'` but
     the adapter fell back to `'high'`.
   - [`tests/chat/aiSdkAdapter.test.js`](../tests/chat/aiSdkAdapter.test.js) asserts this
     behaviour — update it.

3. **Migrate, then delete the key.** In `migrateLegacyGeminiAdvanced()` (or a new migration)
   in [`settingsSchema.js:193`](../src/lib/config/settingsSchema.js), map
   `geminiThinkingLevel` → `summarize.reasoningLevel`: `minimal → off`, `medium → medium`,
   `high → medium` (the new choice set has no High; clamp to the highest available). Then
   `delete s.geminiThinkingLevel` and remove `'geminiThinkingLevel'` from
   `VALID_SETTING_KEYS` (line 19).

4. **Clean up i18n.** Remove `settings.gemini_basic_config.thinking_level*` and the already-dead
   `settings.gemini_advanced_config.thinking_level*` block (`en.json:233` and every locale).

5. **Clean up dead code.** `getEffectiveThinkingDescription`
   ([`geminiThinkingConfig.js:140`](../src/lib/utils/geminiThinkingConfig.js)) is exported but
   never imported. Either delete it, **or** wire it up as a tooltip showing the effective
   level — that directly addresses the weak spot of the agreed down-mapping policy
   (Gemini 3 Pro + `Off` would read "Medium (min for Pro)" instead of silently lying).

**Verify:** set `geminiThinkingLevel: 'high'` in extension storage → reload the extension →
confirm `summarize.reasoningLevel === 'medium'` and `geminiThinkingLevel` is gone. Then
`npx vitest run tests/`.

---

## Out of scope (V1)

- **Chat.** `chat-reasoning-control-v1` shipped its own per-session control; this plan must
  not change chat behaviour, only re-point its imports (Phase 1a).
- **A `High` option for Summary/Deep Dive.** Explicitly rejected — see the scope decision.
- **Per-model capability tables** (hiding `Off` when a model can't disable reasoning). The
  agreed policy is best-effort down-mapping instead.
- **A settings UI for `chat.defaultReasoningLevel`.** The key exists in the store with no UI;
  leave it.
- **The `api.js` bugs listed below** — real, but separate work.

## Pre-existing bugs found nearby (not part of this plan)

- **`selectedProviderId is not defined`** in every catch block of `api.js` (lines 157, 270,
  319, 359, 410, 537). The local is `providerId`; `selectedProviderId` is only a *parameter*
  of `providerSupportsStreaming` (line 27). Each `console.error` therefore throws a
  `ReferenceError` that **replaces the real error**, so users see
  "selectedProviderId is not defined" instead of e.g. a rate-limit message. Phase 2 touches
  these exact lines, so fixing them in passing is reasonable — but call it out in the commit.
- **`summarizeContentStreamEnhanced` shadows its own output.** The
  `const { systemInstruction, userPrompt }` at [`api.js:516`](../src/lib/api/api.js) shadows
  the outer `let` at line 448, so the non-custom-action path sends an empty prompt.

## Final verification checklist

- [ ] `npx vitest run tests/` — full suite green.
- [ ] `npm run dev`; load `.output/chrome` as an unpacked extension.
- [ ] Settings › AI Provider › Gemini — Thinking Level is **gone**.
- [ ] Settings › Summary — Reasoning shows `Off / Low / Medium`, defaults to `Off`, persists across reload.
- [ ] Settings › Deep Dive — same.
- [ ] Network tab confirms the request body matches the Phase 1 table for at least Gemini 2.5,
      Gemini 3 Flash, and Gemma 4 (via Deep Dive).
- [ ] Legacy `geminiThinkingLevel: 'high'` migrates to `summarize.reasoningLevel: 'medium'` and the old key is removed.
- [ ] Chat: send a message; the reasoning dropdown next to Send still works after the module move.

## Notable files

| File | Change |
|---|---|
| `src/lib/chat/reasoningConfig.js` → `src/lib/api/reasoningConfig.js` | Moved; add `TASK_REASONING_CHOICES`, `normalizeTaskReasoningLevel`, `'off'` level, `modelId` param |
| [`src/lib/utils/geminiThinkingConfig.js`](../src/lib/utils/geminiThinkingConfig.js) | Accept `'low'`; alias `off → minimal`; possibly reuse `getEffectiveThinkingDescription` as a tooltip |
| [`src/lib/api/api.js`](../src/lib/api/api.js) | Thread reasoning into 6 call sites (149, 255, 312, 351, 394, 525) |
| [`src/lib/api/aiSdkAdapter.js`](../src/lib/api/aiSdkAdapter.js) | Delete the two implicit `geminiThinkingLevel` blocks (~385, ~660) |
| [`src/services/tools/deepDiveService.js`](../src/services/tools/deepDiveService.js) | Replace `buildNoThinkingProviderOptions`; fix call-site shape at lines 100/129 |
| [`src/stores/settingsStore.svelte.js`](../src/stores/settingsStore.svelte.js) | `summarize.reasoningLevel`, `tools.deepDive.reasoningLevel`; remove `geminiThinkingLevel` |
| [`src/lib/config/settingsSchema.js`](../src/lib/config/settingsSchema.js) | Migration + drop key from `VALID_SETTING_KEYS` |
| `src/components/settings/{SummarySettings,tools/DeepDiveToolSettings}.svelte` | Add the Reasoning section (same `{#each}` pattern in both) |
| [`src/components/settings/ProviderKeyConfig.svelte`](../src/components/settings/ProviderKeyConfig.svelte) | Delete the Thinking Level block (216–247) |
| `src/lib/locales/*.json` | Add `settings.summary.reasoning.*`; remove `gemini_{basic,advanced}_config.thinking_level*` |
| Imports in `chatStore.svelte.js`, `ChatComposer.svelte`, `chatService.js`, 2 test files | Re-point to the new `reasoningConfig.js` path |
