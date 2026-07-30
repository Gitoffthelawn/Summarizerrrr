# Walkthrough - Phase 5: `ChatModelSelect` (the `Opus 4.8` trigger)

Phase 5 of the [chat-composer-ui-v1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-composer-ui-v1.md) plan implemented the `ChatModelSelect.svelte` dropdown component, mounted it in the composer action row, added multi-language translations, and verified behavior via unit and type checks.

## Changes Made

### 1. New Component — ChatModelSelect

#### [ChatModelSelect.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatModelSelect.svelte) [NEW]
- Implemented bits-ui `DropdownMenu` trigger showing provider icon and truncated model name (e.g. `gemini-3-fla...`).
- Resolves provider names and icons dynamically via `resolveProviderEntry()`.
- Renders a warning state (warning triangle icon and amber border) when the provider is unconfigured or a custom profile is deleted.
- Menu list contains: **Default model** (labeled with parenthesized model ID), **Quick models** (configured in settings), **Active conversation pair** (if not in default or quick models), and **Manage models...** action which opens extension settings page.
- Selecting any model item triggers `setChatModel({ provider, model })`.
- Trigger and options are disabled when the chat is sending.

### 2. Composer Integration

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte) [MODIFY]
- Imported `ChatModelSelect` component.
- Mounted `<ChatModelSelect />` as the leftmost item in the action row below the chat input, resulting in: `[ChatModelSelect] [ChatReasoningSelect] [ChatContextDonut]`.

### 3. Locales & i18n

#### Locale files [MODIFY]
Added translation keys for `chat.model_select.aria_label`, `chat.model_select.default_label`, `chat.model_select.manage_models`, and `chat.model_select.warning_unresolvable` to:
- [en.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/en.json)
- [de.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/de.json)
- [es.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/es.json)
- [fr.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/fr.json)
- [ja.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ja.json)
- [ko.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ko.json)
- [vi.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/vi.json)
- [zh-CN.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/zh-CN.json)

### 4. Tests

#### [ChatModelSelect.test.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/composer/ChatModelSelect.test.svelte.js) [NEW]
- Added unit tests verifying:
  - Trigger rendering with correct icon and truncated model name.
  - Correct disabled behavior during sending.
  - Trigger warning class application for unconfigured providers.

## Verification Results

### 1. Model-specific tests

```sh
npx vitest run tests/chat/composer/ChatModelSelect.test.svelte.js
```

```
 ✓ tests/chat/composer/ChatModelSelect.test.svelte.js (3 tests) 50ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  3.43s
```

### 2. Full test suite

```sh
npx vitest run
```

```
 Test Files  44 passed (44)
      Tests  443 passed (443)
   Duration  8.00s
```

### 3. Type check

```sh
npm run check
```

```
svelte-check found 0 errors and 17 warnings in 9 files
```

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Trigger renders provider iconifyIcon and truncated model name.
- [x] Trigger is disabled when `disabled` or `chatState.isSending` is true.
- [x] Trigger shows warning triangle when provider is unconfigured or profile is deleted.
- [x] Default settings model item included in the list.
- [x] Quick models list populated correctly.
- [x] Dynamic profiles name resolved.
- [x] Mount leftmost in action row.
- [x] Full test suite and type check pass.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Load the extension in `.output/chrome` and verify the model selector dropdown in the side panel or content overlay.
- [ ] Open the dropdown and select different models; verify the checkmark tracks the active model.
- [ ] Click "Manage models..." and verify it opens settings at `settings.html?tab=chat`.
