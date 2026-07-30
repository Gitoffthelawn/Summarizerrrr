# Walkthrough — Phase 3: Grounding & citations

This walkthrough documents the implementation of Phase 3 of the Chat Message Graph roadmap. We added grounding references that track which sources actually reached the model during context assembly, persist them on the assistant record, and display them as a collapsible source drawer in the UI.

## Changes Made

### 1. Pipeline Layer

#### [index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/index.js)
- After `budgetContext`, builds `groundingRefs` from both `budget.conversationSources` and `budget.attachmentSources`:
  ```js
  [{ sourceId, contentKind }]  // contentKind is 'raw' | 'condensed'
  ```
- Stores **source IDs only** — `title`/`url` are resolved from the source store at render time to avoid stale metadata.
- Includes `groundingRefs` in the returned pipeline result.

---

### 2. Repository Layer

#### [conversationRepository.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/db/conversationRepository.js)
- Added `groundingRefs: messageData.groundingRefs || []` to `createMessageRecord` defaults, so every message record (user and assistant) has the field. Only assistant records will populate it.

---

### 3. Service Layer

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)
- All three `finalizeAssistantMessage` call paths in `runGeneration` (success, abort, error) now pass `groundingRefs: pipeline?.groundingRefs || []` so the source IDs are always persisted.

---

### 4. UI Layer

#### [NEW] [ChatSourceDrawer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatSourceDrawer.svelte)
- Collapsible panel that resolves source metadata from `conversationRepository.getSourcesByIds` on mount.
- Displays each source's title (clickable link if URL exists), source type icon (play circle for YouTube, academic cap for courses, document for webpages), and `contentKind` label.
- Props: `groundingRefs` (array), `open` (boolean).

#### [MODIFY] [ChatMessage.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatMessage.svelte)
- Added `sourcesOpen` state and `hasGroundingRefs` derived check.
- For assistant messages with grounding refs, renders a **"N sources"** clickable affordance (link icon + count + chevron) below the model/usage chip section.
- Clicking toggles `ChatSourceDrawer` visibility.
- Imported `ChatSourceDrawer` component.

---

### 5. Tests

#### [NEW] [messageGraphPhase3.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/messageGraphPhase3.test.js)
- **Pipeline**: `groundingRefs` built from budgeted sources match `includedSourceIds`; each ref has `sourceId` and `contentKind`.
- **Pipeline (empty)**: Returns `[]` when no sources are provided.
- **Repository**: `groundingRefs` persists on assistant message and round-trips through the store.
- **Repository (default)**: Defaults to `[]` when not provided.
- **Service**: `groundingRefs` from pipeline are passed through to the finalized assistant message.

---

## Verification Results

### 1. Automated Tests
```
 Test Files  14 passed (14)
      Tests  77 passed (77)
   Duration  702ms
```

### 2. Svelte Type Check
```
svelte-check found 0 errors and 21 warnings in 8 files
```
(All 21 warnings are pre-existing and unrelated to Phase 3 changes.)

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Pipeline builds `groundingRefs` from budgeted sources with correct `sourceId` and `contentKind`.
- [x] Pipeline returns empty `groundingRefs` when no sources are provided.
- [x] `groundingRefs` round-trips through `createMessageRecord` and persists on assistant.
- [x] Service passes `groundingRefs` from pipeline to all `finalizeAssistantMessage` paths.
- [x] All 77 tests pass, 0 errors in svelte-check.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Attach a tab source, send a message, confirm the response shows "N sources" affordance below the assistant message.
- [ ] Click the sources affordance to expand the drawer; verify it lists the correct source titles and URLs.
- [ ] Verify the drawer collapses when clicking the affordance again.
