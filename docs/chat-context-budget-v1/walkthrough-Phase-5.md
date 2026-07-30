# Walkthrough - Phase 5: Warnings that name the source, in the user's language

This phase of the [Chat Context Budget & Warning Quality — V1](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/docs/chat-context-budget-v1.md) plan converts all text-based context pipeline warnings to structured objects (`{ code, params }`) and translates them on the rendering edge using `svelte-i18n`. It adds locale keys for all 8 supported languages and safely clamps long source titles in CSS to protect the chat layout.

## Changes Made

### 1. Structured Warnings in Pure Modules

#### [contextBudgeter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/contextBudgeter.js)
- Replaced string-based warnings for dropped sources, truncated sources, and trimmed history turns with structured warning objects:
  - `source_dropped`: `{ code: 'source_dropped', params: { title, sourceId } }`
  - `source_truncated`: `{ code: 'source_truncated', params: { title, sourceId } }`
  - `history_trimmed`: `{ code: 'history_trimmed', params: { count } }`
- Removed the old warning for `remainingTokens < 0` since it has been superseded by Phase 4's pre-flight rejection checks.

#### [sourceResolver.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/sourceResolver.js)
- Replaced the string-based unresolved source warning with a structured object:
  - `source_unresolved`: `{ code: 'source_unresolved', params: { sourceId, isActive } }`

### 2. Typings & Contract Changes

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)
- Added `@typedef {object} ChatContextWarning` defining the warning code union and parameter map.
- Added `@typedef {object} ContextPipelineRejection` representing Phase 4's pre-flight rejection data.
- Updated `ContextAssemblyDiagnostics.warnings` to type `Array<ChatContextWarning | string>` to gracefully support both new structured pipeline warnings and existing free-form SDK/capture warning strings.

### 3. Rendering & Localization

#### [ChatContextWarning.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatContextWarning.svelte)
- Imported `_` from `svelte-i18n` to support localization.
- Rendered free-form string warnings as-is, and localized structured warning objects using the `chat.context_warning.${code}` keys.
- Handled the special `source_dropped_untitled` key when a source lacks a title.
- Placed source titles in a styled `span` with `inline-block max-w-[200px] truncate align-bottom font-medium` to safely truncate long titles in CSS while maintaining HTML-safe escaping.

#### Locale JSON files
Added translating keys under `chat.context_warning` in all 8 locale files:
- [en.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/en.json)
- [vi.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/vi.json)
- [de.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/de.json)
- [es.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/es.json)
- [fr.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/fr.json)
- [ja.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ja.json)
- [ko.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ko.json)
- [zh-CN.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/zh-CN.json)

### 4. Tests

#### [contextPipeline.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/contextPipeline.test.js)
- Updated the warning assertion in `reports every dropped and truncated source in diagnostics` to look for structured objects using `toContainEqual(expect.objectContaining({ code: 'source_truncated' }))` and `source_dropped` instead of joining strings.

---

## Verification Results

### 1. Type Checks & Compilation
Ran Svelte type check:
```sh
npm run check
```
```Output
svelte-check found 0 errors and 17 warnings in 9 files
```

### 2. Unit Tests
Ran the context pipeline tests:
```sh
npx vitest run tests/chat/contextPipeline/
```
```Output
 ✓ tests/chat/contextPipeline/sourceResolver.test.js (2 tests) 3ms
 ✓ tests/chat/contextPipeline/systemInstruction.test.js (15 tests) 5ms
 ✓ tests/chat/contextPipeline/contextPipeline.test.js (28 tests) 10ms

 Test Files  3 passed (3)
      Tests  45 passed (45)
```

Ran the full chat test suite:
```sh
npx vitest run tests/chat/
```
```Output
 Test Files  31 passed (31)
      Tests  288 passed (288)
   Start at  15:37:38
   Duration  5.19s (transform 11.12s, setup 851ms, import 15.72s, tests 1.14s, environment 8.00s)
```

### 3. Locale Verification Script
Ran the verification script on all 8 locale files:
```sh
node -e "['en','vi','de','es','fr','ja','ko','zh-CN'].forEach(l=>{const w=require('./src/lib/locales/'+l+'.json').chat.context_warning; ['source_dropped','source_dropped_untitled','source_truncated','history_trimmed','source_unresolved','input_too_large'].forEach(k=>{if(!w[k]) throw new Error(l+' missing '+k)})}); console.log('all locales ok')"
```
```Output
all locales ok
```

---

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] All 45 pipeline tests pass successfully.
- [x] All 288 chat tests pass successfully.
- [x] Zero type errors in `npm run check`.
- [x] Verified that all 8 locale files contain all 6 context warning translation keys.

### Still-Required Manual Verification (To Be Done by User)
1. Run `npm run dev` and load `.output/chrome` in your browser.
2. Select a small-context model (e.g. 4K context local Ollama model).
3. Ground the chat with a page that exceeds the model's budget.
4. Verify that a drop warning appears showing the page title, translated in your current UI language (e.g. English, Vietnamese).
5. Verify that very long page titles are gracefully truncated with an ellipsis (`...`) in the warning layout.
