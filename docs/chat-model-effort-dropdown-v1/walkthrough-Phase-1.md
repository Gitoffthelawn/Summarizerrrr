# Walkthrough - Phase 1: Merge reasoning into ChatModelSelect.svelte

Phase 1 of the **chat-model-effort-dropdown-v1** plan consolidates the reasoning effort selector into the existing model-select dropdown, making `ChatModelSelect.svelte` a unified "model + effort" control with a dimmed effort suffix on the trigger pill and a `bits-ui` submenu for reasoning level selection.

## Changes Made

### 1. Script — reasoning imports & derivations

#### [ChatModelSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatModelSelect.svelte)
- Added `notifyChatDraftChanged` to the `chatStore.svelte.js` import.
- Added `getChatReasoningOptions` and `effectiveReasoningLevel` imports from `reasoningConfig.js`.
- Added seven `$derived` declarations mirroring the block being removed from `ChatComposer.svelte` in Phase 2: `activeProviderId`, `activeModelId`, `reasoningOptions`, `displayedReasoningLevel`, `currentChoice`, `supportsReasoning`, `showEffortSuffix`.
- Added the narrow `$effect` that resets `chatState.reasoningLevel` to `'provider-default'` when the available options shrink (e.g. on provider switch).
- Added `handleReasoningChange(level)` function that sets `chatState.reasoningLevel` and calls `notifyChatDraftChanged()`.

### 2. Trigger markup — effort suffix

#### [ChatModelSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatModelSelect.svelte)
- After the `<span class="model-trigger-label">`, added a conditional `{#if showEffortSuffix}` block rendering `<span class="model-trigger-effort">{currentChoice?.label}</span>`. This shows "Low", "Medium", or "High" in a dimmer color when the user has chosen a concrete effort level. Hidden when Auto or when the provider is auto-only.

### 3. Dropdown content — reasoning submenu

#### [ChatModelSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatModelSelect.svelte)
- Between the model list and the "Manage models…" item, added a `{#if supportsReasoning}` block containing:
  - `DropdownMenu.Sub` / `SubTrigger` with a sparkles icon, "Reasoning" label, current level badge, and a right-chevron caret.
  - `DropdownMenu.SubContent` listing all `reasoningOptions` as `DropdownMenu.Item`s, each showing label + description, with active highlighting via `reasoning-option-active`.
  - A `DropdownMenu.Separator` after the submenu to cleanly separate it from "Manage models…".
- When `supportsReasoning` is false (auto-only providers), no submenu or extra separator renders.

### 4. Styles — effort suffix & reasoning submenu

#### [ChatModelSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatModelSelect.svelte)
- `.model-trigger-effort` — dimmed effort label (`color: var(--color-muted)`, `font-weight: 400`).
- `.reasoning-current` — right-aligned current level in the SubTrigger row.
- `.reasoning-sub-caret` — chevron icon styling.
- `:global(.reasoning-subtrigger[data-highlighted])` / `[data-state='open']` — hover/open highlight matching model items.
- `:global(.reasoning-submenu)` — submenu container (surface, border, radius, shadow, z-index, padding, animation). Dark-mode variant.
- `:global(.reasoning-option)` — column layout, padding, radius, hover/highlighted states. Active state with primary color mix.
- `:global(.reasoning-option-label)` / `.reasoning-option-desc` — typography matching existing `ChatReasoningSelect.svelte` styles.

## Verification Results

### 1. Type Checks & Compilation

- Ran `npm run check` → **0 errors**, 17 pre-existing warnings (none in `ChatModelSelect.svelte`).

```sh
npm run check
```

```
svelte-check found 0 errors and 17 warnings in 9 files
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] `npm run check` — passes with 0 errors; no new warnings in `ChatModelSelect.svelte`

### Still-Required Manual Verification (To Be Done by User)
- [ ] `npm run dev` → load `.output/chrome` as unpacked extension → open sidepanel chat → verify single model pill shows with dimmed effort suffix when a concrete level (Low/Medium/High) is chosen, and no suffix for Auto
- [ ] Open dropdown → verify "Reasoning ▸" submenu appears at the bottom for reasoning-capable providers, with the correct active level highlighted
- [ ] Verify auto-only providers (LM Studio / OpenAI-compatible) do not show the Reasoning submenu or any effort suffix

## Known Follow-ups

- **Phase 2** removes the standalone `<ChatReasoningSelect>` from `ChatComposer.svelte` and deletes the now-migrated reasoning derivation block.
- **Phase 3** deletes the obsolete `ChatReasoningSelect.svelte` component file and its test.
