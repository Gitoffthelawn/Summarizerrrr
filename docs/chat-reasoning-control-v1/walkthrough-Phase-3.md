# Walkthrough - Phase 3: Add the per-tab Svelte 5 composer control

Phase 3 of the [chat-reasoning-control-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-reasoning-control-v1.md) plan added per-tab reasoning effort state to the chat store, wired it through `sendChatMessage`/`editChatMessage`, and created a compact `ChatReasoningSelect` dropdown beside the Send button in the composer.

## Changes Made

### 1. Chat Store — Per-tab reasoning state

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)
- Added `reasoningLevel: null` to `createChatSessionState()` — the `null` sentinel means "use the global default from settings" and is resolved at read time, never at session-creation time (avoiding cold-start issues where the store loads before `loadSettings()` completes).
- Imported `effectiveReasoningLevel` from `reasoningConfig.js`.
- `sendChatMessage` now snapshots `effectiveReasoningLevel(chatState.reasoningLevel, settings)` and passes it to `chatService.send`.
- `editChatMessage` passes the same resolved value to `chatService.edit`.
- Retry, Regenerate, and Continue paths are **not** modified — they correctly reuse the originating user-turn's stored snapshot from the repository.

### 2. Reasoning Selector Component

#### [ChatReasoningSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatReasoningSelect.svelte) [NEW]
- Compact selector using `bits-ui` `DropdownMenu`, following the existing `ConversationMenu.svelte` pattern.
- Accepts `value`, `options`, `disabled`, and `onchange` callback props.
- Shows a sparkles icon plus the current label ("Auto", "Low", "Medium", "High").
- Displays a chevron caret when multiple options are available.
- Each menu item shows a label and a short latency/cost description.
- Disabled when `disabled=true` or when only one option is available (Auto-only providers).
- Accessible `aria-label` reads "Reasoning effort: {level}".
- Scoped CSS with `:global()` selectors for the portal-rendered menu items.
- Opens upward (`side="top"`) to avoid clipping below the composer.

### 3. Composer Integration

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)
- Imported `ChatReasoningSelect`, `getChatReasoningOptions`, `effectiveReasoningLevel`, and `notifyChatDraftChanged`.
- Derives `activeProviderId` from the current conversation's `providerId`, falling back to `settings.chat?.provider` before a conversation exists.
- Derives `reasoningOptions` from `getChatReasoningOptions(activeProviderId, activeModelId)`.
- Derives `displayedReasoningLevel` via `effectiveReasoningLevel()` for the selector's displayed value.
- Added a narrow `$effect` that normalizes the level back to Auto when a provider switch or restored conversation reduces the allowed options.
- Mounted the selector in an absolutely-positioned container beside the Send button.
- Selector is disabled while `chatState.isSending` is true.

## Verification Results

### 1. Component & Unit Tests

Ran `npx vitest run tests/chat/composer/ChatReasoningSelect.test.svelte.js tests/chat/chatStoreTabs.test.js`:

```
 ✓ tests/chat/chatStoreTabs.test.js (4 tests) 4ms
 ✓ tests/chat/composer/ChatReasoningSelect.test.svelte.js (6 tests) 38ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
```

### 2. Full Test Suite

Ran `npm test`:

```
 Test Files  40 passed (40)
      Tests  354 passed (354)
```

### 3. Type Checks

Ran `npm run check`:

```
svelte-check found 0 errors and 17 warnings in 9 files
```

All 17 warnings are pre-existing and unrelated to this phase.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Component renders correct label for each reasoning level value
- [x] Trigger shows "Auto" when value is `provider-default`
- [x] Falls back to first option label when value is not in options list
- [x] Trigger disabled when `disabled=true`
- [x] Trigger disabled when only one option available (Auto-only providers)
- [x] `aria-label` reflects current level
- [x] Per-tab reasoning level isolation (Tab A and Tab B retain independent values)
- [x] Null sentinel resolves to `provider-default` when settings are empty
- [x] Null sentinel resolves to global default after settings load
- [x] Explicit user selection overrides global default
- [x] Full test suite passes (354/354 tests)
- [x] Type checks pass (0 errors)

### Still-Required Manual Verification (To Be Done by User)
- [ ] Open the side-panel chat, verify the reasoning selector appears beside the Send button
- [ ] Switch between two browser tabs, set different reasoning levels, switch back and forth — confirm each tab retains its own value
- [ ] Set a non-Auto default in `settings.chat.defaultReasoningLevel`, open a fresh tab — selector should show that default
- [ ] Switch to an LM Studio or OpenAI-compatible provider — selector should show Auto-only and be non-interactive
- [ ] Start a generation — selector should be disabled while streaming

## Known Follow-ups
- Phase 4 will add AI SDK reasoning-coercion warning surfacing and complete regression verification across all providers.
