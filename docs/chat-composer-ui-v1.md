---
type: plan
status: planned
---

# Chat Composer UI — Context Bar, Token Donut, Model Switcher — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> **Verify** step — do not move on until it passes.
>
> **Reference mockups:** [`docs/img/UI-1.jpg`](img/UI-1.jpg),
> [`docs/img/UI-2.jpg`](img/UI-2.jpg), [`docs/img/UI-3.jpg`](img/UI-3.jpg).
> These are **intent sketches, not specs**. Reproduce the *layout and
> interaction*; take every color, radius, spacing, and font from the project
> design system (CSS vars `--surface-1/2/3`, `--border`, `--text-primary/
> secondary/tertiary`, `--accent`, `--warning`, `--error`; Tailwind classes as
> used in the existing chat components). Do not hand-pick hex values.
>
> **Dependency:** Phase 5 (`ChatModelSelect`) needs `setChatModel` and
> `settings.chat.quickModels` from
> [`docs/chat-model-quick-select-v1.md`](chat-model-quick-select-v1.md) Phase 3.
> Phases 1–4 have no dependency on it and can land first.

## Context

The composer today
([`ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte)) renders a
flat wrap of chips above the input, and floats `ChatReasoningSelect` + the round
Send/Stop button in an absolutely-positioned overlay at `bottom-1.5 right-1.5`
inside the input. Context usage is a full-width horizontal bar
([`ChatContextMeter.svelte`](../src/components/chat/ChatContextMeter.svelte))
mounted above the composer in
[`ChatShell.svelte:51`](../src/components/chat/ChatShell.svelte).

The mockups replace that with three things:

1. **A single context bar** above the input that tucks behind it, showing the
   active tab by **name + favicon** and nothing else until tokens are actually
   known (UI-1); collapsing to a **favicon stack + tab count + total estimated
   tokens** once they are (UI-2); and expanding on click into a per-tab detail
   panel.
2. **A donut token meter** (UI-3) replacing the horizontal bar: hover → a `%`
   tooltip, click → a popover with Model / Context window / Input / Output /
   Cache.
3. **An action row below the input**, right-aligned, holding
   `Model | Reasoning | Donut`.

### What already exists (do not re-implement)

- **The "don't scrape on tab switch" rule is already honored.** Only
  `addTabAttachment` extracts and estimates
  ([`chatStore.svelte.js:146`](../src/stores/chatStore.svelte.js)); the active
  page source chip has never carried an estimate. Phase 1 must **preserve** this.
- `chatState.contextUsage` is per-tab session state fed by `onDiagnostics` from
  five call sites in `chatStore`; `createChatSessionState()` + `SESSION_KEYS` +
  `stashViewInto`/`projectSessionToView` carry any new session key between the
  active view and inactive-tab snapshots automatically.
- [`contextBudgeter.js`](../src/lib/chat/contextPipeline/contextBudgeter.js)
  **already computes per-source token counts** (`const tokens =
  estimateTokens(selection.content)`), it just discards them — it returns only
  `includedSourceIds`/`droppedSourceIds`.
- `usage` from the adapter is already normalized
  ([`aiSdkAdapter.js:795-818`](../src/lib/api/aiSdkAdapter.js)) to
  `{ promptTokens, completionTokens, totalTokens, inputTokens, outputTokens,
  cachedInputTokens }` — Input/Output/Cache for UI-3 need **no** provider work.
- `Tooltip.svelte` ([`src/components/ui/Tooltip.svelte`](../src/components/ui/Tooltip.svelte))
  is a bits-ui wrapper, ready to use. bits-ui is `^2.18.1` — `Popover` is
  available; the project has not used it yet.
- `slideScaleFade` ([`src/lib/ui/slideScaleFade.js`](../src/lib/ui/slideScaleFade.js))
  is the project's slide/scale transition — use it for the expand panel, not a
  bespoke animation.
- Iconify resolves over the network (`*://*.iconify.design/*` is in
  `host_permissions` in [`wxt.config.ts`](../wxt.config.ts)); `simple-icons:*`
  and `heroicons:*` both already ship in the app.

### Gaps this plan closes

- `chatState` holds `currentUrl` **only** — no tab title, no favicon. The active
  source chip shows `activeSourceLabelForUrl()` → the generic `"This video"` /
  `"This page"`, not the real title UI-1 asks for.
- `contextUsage` is `{ used, inputBudget, window, source }` — it has **no**
  input/output/cache/model, so UI-3's popover cannot be built from it.
- Per-source token counts are computed and thrown away, so the UI-2 expand panel
  has no number to show for the active page.
- `formatK` is copy-pasted in `ChatContextMeter.svelte` and
  `ChatSourceChip.svelte`; the donut would make a third copy.

### Design decisions (confirmed with user)

- **Doc split:** this plan owns all composer UI for the three mockups, including
  the model switcher *component*. `chat-model-quick-select-v1.md` keeps the
  routing/state/settings logic behind it.
- **Tab icon = real favicon with fallback.** Use `tab.favIconUrl` from
  `browser.tabs` (the `tabs` permission is already granted; this is tab
  *metadata*, not content — it does not violate the no-scrape rule). Fall back to
  the existing design-system `iconForSourceKind()` icon when `favIconUrl` is
  absent, is not `http(s)`, or fails to load.
- **Donut fill = `used / inputBudget`**, not `used / window`. This preserves the
  deliberate choice documented in `ChatContextMeter.svelte:18-21` and keeps the
  existing 80% / 95% warning bands meaningful. The popover shows **both** the
  `used/window` row that UI-3 draws *and* an input-budget row, so the two
  denominators never silently contradict each other.
- **Send button stays as-is** (the round `size-10` Send/Stop inside the input).
  The `↵` in the mockups is sketch shorthand; the round button is a shipped,
  working affordance. Only `ChatReasoningSelect` moves out of the absolute
  overlay and into the new action row.
- **Tokens are only ever shown when known.** The bar never triggers extraction to
  produce a number.

### UI-2 count semantics (verify with user if it looks wrong when built)

`+ 2 tab` next to two favicons is read as: **favicon stack = every source
(capped at 3, overlapping)**, **`+ N tab` = the number of tabs added *beyond* the
active page**. In UI-2 that is YouTube (active page) + Reddit + one more = 3
sources → 2 icons visible + `+ 2 tab`. `~25k tokens` is the sum over all sources.

## Phase 1 — Active-tab identity (title + favicon) with no extraction

**The hard rule for this phase:** title and favicon come from `browser.tabs`
metadata only. Nothing here may call `chatSourceService.captureTabSource`,
`estimateAttachmentTokens`, or any content script. Switching tabs must stay free.

1. [`chatStore.svelte.js`](../src/stores/chatStore.svelte.js) —
   `createChatSessionState()`: add `currentTitle: null` and
   `currentFavIconUrl: null` next to `currentUrl`. `SESSION_KEYS` picks them up
   automatically; do not touch `stashViewInto`/`projectSessionToView`.
2. Widen `syncChatForActiveTab(tabId, { url })` (line ~318) to
   `{ url, title, favIconUrl }`. Mirror the existing `currentUrl` treatment:
   write into the session before `projectSessionToView(session)`. Unlike
   `currentUrl` (which is only set `if (url && !session.currentUrl)` — sticky
   first-write), **title and favicon must refresh on every sync** — a tab's title
   changes as it loads, and a stale title is a visible bug.
3. Add an exported `updateChatTabMetadata(tabId, { title, favIconUrl })` for the
   `onUpdated` path, writing through `writeSession` so an inactive tab's snapshot
   updates too.
4. [`ChatTabTitleBar.svelte`](../src/components/chat/ChatTabTitleBar.svelte) is
   the only place that owns browser tab events — extend it, do not add a second
   listener elsewhere:
   - `handleActivated` already does `browser.tabs.get(tabId)`; pass
     `title: tab?.title`, `favIconUrl: tab?.favIconUrl` into
     `syncChatForActiveTab`.
   - `handleUpdated` already receives `changeInfo`; when
     `changeInfo.title || changeInfo.favIconUrl` fire
     `updateChatTabMetadata(tabId, changeInfo)`.
   - `initialize()` already queries the active tab — pass title/favicon there too.
5. Do **not** add `title`/`favIconUrl` to `tabMentionService.select()`'s return
   in this phase — Phase 2 needs it for attachment chips, and it is specified
   there.

**Verify:** extend
[`tests/chat/chatStoreTabs.test.js`](../tests/chat/chatStoreTabs.test.js):

- two browser tabs keep independent `currentTitle`/`currentFavIconUrl`, and
  switching between them projects the right pair into the view;
- a later `syncChatForActiveTab` with a new title **overwrites** the old one
  (unlike `currentUrl`);
- `updateChatTabMetadata` on an **inactive** tab updates that tab's snapshot
  without touching the active view;
- **the no-scrape guard:** spy on `chatSourceService.captureTabSource` and assert
  it is **not called** by any number of `syncChatForActiveTab` /
  `updateChatTabMetadata` calls. This is the regression test for the user's core
  requirement — do not skip it.

```bash
npx vitest run tests/chat/chatStoreTabs.test.js
```

## Phase 2 — `ChatContextBar` (UI-1 idle / UI-2 collapsed + expand)

Replaces the chip-row block at
[`ChatComposer.svelte:233-266`](../src/components/chat/ChatComposer.svelte).

1. **Shared formatter first.** Create `src/lib/utils/formatTokens.js` exporting
   `formatK(n)` (lift the identical body out of `ChatContextMeter.svelte:10` /
   `ChatSourceChip.svelte:17`) and update both existing components to import it.
   The bar and the donut then reuse it instead of adding copies 3 and 4.
2. **`src/components/chat/ChatFavicon.svelte`** (new): renders `favIconUrl` in an
   `<img>` at 14–16px with `onerror` → fall back to `<Icon icon={fallbackIcon}>`.
   Guard the URL: only render `http:`/`https:`/`data:` — a `chrome://` favicon
   URL must go straight to the fallback. Always pass a `fallbackIcon` from
   `iconForSourceKind()`. Decorative → `alt=""`.
3. **`tabMentionService.select()`** (line ~111): add `title` (already there) and
   `favIconUrl: tab.favIconUrl` to the returned attachment so attachment rows get
   a favicon too. This is metadata off the tab object the caller already holds —
   no extra API call.
4. **`src/components/chat/ChatContextBar.svelte`** (new). Inputs: the active
   source (`currentUrl`/`currentTitle`/`currentFavIconUrl`/`activeSourceKind`/
   `activeSourceDismissed`), `pendingAttachments`, `selectedSkill`, and the
   per-source tokens from Phase 3.

   Build one `sources` list = `[activePage?, ...pendingAttachments]`, each
   `{ key, title, favIconUrl, kind, tokens|null, estimating, isActivePage,
   onRemove }`. Derive:

   ```js
   const knownTokens = $derived(sources.reduce((sum, s) => sum + (s.tokens || 0), 0))
   const addedCount  = $derived(sources.filter((s) => !s.isActivePage).length)
   // UI-1 → UI-2 flips only when tokens are actually known, or more than the
   // active page is in context. It never flips by *measuring* anything.
   const mode = $derived(knownTokens > 0 || addedCount > 0 ? 'summary' : 'title')
   ```

   - **`title` mode (UI-1):** one row — `ChatFavicon` + truncated
     `currentTitle` (fall back to `activeSourceLabelForUrl(currentUrl)` when the
     title is not in yet). **No token text. Not clickable.**
   - **`summary` mode (UI-2):** favicon stack (first 3, overlapping with a small
     negative margin and a ring in `--surface-1` to separate them) + `+ {addedCount} tab`
     on the left; `~{formatK(knownTokens)} tokens` right-aligned. The whole row is
     a `<button>` → toggles expand. `aria-expanded`, `aria-controls`.
   - **expanded:** panel above the bar, `transition:slideScaleFade` (respect
     `isReduceMotionEnabled()` from
     [`src/services/animationService.js`](../src/services/animationService.js) —
     `SidepanelTabBar.svelte` shows the pattern). One row per source: favicon,
     truncated title, `labelForSourceKind()` badge, `~{formatK(tokens)}` (or a
     spinner while `estimating`, or `—` when unknown), and the ✕ remove button.
     ✕ on the active page calls `dismissActiveSource()`; on an attachment,
     `removeTabAttachment(tabId, sourceKind)`. Close on outside-click and `Esc`.
   - Keep the existing **restore** affordance (the dashed `+ {label}` button at
     `ChatComposer.svelte:243-252`) for when `activeSourceDismissed` is true.
   - `ChatSkillChip` stays where it is, above/beside the bar — the skill is not a
     source and must not be counted in `addedCount`.
   - Style it to tuck **behind** the input: slightly inset horizontally, rounded
     top corners only, `--surface-2`-ish, with the input overlapping its bottom
     edge (mockups UI-1/UI-2). Negative bottom margin on the bar + the input
     drawn after it is the simplest route; no `z-index` fight with the send
     button's `z-20`.
5. **Mount** in `ChatComposer.svelte` in place of the deleted chip row.
   `ChatSourceChip.svelte` stays in the repo — it is still used by the expand
   panel rows if you choose to reuse it; if the panel row ends up bespoke, leave
   `ChatSourceChip` untouched rather than deleting it (other call sites may land
   from `chat-simple-sources-v1`).
6. **i18n:** every new string goes into all 8 locale files in
   `src/lib/locales/` (`de, en, es, fr, ja, ko, vi, zh-CN`).

**Verify:** add `tests/chat/composer/ChatContextBar.test.svelte.js`:

- active page only, no tokens → title mode: renders `currentTitle`, renders **no**
  `tokens` text, is not a button;
- one attachment with an estimate → summary mode: `+ 1 tab` and the `~Xk tokens`
  total;
- click → expand lists every source with its own token figure; ✕ on an
  attachment calls `removeTabAttachment`; ✕ on the active page calls
  `dismissActiveSource`;
- a source with `favIconUrl: undefined` renders the `iconForSourceKind` fallback,
  and a `chrome://` favicon does too;
- `estimating: true` renders the spinner, not `—`.

```bash
npx vitest run tests/chat/composer/ChatContextBar.test.svelte.js tests/chat/chatStoreTabs.test.js
```

## Phase 3 — Enrich the diagnostics payload (per-source tokens + input/output/cache/model)

1. [`contextBudgeter.js`](../src/lib/chat/contextPipeline/contextBudgeter.js):
   in the `for (const { source, destination } of sourceGroups)` loop the local
   `tokens` is already computed — accumulate `sourceTokens[sourceId] = tokens`
   and return `sourceTokens` alongside `includedSourceIds`. Dropped sources are
   simply absent from the map. **Do not change any budgeting math** — this is a
   pure read-out; the source block must stay byte-stable for prompt caching.
2. [`contextPipeline/index.js`](../src/lib/chat/contextPipeline/index.js): merge
   the count into each `groundingRefs` entry (`tokens: budget.sourceTokens[id] ??
   null`) and surface `sourceTokens` on the pipeline result.
3. [`chatService.js`](../src/services/chat/chatService.js): extend the
   `onDiagnostics?.({...})` payload at **both** call sites (line ~280 in
   `runGeneration` and line ~609 in `continueResponse`). Keep the four existing
   keys byte-identical — `ChatContextMeter` and the new donut both read them:

   ```js
   onDiagnostics?.({
     used: realUsed,
     inputBudget: pipeline.inputBudgetTokens,
     window: pipeline.capabilities?.contextWindowTokens,
     source: pipeline.capabilities?.source,
     // new — `usage` is already normalized by aiSdkAdapter.normalizeUsage
     input: usage?.promptTokens ?? null,
     output: usage?.completionTokens ?? null,
     cached: usage?.cachedInputTokens ?? null,
     providerId: conversationProviderId,
     modelId: conversationModelId,
     sourceTokens: pipeline.sourceTokens || {},
   })
   ```

   `getDisplayModelName` in `aiSdkAdapter.js:949` is **module-private** — do not
   try to import it. Pass `providerId`/`modelId` and let the UI resolve the label
   through `resolveProviderEntry(providerId, settings)` (which also gives dynamic
   OpenAI-compatible profiles their profile name).
4. The five `onDiagnostics: (usage) => writeSession(targetTabId, { contextUsage:
   usage })` handlers in `chatStore` need **no change** — they pass the object
   through whole.
5. Feed `sourceTokens` into the Phase 2 bar: after a send, the active page finally
   has a real number without anything being re-extracted.

**Verify:**

- extend `tests/chat/contextPipeline/contextPipeline.test.js`: `sourceTokens` has
  an entry per included source, matches `estimateTokens` of the selected content,
  omits dropped sources; and the assembled `system`/`messages` are **unchanged**
  from the current fixtures (proves the read-out is inert);
- extend [`tests/chat/chatService.test.js`](../tests/chat/chatService.test.js):
  `onDiagnostics` fires with `input`/`output`/`cached`/`providerId`/`modelId`
  populated from a mocked usage, the four legacy keys are unchanged, and
  `cached: null` when the provider reports no cache figure.

```bash
npx vitest run tests/chat/contextPipeline/contextPipeline.test.js tests/chat/chatService.test.js
```

## Phase 4 — `ChatContextDonut` (UI-3) + the composer action row

1. **`src/components/chat/ChatContextDonut.svelte`** (new). Props: `usage`,
   `pendingEstimate`.
   - Reuse the maths from `ChatContextMeter.svelte:21-31` verbatim —
     `capacity = usage?.inputBudget > 0 ? usage.inputBudget : usage?.window`,
     `percent = clamp(round(used / capacity * 100), 0, 100)`,
     `level = percent >= 95 ? 'error' : percent >= 80 ? 'warning' : 'normal'`.
   - Render a ~16–18px SVG donut: a track `circle` in `--blackwhite-5` and a
     progress `circle` with `stroke-dasharray` = circumference and
     `stroke-dashoffset` = `circumference * (1 - percent/100)`, rotated -90° so it
     fills from 12 o'clock. Color from `level` (`--accent`/`--warning`/`--error`),
     matching the bar's existing `bg-accent`/`bg-warning`/`bg-error` bands.
   - **Hover** → `Tooltip` (`src/components/ui/Tooltip.svelte`) with
     `{percent}%` and nothing else, per the mockup.
   - **Click** → bits-ui `Popover`, `side="top" align="end"`, label/value rows:
     - `Model` → `resolveProviderEntry(usage.providerId, settings)` label +
       `usage.modelId`; warning state (not a crash) when the entry resolves to
       `null` (deleted OpenAI-compatible profile).
     - `Context window` → `{formatK(usage.used)}/{formatK(usage.window)}` (UI-3).
     - `Input budget` → `{formatK(usage.used)}/{formatK(capacity)}` — the donut's
       actual denominator; this row is why the two numbers can differ.
     - `Input` / `Output` / `Cache` → `usage.input` / `usage.output` /
       `usage.cached`; render a row only when its value is non-null (Cache is
       absent on most providers).
     - Keep the existing `source` badge (`exact`/`catalog`/`curated`/`estimated`
       from `SOURCE_LABELS` in `ChatContextMeter.svelte:33-40`) — it is the only
       signal that a window size is a guess.
     - Values right-aligned, `tabular-nums`.
   - **Before the first send** `usage` is `null`: render the donut empty/at 0 with
     an `aria-label` saying usage is not known yet, and no popover rows beyond
     Model. Do not hide it — the mockups show it in every state.
   - `role="button"`, keyboard-openable, `aria-label="Context window usage:
     {percent}%"` (reuse the meter's existing string).
2. **Action row** in
   [`ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte):
   - Pull `ChatReasoningSelect` **out** of the `absolute bottom-1.5 right-1.5`
     overlay; leave the round Send/Stop button in that overlay untouched.
   - Add a right-aligned flex row **below** the input wrapper:
     `[ChatModelSelect (Phase 5)] [ChatReasoningSelect] [ChatContextDonut]`,
     `gap-1.5`, `text-xs`, vertically centered — matching UI-1/UI-2/UI-3's
     `Opus 4.8   High   ◐`.
   - The donut needs `usage` + `pendingEstimate`. `pendingEstimate` is currently
     derived in `ChatShell.svelte:19`; move that `$derived` into the composer (or
     into the bar and pass down) — do not compute it twice.
3. **Remove the horizontal meter:** drop `<ChatContextMeter …>` and its import
   from [`ChatShell.svelte:7,51`](../src/components/chat/ChatShell.svelte).
   **Keep `<ChatContextWarning>`** — it is a separate concern and stays where it
   is. Delete `ChatContextMeter.svelte` only once nothing imports it (`grep -rn
   ChatContextMeter src/ tests/`); its `formatK` moved out in Phase 2 and its
   maths/`SOURCE_LABELS` move here, so do not delete it before both are lifted.
4. **i18n:** all new strings into the 8 locale files.

**Verify:** add `tests/chat/composer/ChatContextDonut.test.svelte.js`:

- `percent` and `level` bands at 79/80/95 against `inputBudget`, **not** `window`
  (guard against a future "fix" to the mockup's denominator);
- `usage: null` renders without throwing and shows no stale numbers;
- the popover shows the `Context window` and `Input budget` rows with their
  different denominators;
- `cached: null` omits the Cache row; `cached: 160000` renders it;
- an unresolvable `providerId` renders the warning state instead of throwing.

```bash
npx vitest run tests/chat/composer/ChatContextDonut.test.svelte.js
npm check
```

## Phase 5 — `ChatModelSelect` (the `Opus 4.8` trigger)

> **Blocked on** `chat-model-quick-select-v1.md` Phase 3 (`setChatModel`,
> `chatState.modelOverride`, `settings.chat.quickModels`). If that has not
> landed, stop after Phase 4 — Phases 1–4 ship a coherent UI on their own.

1. **`src/components/chat/ChatModelSelect.svelte`** (new): bits-ui
   `DropdownMenu` following
   [`ChatReasoningSelect.svelte`](../src/components/chat/ChatReasoningSelect.svelte)
   — same trigger shape, same `side="top"` menu, same `--surface`/`--border`
   tokens, so the two controls read as a set in the action row. Compact trigger =
   provider icon + truncated model name (`Opus 4.8`), `aria-label="Chat model:
   {model}"`.
2. Resolve every entry's label/icon through `resolveProviderEntry(provider,
   settings)` so dynamic `openai-compatible-*` profiles show their profile name;
   an unconfigured provider or deleted profile (`resolveProviderEntry` → `null`)
   renders a warning state, never a crash.
3. Menu items in order: **Default** (`settings.chat.provider/model`, labeled as
   default) → each `settings.chat.quickModels` entry → the conversation's current
   pair if in neither group → separator → **Manage models…** (opens Settings >
   Chat via the side panel's existing open-settings pathway).
4. Selecting calls `setChatModel`. Checkmark on the effective pair. Disabled while
   `chatState.isSending`.
5. Mount as the **leftmost** item of the Phase 4 action row.
6. **i18n:** 8 locale files.

**Verify:** add `tests/chat/composer/ChatModelSelect.test.svelte.js` — menu
contents and order, selection callback, dynamic-profile label, deleted-profile
warning state, disabled-while-sending.

```bash
npx vitest run tests/chat/composer/ChatModelSelect.test.svelte.js
npm check
```

## Phase 6 — Regression and smoke matrix

```bash
npm test
npm check
npm run build
npm run build:firefox
git diff --check
```

Manual smoke on `.output/chrome`:

- **The core acceptance test — no scraping on tab switch.** Open the side panel,
  switch across 5+ tabs without typing. The bar must show each tab's title +
  favicon immediately, show **no** token figure, and the network/console must show
  **no** content extraction. Then send one message and confirm the bar flips to
  the count + token form.
- UI-1: a fresh tab shows favicon + real page title; a tab whose title is still
  loading falls back to `This page`/`This video` and then updates in place.
- UI-2: `@`-attach two tabs → `+ 2 tab` + a `~Xk tokens` total; click → the panel
  slides up with a per-tab breakdown; ✕ removes the right one; ✕ on the active
  page dismisses it and the dashed restore button returns.
- A tab with no favicon (e.g. `about:blank`, a local file) and one with a
  `chrome://` favicon both render the design-system fallback, not a broken image.
- UI-3: donut fills as the conversation grows; hover shows `%`; click shows Model
  / Context window / Input budget / Output / Cache; on a provider with no cache
  reporting the Cache row is absent, not `0`.
- Donut turns warning at 80% and error at 95% **of the input budget** — the same
  point the old bar did.
- Both `.output/firefox` and the sidebar layout: the composer action row does not
  wrap or clip at the 22.5rem min width (`ChatShell.svelte:48`).
- Long tab titles truncate rather than pushing `~Xk tokens` off the row.
- Per-tab isolation: two browser tabs keep separate bars, expand states, and
  donut figures.

## Out of scope (V1)

- Reordering or drag-drop of sources in the expand panel.
- Showing per-message token cost in the transcript (`ChatMessage.svelte:98-109`
  already does its own thing — leave it).
- Replacing the round Send/Stop button with the mockup's inline `↵`.
- Cost/pricing display in the donut popover — tokens only.
- Any change to budgeting, trimming, or the source block's byte layout.
- The quick-models manager and default-reasoning controls in Settings — those stay
  in `chat-model-quick-select-v1.md`.
- Favicon caching/persistence: favicons come from live `browser.tabs` metadata; a
  restored conversation whose tab is gone shows the fallback icon.

## Final verification checklist

- [ ] Switching browser tabs triggers **zero** content extraction and shows no
      token figure (spy-backed test **and** manual confirmation).
- [ ] UI-1: active tab renders real title + favicon, with the
      `activeSourceLabelForUrl` fallback before the title arrives.
- [ ] UI-2: favicon stack + `+ N tab` + `~Xk tokens`; click expands a per-tab
      breakdown; removal works for both the active page and attachments.
- [ ] Missing / non-`http(s)` favicons fall back to `iconForSourceKind()`.
- [ ] UI-3: donut + `%` tooltip on hover + detail popover on click.
- [ ] Donut fills against `inputBudget`; the popover shows both the `used/window`
      and `used/inputBudget` rows; 80/95 bands unchanged.
- [ ] `Input`/`Output`/`Cache` come from the already-normalized adapter usage;
      absent values omit their row.
- [ ] Per-source tokens are a pure read-out — assembled `system`/`messages` are
      byte-for-byte unchanged.
- [ ] `formatK` exists once, in `src/lib/utils/formatTokens.js`.
- [ ] `ChatContextMeter` is gone from `ChatShell`; `ChatContextWarning` still
      renders.
- [ ] Action row `Model | Reasoning | Donut` does not wrap at 22.5rem.
- [ ] Per-tab isolation of bar/expand/donut state.
- [ ] Design system only — no hard-coded colors from the mockups.
- [ ] All 8 locales updated; no raw i18n keys.
- [ ] `npm test`, `npm check`, both builds, `git diff --check` pass.

## Notable files

- `src/stores/chatStore.svelte.js` — `currentTitle`/`currentFavIconUrl` session
  keys, widened `syncChatForActiveTab`, new `updateChatTabMetadata`.
- `src/components/chat/ChatTabTitleBar.svelte` — the single owner of browser tab
  events; feeds title/favicon through.
- `src/components/chat/ChatContextBar.svelte` — **new**, UI-1/UI-2 + expand.
- `src/components/chat/ChatFavicon.svelte` — **new**, favicon + fallback.
- `src/components/chat/ChatContextDonut.svelte` — **new**, UI-3.
- `src/components/chat/ChatModelSelect.svelte` — **new**, Phase 5.
- `src/components/chat/ChatComposer.svelte` — hosts the bar and the action row.
- `src/components/chat/ChatShell.svelte` — drops `ChatContextMeter`, keeps
  `ChatContextWarning`.
- `src/components/chat/ChatContextMeter.svelte` — retired; its maths and
  `SOURCE_LABELS` move to the donut.
- `src/lib/utils/formatTokens.js` — **new**, the single `formatK`.
- `src/lib/chat/contextPipeline/contextBudgeter.js`, `contextAssembler.js`,
  `index.js` — per-source `sourceTokens` read-out.
- `src/services/chat/chatService.js` — enriched `onDiagnostics` at both call
  sites.
- `src/services/chat/tabMentionService.js` — `favIconUrl` on selected tabs.
- `tests/chat/chatStoreTabs.test.js`, `tests/chat/contextPipeline/contextPipeline.test.js`,
  `tests/chat/chatService.test.js`, `tests/chat/composer/ChatContextBar.test.svelte.js`,
  `tests/chat/composer/ChatContextDonut.test.svelte.js`,
  `tests/chat/composer/ChatModelSelect.test.svelte.js` — coverage.
