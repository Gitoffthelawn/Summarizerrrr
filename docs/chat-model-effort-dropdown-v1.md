# Merge Model + Reasoning into one Dropdown (chat composer) — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in
> a fresh session. Start at Phase 1 and go in order. Each phase ends with a
> verify step — don't move on until it passes.

## Context

In the sidepanel chat composer, the action row currently renders **two separate
pill buttons** side by side, plus the context donut:

```
[ Model ▾ ]  [ Reasoning ▾ ]  [ ◔ Donut ]
```

See [`ChatComposer.svelte:308-318`](../src/components/chat/ChatComposer.svelte).
The two pills are:

- **`ChatModelSelect.svelte`** — a `bits-ui` `DropdownMenu` that reads the store
  directly (takes no props). Trigger shows a provider icon + truncated model
  name. Menu lists: default model (from `settings.chat`), user quick-models
  (`settings.chat.quickModels`), the current conversation model, a separator,
  and a "Manage models…" link to `settings.html?tab=chat`. It resolves the
  effective model via `getEffectiveChatModel()` and selects via
  `setChatModel({ provider, model })` (both from `chatStore.svelte.js`).
- **`ChatReasoningSelect.svelte`** — a `bits-ui` `DropdownMenu` that is
  **controlled by props** (`value`, `options`, `disabled`, `onchange`). The
  reasoning derivation (`activeProviderId`, `activeModelId`, `reasoningOptions`,
  `displayedReasoningLevel`, a reset `$effect`, and `handleReasoningChange`)
  currently lives in `ChatComposer.svelte:38-69` and is passed down as props.
  Options come from `getChatReasoningOptions(providerId, modelId)` in
  [`reasoningConfig.js`](../src/lib/api/reasoningConfig.js): full-reasoning
  providers get `Auto / Low / Medium / High`; auto-only providers
  (openaiCompatible, lmstudio) get just `Auto` (`provider-default`).

**The goal:** merge these two pills into a **single dropdown**. The trigger
displays e.g. `Deepseek v4 pro High` where the effort word ("High") is a
**dimmer/lighter color** than the model name. Clicking opens the model list, and
a single **"Reasoning" submenu item at the bottom** opens a `bits-ui`
`SubContent` to pick the reasoning level for the active model.

Relevant facts confirmed during exploration:
- `bits-ui@^2.18.1` supports `DropdownMenu.Sub / SubTrigger / SubContent`, but
  **no submenu is used anywhere in the repo yet** — this establishes the first.
- Reasoning level is stored per-tab on `chatState.reasoningLevel` (`null` =
  "use global default"); the effective value is computed by
  `effectiveReasoningLevel(chatState.reasoningLevel, settings)`. It is snapshotted
  onto the request at send time inside `chatStore.svelte.js`. There is **no
  dedicated setter** — the composer mutates `chatState.reasoningLevel` directly
  then calls `notifyChatDraftChanged()`.
- Styling convention for these composer menus: scoped `<style>` targeting the
  portalled menu classes with `:global(...)`, using CSS tokens
  (`--color-surface-1/2`, `--color-border`, `--color-primary`, `--color-muted`,
  `--color-text-primary/secondary`, `--color-blackwhite`, `--color-warning`) and
  bits-ui's `[data-highlighted]` attribute for focus/hover state.

### Goal & scope decision (confirmed with user)

- **Effort label on the trigger shows only when a concrete level is chosen
  (Low/Medium/High).** When the level is Auto (`provider-default`) OR the
  provider is auto-only (no real effort choice), the effort word is **hidden** —
  the trigger shows just the model name.
- **The reasoning picker is a single submenu item at the bottom of the model
  list** (SubTrigger "Reasoning" → SubContent with the options), applying to the
  currently-active model. NOT a per-model submenu.
- Effort word is rendered in a **dimmer color** (`--color-muted`) than the model
  name.
- **No new dependencies** (bits-ui already present). No changes to reasoning
  option definitions, to the send-time snapshot logic, or to how models are
  stored/resolved. Pure UI consolidation.

## Phase 1 — Merge reasoning into `ChatModelSelect.svelte`

Fold all reasoning logic and a submenu into
[`src/components/chat/ChatModelSelect.svelte`](../src/components/chat/ChatModelSelect.svelte)
so it becomes a unified "model + effort" control. It already reads the store, so
keep it prop-less.

**Script additions:**
- Import from `reasoningConfig.js`: `getChatReasoningOptions`,
  `effectiveReasoningLevel`. Import `notifyChatDraftChanged` from
  `@/stores/chatStore.svelte.js` (alongside the existing `chatState`,
  `setChatModel`, `getEffectiveChatModel`).
- Add derivations (mirror the block being removed from `ChatComposer.svelte:38-69`):
  ```js
  const activeProviderId = $derived(chatState.conversation?.providerId || settings.chat?.provider || '')
  const activeModelId = $derived(chatState.conversation?.modelId || settings.chat?.model || null)
  const reasoningOptions = $derived(getChatReasoningOptions(activeProviderId, activeModelId))
  const displayedReasoningLevel = $derived(effectiveReasoningLevel(chatState.reasoningLevel, settings))
  const currentChoice = $derived(reasoningOptions.find((o) => o.value === displayedReasoningLevel) || reasoningOptions[0])
  const supportsReasoning = $derived(reasoningOptions.length > 1)
  const showEffortSuffix = $derived(supportsReasoning && displayedReasoningLevel !== 'provider-default')
  ```
- Move the reset `$effect` and `handleReasoningChange` from ChatComposer verbatim:
  ```js
  $effect(() => {
    const validValues = new Set(reasoningOptions.map((o) => o.value))
    if (!validValues.has(effectiveReasoningLevel(chatState.reasoningLevel, settings))) {
      chatState.reasoningLevel = 'provider-default'
      notifyChatDraftChanged()
    }
  })
  function handleReasoningChange(level) {
    chatState.reasoningLevel = level
    notifyChatDraftChanged()
  }
  ```

**Trigger markup** (inside the existing `<button class="model-trigger">`, right
after `<span class="model-trigger-label">…</span>`, ~line 126):
```svelte
{#if showEffortSuffix}
  <span class="model-trigger-effort">{currentChoice?.label}</span>
{/if}
```

**Content markup** — keep the model `{#each}` list untouched. Between the model
list and the existing final separator + "Manage models…" item, insert the
reasoning submenu, guarded by `supportsReasoning`:
```svelte
<DropdownMenu.Separator class="model-separator" />
{#if supportsReasoning}
  <DropdownMenu.Sub>
    <DropdownMenu.SubTrigger class="model-option reasoning-subtrigger">
      <div class="model-option-content">
        <Icon icon="heroicons:sparkles" width="14" height="14" class="model-option-icon" />
        <span class="model-option-label">{$_('chat.model_select.reasoning', { default: 'Reasoning' })}</span>
        <span class="reasoning-current">{currentChoice?.label}</span>
        <Icon icon="heroicons:chevron-right-16-solid" width="14" height="14" class="reasoning-sub-caret" />
      </div>
    </DropdownMenu.SubTrigger>
    <DropdownMenu.SubContent class="reasoning-submenu" sideOffset={4}>
      {#each reasoningOptions as option (option.value)}
        <DropdownMenu.Item
          class="reasoning-option {option.value === displayedReasoningLevel ? 'reasoning-option-active' : ''}"
          onSelect={() => handleReasoningChange(option.value)}
        >
          <span class="reasoning-option-label">{option.label}</span>
          <span class="reasoning-option-desc">{option.description}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.SubContent>
  </DropdownMenu.Sub>
  <DropdownMenu.Separator class="model-separator" />
{/if}
```
(The existing "Manage models…" item and its preceding separator stay; the block
above adds the reasoning submenu just before them. Avoid double separators — if
`supportsReasoning` is false, only the original single separator before "Manage
models…" should render. Adjust so there's exactly one separator in each case.)

**Styles** (append to the scoped `<style>`):
- `.model-trigger-effort` — `color: var(--color-muted); font-weight: 400;
  user-select: none;` (dimmer than the `--color-text-secondary` model label).
- `.reasoning-current` — `margin-left: auto; color: var(--color-muted);
  font-size: 0.75rem;` (right-aligned current level in the SubTrigger row).
- `:global(.reasoning-subtrigger[data-highlighted])`,
  `:global(.reasoning-subtrigger[data-state='open'])` — `background:
  var(--color-surface-2);` (match `.model-option:hover`).
- Copy the reasoning menu/option styles from `ChatReasoningSelect.svelte`
  (lines 95-149), renaming `.reasoning-menu` → `.reasoning-submenu`: the
  `:global(.reasoning-submenu)` container box (surface-1 / dark surface-2,
  border, radius 8px, shadow, `z-index: 50`, `min-width: 180px`, `padding: 4px`),
  `:global(.reasoning-option)` (column layout, padding, radius),
  `:global(.reasoning-option[data-highlighted])` hover,
  `:global(.reasoning-option-active)`, `.reasoning-option-label`,
  `.reasoning-option-desc`. Keep the same token colors.

Note: bits-ui opens `SubContent` to the right by default and auto-flips to the
left when it would overflow the narrow sidepanel — no extra config needed; just
confirm visually in Phase 4.

**Verify:** `npm run check` passes with no new errors referencing
`ChatModelSelect.svelte`. Temporarily eyeball that the file compiles (no unclosed
`DropdownMenu.Sub`).

## Phase 2 — Remove the standalone reasoning pill from `ChatComposer.svelte`

In [`src/components/chat/ChatComposer.svelte`](../src/components/chat/ChatComposer.svelte):
- Delete the `<ChatReasoningSelect …/>` element from the action row
  (lines ~311-316); leave `<ChatModelSelect />` and `<ChatContextDonut …/>`.
- Delete the `import ChatReasoningSelect from './ChatReasoningSelect.svelte'`
  (line 12).
- Delete the reasoning derivation block now living in ChatModelSelect:
  `activeProviderId`, `activeModelId`, `reasoningOptions`,
  `displayedReasoningLevel`, the reset `$effect`, and `handleReasoningChange`
  (lines ~38-69).
- Delete the now-unused imports `getChatReasoningOptions`,
  `effectiveReasoningLevel` (lines ~31-34) — **but first** `grep` the file to
  confirm nothing else references them. Keep `notifyChatDraftChanged` (still used
  elsewhere in the composer).

**Verify:** `grep -n "Reasoning\|reasoningOptions\|effectiveReasoningLevel\|getChatReasoningOptions" src/components/chat/ChatComposer.svelte` returns nothing. `npm run check` passes.

## Phase 3 — Delete the obsolete component + its test

- Delete `src/components/chat/ChatReasoningSelect.svelte`.
- Delete `tests/chat/composer/ChatReasoningSelect.test.svelte.js`.
- `grep -rn "ChatReasoningSelect" src tests` must return nothing.

**Verify:** `grep -rn "ChatReasoningSelect" src tests` is empty. `npm test`
(vitest) runs without a "cannot find module ChatReasoningSelect" failure.

## Phase 4 — Update the model-select test + i18n keys

**Test** — [`tests/chat/composer/ChatModelSelect.test.svelte.js`](../tests/chat/composer/ChatModelSelect.test.svelte.js)
already mocks `svelte-i18n`, `wxt/browser`, and the settings store. Since the
component now also reads reasoning state, add mocking so the effort suffix is
controllable, then add two cases:
- Provider that supports reasoning + `chatState.reasoningLevel = 'high'` → the
  trigger's textContent contains **both** the model name **and** `High`.
- Level `provider-default` (Auto) → the trigger textContent does **not** contain
  `Auto` (effort suffix hidden).
To drive this, either mock `@/stores/chatStore.svelte.js` to expose a controllable
`chatState` + `getEffectiveChatModel`, or mock
`getChatReasoningOptions`/`effectiveReasoningLevel` from
`@/lib/api/reasoningConfig.js`. Follow the existing mock style at the top of the
file.

**i18n** — add key `chat.model_select.reasoning` to every locale in
`src/lib/locales/*.json` (`en, vi, de, es, fr, ja, ko, zh-CN`): English
`"Reasoning"`, Vietnamese `"Suy luận"`, translate the rest (or copy English as a
safe fallback). The `$_(..., { default: 'Reasoning' })` call already degrades
gracefully if a key is missing. The option labels/descriptions
(Auto/Low/Medium/High) stay sourced from `reasoningConfig.js` (hardcoded EN, as
today) — do not move them into i18n in V1.

**Verify:** `npm test` passes, including the two new ChatModelSelect assertions.

## Out of scope (V1)

- Moving reasoning option labels/descriptions into i18n (they remain hardcoded
  in `reasoningConfig.js`).
- Changing which providers support which reasoning levels
  (`FULL_REASONING_PROVIDERS` / `AUTO_ONLY_PROVIDERS`).
- Per-model reasoning levels or persisting reasoning per conversation-model.
- Any change to the model list contents, quick-models management, or the
  send-time reasoning snapshot in `chatStore.svelte.js`.
- Building a reusable generic DropdownMenu wrapper.

## Final verification checklist

- [ ] `npm run check` — no new type/svelte errors.
- [ ] `npm test` — all chat composer tests pass; no reference to the deleted
      `ChatReasoningSelect`.
- [ ] `grep -rn "ChatReasoningSelect" src tests` returns nothing.
- [ ] `npm run dev`, load `.output/chrome` as an unpacked extension, open the
      sidepanel chat:
  - [ ] Action row shows a **single model pill** + donut (no separate reasoning
        pill).
  - [ ] Pick a reasoning-capable provider (e.g. Gemini/DeepSeek), choose **High**
        → trigger reads `<model name> High` with "High" visibly dimmer.
  - [ ] Switch back to **Auto** → trigger shows only the model name (effort word
        hidden).
  - [ ] Open the dropdown → model list, then a **"Reasoning ▸"** row at the
        bottom; hovering opens the SubContent; the active level is marked.
  - [ ] Select an auto-only provider (LM Studio / OpenAI-compatible) → **no**
        Reasoning row appears and the trigger shows no effort word.
  - [ ] Send a message → the chosen level is applied (reflected in the request
        built in `chatStore.svelte.js`).

## Notable files

- `src/components/chat/ChatModelSelect.svelte` — **primary edit**: becomes the
  merged model+effort control with a reasoning submenu and dimmed effort suffix.
- `src/components/chat/ChatComposer.svelte` — remove the reasoning pill + its
  now-migrated derivation block and imports.
- `src/components/chat/ChatReasoningSelect.svelte` — **deleted**.
- `tests/chat/composer/ChatReasoningSelect.test.svelte.js` — **deleted**.
- `tests/chat/composer/ChatModelSelect.test.svelte.js` — extended with effort
  suffix assertions.
- `src/lib/locales/*.json` — add `chat.model_select.reasoning`.
- `src/lib/api/reasoningConfig.js` — **read only** (source of options/levels; no
  edits).
