---
type: plan
status: ready
---

# Chat Context Budget & Warning Quality — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in a
> fresh session. Start at Phase 1 and go in order. Each phase ends with a verify
> step — don't move on until it passes.
>
> **Phase order is a safety constraint, not a preference.** Phase 1 makes the token
> estimate trustworthy; Phase 2 spends the headroom that estimate reveals. Doing
> Phase 2 first raises context utilisation above the estimator's error bar and turns
> a silent over-estimate into provider 400s. Do not reorder.

## Context

The chat harness assembles model context through a Context Pipeline:
`resolveSources → budgetContext → assembleContext` (`src/lib/chat/contextPipeline/`).
`budgetContext` decides how much of the model's input window each grounding source
may occupy. Reading the code against its actual call sites turned up four defects.

**Defect 1 — the token estimate is wrong in the unsafe direction, and today's 60% cap is accidentally hiding it.**
`estimateTokens()` (`contextBudgeter.js:14`) is `chars / 4`, a ratio calibrated for
English. There is no tokenizer dependency in `package.json`; this heuristic is all
the budgeter has. It under-estimates badly for the content this app actually
targets:

- **CJK** runs roughly 1 token per character in mainstream tokenizers, so `chars/4`
  under-estimates by **~4x**. The app ships `zh-CN`, `ja`, `ko` locales.
- **Vietnamese** runs ~26% accented characters, each costing far more than a quarter
  token → **~1.4x** under, measured on a realistic sample. The same applies in smaller
  measure to `de`/`es`/`fr`.
- **Code** runs ~3 chars/token → mild, and is *not* addressed by Phase 1's estimator.
  It is left to the safety reserve as a known residual.

On top of that, the budgeter measures only `selectedContent`, while the assembler
renders more:

- `formatSource()` (`sourceFormatter.js:55`) wraps every source in
  `[[UNTRUSTED_SOURCE …]]` + `title:` + `normalizedUrl:` + closing tag — measured at
  **259 chars ≈ 65 tokens per source**, counted nowhere. Five `@tab` sources ≈ 340
  tokens of pure blind spot.
- `[[CURRENT_USER_REQUEST]]` wrapping adds ~13 tokens (`contextAssembler.js:55`).
- `escapeSourceValue()` (`sourceFormatter.js:38`) can **expand** content: `^---` →
  `— — —` measured at **1.5x**, and markdown pages are full of `---`. `[[`/`]]` →
  fullwidth `［［`/`］］` (U+FF3B/FF3D), which tokenises worse than the ASCII it
  replaces.

This means **a Chinese page can already blow the context window today** — the
budgeter believes it filled 60%, the provider sees ~240%. The 60% cap is not a
safety design, it is 40% of accidental headroom masking an estimator bug. Any plan
that spends that headroom must fix the estimator first. Hence the phase order.

**Defect 2 — the source allowance is a cap, not a floor.**
`contextBudgeter.js:11` sets `SOURCE_BUDGET_FRACTION = 0.6`, and line 114 derives the
allowance as `inputBudget * 0.6 - systemTokens`. The rigidity is correct and
deliberate: the allowance depends only on the input budget and the (per-conversation
stable) system prompt, never on history length or the current question, so the
rendered source block is byte-identical across turns and provider prompt caching hits
the shared prefix. **Do not make the allowance adapt to history — that breaks the
cache on every turn.**

The defect is narrower: 60% is a *ceiling on sources*, so a source can never grow
into free window space **even when history is empty**. Turn 1 — nothing else in the
window — a long article is still capped at 60% and (see Defect 3) then dropped
whole. Turn 1 with one long page is this product's core use case.

Unused allowance is *not* wasted: line 145 computes `sourcesUsedTokens` from actual
consumption and line 150 hands the remainder to history. History is already the
flexible party; sources are the rigid one. The fix is to invert which side is a
constant.

**Defect 3 — both graceful-degradation paths are dead code.**
`selectedSourceContent()` (`contextBudgeter.js:18`) is designed to fall back
`raw → condensed → truncate (active only) → drop`. In production it only ever does
`raw → drop`:

- `condensedContent` is always `null` — `chatSourceService.js:137` hardcodes
  `condensedContent: null, condensationVersion: 0`. Condensation was never built.
- `isActive` is never `true` — `normalizeRef()` (`sourceResolver.js:5`) only sets it
  for object refs, but both call sites pass plain string IDs: `sourceIdsFrom()`
  (`chatService.js:88`) returns `message.attachmentRefs` (strings), and
  `prepareGroundedAttachments()` pushes `captured.source.id` (`chatService.js:142`,
  `:158`). So line 35's `if (!source.isActive || ...) return null` always fires.

Net production behaviour: **a source fits whole, or vanishes whole.** The dead code
survived because the unit tests feed synthetic objects
(`{ sourceId: 'src-active', isActive: true }`, `condensedContent: 't'.repeat(100)` at
`contextPipeline.test.js:254`, `:260`) that `chatService` never produces.
`normalizeRef` accepts both strings and objects, so the caller violates the contract
without a type error. The tests are green and correctly prove the budgeter works in
isolation.

**Defect 4 — the budgeter never refuses, and drop warnings are unusable.**
When system + skill + current message exceed the budget, `contextBudgeter.js:150–155`
clamps `remainingTokens` to 0, pushes a warning, and **the request is still sent** —
so the provider returns a 400 instead of the app explaining the problem.
`ChatComposer.svelte` enforces no input length limit, so this is reachable by paste.

Warnings do reach the UI (`ChatShell.svelte:45` renders `<ChatContextWarning>`, fed
before streaming at `chatService.js:256`), but read
`Dropped source 7f3a9c2e-… because it did not fit the context budget.` — a raw UUID
instead of the page title, hardcoded English against 8 shipped locales, no guidance.
The model then answers ungrounded from general knowledge, so the user sees a
plausible answer beside a cryptic warning. The data to do better is already in hand:
`budgetContext` holds the full source object, `title` included, at the moment it
decides to drop.

### Goal & scope decision (confirmed with user)

- **In scope:** make the token estimate script-aware and wrapper-inclusive; invert the
  budget so sources grow into free space; separate render order from priority order;
  reject genuinely impossible requests instead of letting the provider 400; make
  warnings name the source and go through i18n.
- **Cache-prefix stability is a hard invariant.** The source allowance may depend only
  on `contextWindowTokens`, `requestedOutputTokens`, and `systemTokens`. It may
  **never** depend on history length or on the current message/skill text. The test
  `renders an identical source block regardless of the current question length
  (cache-stable prefix)` (`contextPipeline.test.js:151`) guards this — it must stay
  green through every phase.
- **Terminology, corrected:** these reserves are **source-side reserves**, not
  "guaranteed floors". A reserve stops *sources* from consuming that slice. It cannot
  stop an oversized current message from doing so — that is what Phase 4's pre-flight
  check is for. Do not describe them as guarantees anywhere in code comments or UI.
- **Estimator bias direction: over-estimate is safe, under-estimate is not.** Over-
  estimating drops a source that would have fit (degraded, recoverable). Under-
  estimating produces a provider 400 (broken). When tuning constants, round toward
  over-estimation.
- **Out of scope (deliberately):** wiring `isActive`, source chunking, tool loop,
  long-term memory. See "Out of scope" below.
- **No new dependencies** (specifically: no tokenizer package — see Phase 1 rationale).
  No DB schema change, no migration. Nothing touched here is persisted.
- Product call when the window is tight: **grounding beats old turns.** Sources may
  use everything outside the reserves; history takes what is left.

## Phase 1 — Make the estimate trustworthy

Nothing else in this plan is safe until this lands. Edit
`src/lib/chat/contextPipeline/contextBudgeter.js`.

**1a. Script-aware estimator.** Replace `estimateTokens` (line 14):

```js
/**
 * Characters per token, by script. `chars / 4` is calibrated for English and
 * under-estimates CJK by ~4x — the unsafe direction, since an under-estimate
 * becomes a provider 400 while an over-estimate merely drops a source that would
 * have fitted. Bias these constants toward over-estimation.
 *
 * No tokenizer dependency on purpose: the real tokenizer differs per provider
 * (Gemini/Claude/OpenAI all disagree), so a bundled one would be authoritative for
 * at most one of them while costing every user the WASM payload.
 */
const CJK_CHARS_PER_TOKEN = 1
const ACCENTED_LATIN_CHARS_PER_TOKEN = 1.5
const DEFAULT_CHARS_PER_TOKEN = 4

// CJK punctuation, kana, CJK ext-A, unified ideographs, compat ideographs,
// fullwidth forms (escapeSourceValue emits ［［ = U+FF3B here), Hangul.
const CJK_PATTERN =
  /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/g

// Latin-1 Supplement + Latin Extended-A/B (U+00C0–U+024F) and Latin Extended
// Additional (U+1E00–U+1EFF, where Vietnamese lives). Accented Latin costs far more
// than its character count suggests: Vietnamese runs ~26% accented characters, which
// is enough to under-estimate a page by ~1.4x. Also covers de/es/fr (é, ü, ñ).
const ACCENTED_LATIN_PATTERN = /[À-ɏḀ-ỿ]/g

export function estimateTokens(value) {
  const text = String(value || '')
  const cjkCount = (text.match(CJK_PATTERN) || []).length
  const accentedCount = (text.match(ACCENTED_LATIN_PATTERN) || []).length
  const restCount = text.length - cjkCount - accentedCount
  return Math.ceil(
    cjkCount / CJK_CHARS_PER_TOKEN +
      accentedCount / ACCENTED_LATIN_CHARS_PER_TOKEN +
      restCount / DEFAULT_CHARS_PER_TOKEN
  )
}
```

Measured against this heuristic (1000-char samples): Chinese, Japanese, Korean and
fullwidth forms all rise 4x (250 → 1000); Vietnamese rises 1.44x (266 → 383); plain
English is unchanged (264 → 264). English is exactly the ratio `chars/4` was already
calibrated for, so leaving it untouched is the point — this only corrects the scripts
the old estimator was wrong about.

**1b. Budget the rendered string, not the raw content.** The budgeter currently
measures `selection.content` while the assembler renders `formatSource(source, content)`.
Do not add a fudge factor — measure the real thing. `contextBudgeter.js` currently
imports nothing and `sourceFormatter.js` only imports `CHAT_TONE_ROLES`, so this is a
clean new edge with no cycle:

```js
import { formatSource, formatSkillInvocation } from './sourceFormatter.js'
```

In the per-source selection, compute the wrapper cost exactly once per source and
charge the content against what remains:

```js
// Exact wrapper cost for this source: render it with empty content.
const wrapperTokens = estimateTokens(formatSource(source, ''))
const contentAllowance = remainingTokens - wrapperTokens
if (contentAllowance <= 0) return null   // wrapper alone does not fit → drop
```

then run the existing `raw → condensed → truncate → drop` ladder against
`contentAllowance`, and charge `wrapperTokens + estimateTokens(selection.content)` to
`sourceRemaining`. Apply the same treatment to the skill (`formatSkillInvocation`) and
to the `[[CURRENT_USER_REQUEST]]` wrapper in the line-150 arithmetic.

Note the truncation branch computes `characterBudget = remainingTokens * 4`
(line 39) — that hardcodes the English ratio and will under-cut with the new
estimator. Truncate, then re-measure and shrink while over budget, rather than
trusting one multiplication. (This path is dead in production today — `isActive` is
never true — but fix it anyway so it is not a trap for whoever wires `isActive`
later.)

**1c. Residual safety reserve.** Even script-aware, this is a heuristic. Add a
cache-stable reserve — a constant, so the invariant holds:

```js
const ESTIMATOR_SAFETY_FRACTION = 0.05
```

subtracted from the input budget alongside the Phase 2 reserves.

**Verify:**

1. `npx vitest run tests/chat/contextPipeline/` — 37 baseline tests still green.
2. New unit tests in `contextPipeline.test.js`:
   - `it('does not under-estimate CJK content')` — assert
     `estimateTokens('汉'.repeat(1000)) >= 900` (old code returns 250).
   - `it('does not under-estimate accented Vietnamese')` — assert
     `estimateTokens('Tiếng Việt có dấu '.repeat(50))` exceeds the old `chars/4` value
     for the same string by ~1.4x.
   - `it('leaves plain English estimates unchanged')` — a pure-ASCII string must return
     exactly `Math.ceil(length / 4)`. This is the regression guard: the whole change is
     meant to be a no-op for the script the old ratio was calibrated for.
   - `it('charges the source wrapper to the budget')` — a source whose content fits a
     given allowance exactly but whose rendered form does not; assert it is dropped or
     truncated, not silently included.
3. **Calibration against a real provider — this is the point of the phase.** Run
   `npm run dev`, open a Chinese-language Wikipedia article, send one turn on any
   cloud model, and compare in the context donut: `estimatedInputTokens` from the
   pipeline vs the provider's real `promptTokens` (already plumbed through
   `onDiagnostics` at `chatService.js:282` as `input`). The estimate must now be
   **≥ real**, and within ~30%. If it under-estimates, lower the relevant
   `*_CHARS_PER_TOKEN` divisor (toward over-estimation) and repeat. Do the same pass on
   a Vietnamese page, since `ACCENTED_LATIN_CHARS_PER_TOKEN` is the shakiest of the
   three constants. **Do not start Phase 2 until both hold** — Phase 2 is what spends
   this margin.

## Phase 2 — Invert the budget: source-side reserves

Only start once Phase 1's calibration check passes.

Replace `SOURCE_BUDGET_FRACTION` (line 11) with reserves expressed as an absolute
token floor capped by a fraction, so they behave on both a 4K local model and a 1M
Gemini window:

```js
/**
 * Slices withheld from the source allowance. Sources may use everything else.
 *
 * These are source-side reserves, NOT guaranteed floors: they stop sources from
 * eating the slice, but cannot stop an oversized current message from doing so.
 * Phase 4's pre-flight check handles that case.
 *
 * They are constants, and that is load-bearing: the source allowance must depend
 * only on the model's input budget and the (per-conversation stable) system prompt,
 * never on history length or the current question. That keeps the rendered source
 * block byte-identical across turns so provider prompt caching hits the shared
 * prefix. Deriving a reserve from *actual* history or current text breaks the cache
 * every turn.
 *
 * Absolute floor + fraction cap: on a large window the reserve stays a thin slice;
 * on a small window it degrades to a proportion instead of eating the whole budget.
 */
const HISTORY_RESERVE_TOKENS = 8_000
const HISTORY_RESERVE_MAX_FRACTION = 0.25
const CURRENT_TURN_RESERVE_TOKENS = 2_000
const CURRENT_TURN_RESERVE_MAX_FRACTION = 0.1
```

```js
const historyReserve = Math.min(
  HISTORY_RESERVE_TOKENS,
  Math.floor(inputBudgetTokens * HISTORY_RESERVE_MAX_FRACTION)
)
const currentTurnReserve = Math.min(
  CURRENT_TURN_RESERVE_TOKENS,
  Math.floor(inputBudgetTokens * CURRENT_TURN_RESERVE_MAX_FRACTION)
)
const safetyReserve = Math.floor(inputBudgetTokens * ESTIMATOR_SAFETY_FRACTION)
const sourceBudgetTokens = Math.max(
  0,
  inputBudgetTokens - systemTokens - historyReserve - currentTurnReserve - safetyReserve
)
```

Leave lines 145–155 otherwise alone — `sourcesUsedTokens` (actual, not allowance) and
the history remainder already behave correctly.

Expected effect: on a 200K window sources go from ~60% to ~89% of the input budget
(94% minus the safety reserve); on a ~3K input budget (4K local model) the allowance
is roughly unchanged. That asymmetry is intended — budget math cannot rescue a 4K
model, only chunking can, and chunking is out of scope.

**Tests — each must fail on the pre-Phase-2 code.** A test that passes both before and
after proves nothing; check this explicitly by stashing the change.

- `it('lets a source use the window that history is not using on turn 1')` —
  `contextWindowTokens: 128_000`, `requestedOutputTokens: 4_000`, `history: []`, one
  source with ~90K tokens of ASCII `rawContent`. Assert it is in `includedSourceIds`
  and `truncated === false`. Fails on the old 0.6 math (allowance 74.4K < 90K → dropped).
- `it('reserves budget for history while letting sources exceed the old 60% cap')` —
  this replaces the earlier draft's "keeps a history floor" test, **which was broken**:
  a source larger than the window would be dropped whole on the old code (inactive) or
  truncated at 60% (active), leaving history intact either way, so it passed without
  proving anything. Assert **both** halves:
  1. `sourceTokens['big-source'] > inputBudgetTokens * 0.6` — the new allowance is
     genuinely being used past the old ceiling; **and**
  2. the two short history turns are still present in `budget.history` — the reserve
     held.

  Size the source so it lands between the old cap and the new one (e.g. ~75% of input
  budget) — that band is the only place the two behaviours differ.

**Verify:** `npx vitest run tests/chat/contextPipeline/` — all green, including
`cache-stable prefix` (line 151). Then confirm the two new tests fail on the old code:
`git stash && npx vitest run tests/chat/contextPipeline/` should show them **red**;
`git stash pop` to restore. If `drops @tab sources before an active source under
context pressure` (line 122, `contextWindowTokens: 500`) needs retuning, adjust
fixture sizes — never relax the cache-stability assertions.

## Phase 3 — Separate render order from priority order

The selection loop (lines 117–143) sorts by `isActive` and then `destination.push()`es
**in that sorted order**, so priority order and render order are the same array. The
sort is currently a no-op (Defect 3: `isActive` is never true), so this is latent — but
it is a live cache hazard the moment `isActive` is ever wired, because in a browser
extension the active tab changes constantly, and a source changing position rewrites
the block and breaks the prefix. Fix it now while it is cheap.

Keep each group's original index, iterate a priority-sorted copy to *decide*, then emit
in original order:

```js
const sourceGroups = [
  ...conversationSources.map((source) => ({ source, destination: budgetedConversationSources })),
  ...attachmentSources.map((source) => ({ source, destination: budgetedAttachmentSources })),
].map((group, index) => ({ ...group, index }))

// Priority decides *what fits*; it must never decide *where a source is rendered*.
// Render position stays the caller's order so the cached prefix survives the active
// tab changing between turns.
const byPriority = [...sourceGroups].sort(
  (left, right) => Number(right.source.isActive) - Number(left.source.isActive)
)

const selectedByIndex = new Map()
for (const group of byPriority) {
  // ...existing selectedSourceContent / warnings / sourceTokens logic, keyed by group.index
}
for (const group of sourceGroups) {
  const selected = selectedByIndex.get(group.index)
  if (selected) group.destination.push(selected)
}
```

Build `includedSourceIds` / `droppedSourceIds` from the original-order pass too, so
diagnostics are deterministic regardless of priority.

- `it('renders sources in caller order regardless of which one is active')` — two
  sources that both fit comfortably; run `budgetContext` twice, flipping which has
  `isActive: true`; assert `conversationSources.map((s) => s.id)` is identical across
  runs. (This is the one legitimate use of a synthetic `isActive: true` input: it
  asserts the invariant, it does not simulate production.)

**Verify:** `npx vitest run tests/chat/contextPipeline/` all green, new test included.
`git diff --stat` shows only `contextBudgeter.js` and the test file.

## Phase 4 — Refuse impossible requests instead of 400-ing

Today an oversized current message is clamped and sent anyway
(`contextBudgeter.js:150–155`), so the provider rejects it and the user sees a raw API
error. Reserves cannot prevent this — the current message is not something the budgeter
gets to shrink. Refuse instead, with a message naming the actual cause.

**Policy (chosen; do not re-litigate):** reject **only** the genuinely impossible case
— when system + skill + current message exceed the input budget *with every source
already dropped*. Anything that fits after dropping sources proceeds with a warning, as
today. Rationale: dropping a source is degradation the user can act on (remove
attachments, switch model); an over-long question with nothing left to drop is not
recoverable inside the pipeline, and a clear pre-flight message beats a provider 400.
Rejected alternatives: a composer character cap (guesses at tokens, punishes CJK users
twice), and silent truncation of the user's own question (destroys intent).

In `budgetContext`, replace the clamp at line 152 with a structured, terminal outcome —
e.g. return `{ ...budget, rejected: { code: 'input_too_large', params: { … } } }`. Have
`buildContextPipeline` propagate it and `chatService.runGeneration` surface it as a
normal chat error **before** calling `streamRequest`, so no provider call is made. Wire
it to the same `onWarnings`/error surface the UI already renders; do not invent a new
UI component.

**Verify:** `npx vitest run tests/chat/` green, plus
`it('rejects a request that cannot fit even with every source dropped')` asserting
`rejected.code === 'input_too_large'`. Manually: paste ~500K characters into the
composer on a small-context model and send. Expect a clear in-app message naming the
cause, **and zero network requests to the provider** (check the Network tab).

## Phase 5 — Warnings that name the source, in the user's language

Warnings originate as hardcoded English strings in `contextBudgeter.js` (lines 131,
140, 153, 176) and `sourceResolver.js` (line 54). Both are pure, Node-testable modules
with no Svelte or i18n imports — keep it that way. Emit **structured warnings** and
translate at the render edge.

**5a. Emit `{ code, params }` from the pure modules.** `budgetContext` already holds
the source object when it decides, so pass the title straight through — no store lookup:

| Current string | New shape |
|---|---|
| `Dropped source ${sourceId} because…` (line 131) | `{ code: 'source_dropped', params: { title: source.title \|\| null, sourceId } }` |
| `Truncated active source ${sourceId}…` (line 140) | `{ code: 'source_truncated', params: { title: source.title \|\| null, sourceId } }` |
| `System persona, skill, and current…` (line 153) | superseded by Phase 4's `rejected` outcome |
| `Trimmed ${n} oldest complete…` (line 176) | `{ code: 'history_trimmed', params: { count: trimmedTurnCount } }` |
| `Could not resolve … source …` (`sourceResolver.js:54`) | `{ code: 'source_unresolved', params: { sourceId, isActive } }` |

**5b. Update the contract.** `contracts.js:95` declares
`@property {string[]} warnings` on `ContextAssemblyDiagnostics`, which this change
falsifies. Add a typedef and reference it:

```js
/**
 * @typedef {object} ChatContextWarning
 * @property {'source_dropped' | 'source_truncated' | 'history_trimmed' | 'source_unresolved'} code
 * @property {Record<string, unknown>} params
 */
```

and change the property to `{Array<ChatContextWarning | string>} warnings` — the union
is deliberate and permanent, see 5c. Also add a `ContextPipelineRejection` typedef for
Phase 4's `rejected` outcome. `contracts.js` is a modified file for this plan.

**5c. Render both shapes.** Not every warning can become a code: the AI SDK's
`reasoningWarnings` (`chatService.js:298`, `:627`) and capture failures in
`prepareGroundedAttachments` (`chatService.js:144`, from `error.message`) are
inherently free-form strings. So `ChatContextWarning.svelte` must accept a mixed array:

```svelte
{#each warnings as warning}
  {@const text =
    typeof warning === 'string'
      ? warning
      : $_(`chat.context_warning.${warning.code}`, { values: warning.params })}
```

Import `{ _ } from 'svelte-i18n'`, mirroring `ChatContextDonut.svelte:8`. Keep the
current markup, `role="status"` and `aria-live="polite"`.

When `title` is absent, pick a separate key (`source_dropped_untitled`) in the
component — never interpolate a UUID into a "title" slot.

**5d. Add locale keys** to all 8 files in `src/lib/locales/` (`en, vi, de, es, fr, ja,
ko, zh-CN`), under the existing `chat.*` namespace beside `chat.context_donut.*`:

```json
"chat": {
  "context_warning": {
    "source_dropped": "\"{title}\" was too long for this model's context and was left out. The answer below is not grounded in it — try a model with a larger context window.",
    "source_dropped_untitled": "A source was too long for this model's context and was left out. The answer below is not grounded in it.",
    "source_truncated": "Only part of \"{title}\" fitted in this model's context.",
    "history_trimmed": "{count} older turn(s) were dropped to fit this model's context.",
    "source_unresolved": "A source attached earlier could not be loaded.",
    "input_too_large": "Your message is too long for this model's context window, even with every source removed. Shorten it or switch to a model with a larger context."
  }
}
```

Write real translations for the other 7, matching each file's existing tone. Source
titles are page-controlled text — Svelte escapes interpolations by default so there is
no injection risk, but clamp long titles in CSS (`line-clamp`/`truncate`) so a hostile
title cannot wreck the layout.

**5e. Update the one test asserting warning text** — `contextPipeline.test.js:269` does
`expect(budget.warnings.join('\n')).toContain('Truncated active source large-active-source')`.
Rewrite against the structured shape:
`expect(budget.warnings).toContainEqual(expect.objectContaining({ code: 'source_truncated' }))`.

**Verify:** `npx vitest run tests/chat/` green. Then:
`node -e "['en','vi','de','es','fr','ja','ko','zh-CN'].forEach(l=>{const w=require('./src/lib/locales/'+l+'.json').chat.context_warning; ['source_dropped','source_dropped_untitled','source_truncated','history_trimmed','source_unresolved','input_too_large'].forEach(k=>{if(!w[k]) throw new Error(l+' missing '+k)})}); console.log('all locales ok')"`

## Phase 6 — Manual pass in the extension

`npm run dev`, load `.output/chrome` unpacked.

1. Long English article (big Wikipedia page), side panel, `/summarize` on a
   large-context model (Gemini/Claude). Expect: no drop warning, and the context donut
   shows the source past 60% of the budget if the page is large enough. Before this
   change the same page reported a drop.
2. **Chinese article, same model.** Expect: no provider error, and
   `estimatedInputTokens` ≥ the provider's real `input` in the donut. This is the
   regression that Defect 1 predicts and Phase 1 fixes.
3. Small-context provider (Ollama/LM Studio, ~4K model), repeat step 1. Expect a drop
   warning **naming the page title**, in the UI language, not a UUID.
4. Switch UI language to Vietnamese, repeat step 3. Expect the warning in Vietnamese.
5. Send 3–4 more turns on the large-context model. Expect the source to stay included.

**Verify:** all five hold. Step 3 still dropping is **expected and in scope only as a
message** — the cliff itself is chunking's job, deliberately deferred.

## Out of scope (V1)

- **Wiring `isActive`** (object refs instead of string IDs from `chatService`). It
  would revive the truncation fallback, but Phase 2 makes drops rare on mainstream
  models and Phase 3 removes the cache hazard it would introduce. Deferred.
- **Source chunking** — structure-aware splitting by heading/timestamp, map-reduce
  condensation to finally populate `condensedContent`, BM25/top-k retrieval. This is
  the real fix for small-context models and is a much larger investment. Separate plan.
- **A real tokenizer.** Rejected in Phase 1: per-provider tokenizers disagree, so a
  bundled one is authoritative for at most one provider while costing every user the
  payload. The Phase 1 calibration check is the pragmatic substitute.
- **Tool loop** (`stopWhen`/`stepCountIs`), **long-term memory**, **skill progressive
  disclosure.** The app is a plain chat client today; these are scope, not gaps. The
  persisted surface is thin and versioned, so adding them later costs the same as now.

## Final verification checklist

- [ ] `npx vitest run` — full suite green (`tests/chat/contextPipeline/` baseline: 37 passing)
- [ ] `npm run check` — svelte-check reports no new errors
- [ ] `contextPipeline.test.js:151` `cache-stable prefix` green — the hard invariant
- [ ] Phase 2's two new tests verified **red** on stashed code, green after
- [ ] Phase 1 calibration: estimate ≥ real `promptTokens` on a CJK page, within ~30%
- [ ] `grep -n "SOURCE_BUDGET_FRACTION" src/` returns nothing
- [ ] All 8 locales carry every `chat.context_warning.*` key
- [ ] Oversized input produces an in-app message and **zero** provider network calls
- [ ] Phase 6 manual pass, all five observations
- [ ] `git diff --stat` touches only: `contextBudgeter.js`, `sourceResolver.js`,
      `contracts.js`, `chatService.js`, `ChatContextWarning.svelte`, 8 locale files,
      pipeline tests

## Notable files

| File | Change |
|---|---|
| `src/lib/chat/contextPipeline/contextBudgeter.js` | Phases 1–4: script-aware `estimateTokens`; wrapper-inclusive budgeting; reserves replace `SOURCE_BUDGET_FRACTION`; render order split from priority; `rejected` outcome; structured warnings |
| `src/lib/chat/contextPipeline/sourceFormatter.js` | Phase 1b: no change expected — imported by the budgeter to measure real rendered size |
| `src/lib/chat/contextPipeline/sourceResolver.js` | Phase 5a: `source_unresolved` becomes structured |
| `src/lib/chat/contracts.js` | Phase 5b: `ChatContextWarning` + `ContextPipelineRejection` typedefs; `warnings` becomes a union array |
| `src/services/chat/chatService.js` | Phase 4: surface `rejected` before `streamRequest`, no provider call |
| `src/components/chat/ChatContextWarning.svelte` | Phase 5c: translate `{code, params}`, pass strings through, clamp long titles |
| `src/lib/locales/{en,vi,de,es,fr,ja,ko,zh-CN}.json` | Phase 5d: `chat.context_warning.*` keys |
| `tests/chat/contextPipeline/contextPipeline.test.js` | New estimator/budget/order/rejection tests; line 269 rewritten for structured warnings |

### Read-only context the executor will want

- `src/services/chat/chatService.js:88`, `:142`, `:158` — why `isActive` is never true
- `src/services/chat/chatSourceService.js:137` — why `condensedContent` is always null
- `src/services/chat/chatService.js:282` — `onDiagnostics` already carries the
  provider's real `promptTokens`; this is what Phase 1's calibration reads
- `src/components/chat/ChatContextDonut.svelte:8` — the `svelte-i18n` usage to mirror
- `src/components/chat/ChatShell.svelte:45` — where `ChatContextWarning` is mounted
