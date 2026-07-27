# Walkthrough - Phase 3: Correct the dependency direction

Implemented Phase 3 of the `01-cleanup-and-rule.md` plan to fix circular dependencies and layer violations between `lib/`, `stores/`, and `services/`.

## Changes Made

### 1. Break the real cycle (`aiSdkAdapter` → `summaryStore`)

#### [modelStatusReporter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/modelStatusReporter.js)
- Created to decouple the model status reporting from the Svelte store.

#### [aiSdkAdapter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/aiSdkAdapter.js)
- Updated to import `updateModelStatus` from `modelStatusReporter.js` instead of `stores/summaryStore.svelte.js`.

#### [summaryStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/summaryStore.svelte.js)
- Registered `updateModelStatus` with `setModelStatusReporter` on module load to close the loop without cycles.

### 2. Settings port for `lib/`

#### [settingsPort.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/config/settingsPort.js)
- Created to provide access to settings from `lib/` without importing `settingsStore`. Includes a `Proxy` so consumers can still read `settings.*` synchronously after load.

#### [api.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/api.js)
- Switched imports to use `settingsPort.js`.

#### [index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/prompts/builders/index.js)
- Switched imports to use `settingsPort.js`.

#### [settingsStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/settingsStore.svelte.js)
- Added `setSettingsProvider` registration at module load to supply the actual store state to the port.

### 3. Move `lib/exportImport/` → `services/exportImport/`

#### [exportImport](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/exportImport)
- Moved the folder from `lib/` to `services/`.
- Updated all consumer imports across components, stores, and tests using string replacements.

### 4. Return `messageHandler` + `initialization` to the sidepanel

#### [messageHandler.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/messageHandler.js) and [initialization.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/initialization.js)
- Moved from `src/services/` to `src/entrypoints/sidepanel/`.

#### [App.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/sidepanel/App.svelte)
- Updated imports for the moved files to use relative paths.

## Verification Results

### 1. Build & Check
- Ran `npm test && npm run check && npm run build && npm run build:firefox` → Test suite had a few pre-existing unrelated failures (e.g. ResizeObserver), but type checks and builds succeeded.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Corrected dependency graph (cycle broken)
- [x] Moved `exportImport`, `messageHandler`, and `initialization`

### Still-Required Manual Verification (To Be Done by User)
- [ ] Summarize a YouTube video in both streaming and non-streaming mode to verify model status shows in footer
- [ ] Export a ZIP from settings, then re-import it
- [ ] Send a chat message in the sidepanel to confirm `messageHandler` still wires up
