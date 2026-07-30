# Walkthrough - Phase 1: `background.js` seams (a) + (b) + (c)

Implemented the first phase of the [God Files plan](../03-god-files.md): unit 1's seams **(a) message router → handler map**, **(b) Ollama module**, and **(c) external-chat handoff module**. `src/entrypoints/background.js` (2080 lines) became the WXT directory entrypoint `src/entrypoints/background/` — `index.js` is 1024 lines, and the ~540-line `onMessage` `if`-chain is now a dispatch table over seven domain modules.

Scope was confirmed with the user before starting: the plan document is a **survey** with four numbered units, not explicit phases, and none of it had been executed (all four files were still at their surveyed sizes). Seams (d)–(g) of unit 1 are untouched and still pending.

## Changes Made

### 1. `background.js` → directory entrypoint

#### [src/entrypoints/background.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background.js) — deleted
- WXT accepts `background.js` **or** `background/index.js`; the second form was required because a sibling `background/` folder next to `background.js` would have been a duplicate entrypoint name. The emitted bundle path is unchanged (`background.js` in both manifests), so nothing downstream moved.
- `injectScript` / `executeFunction` moved verbatim into `index.js` and stay exported. The plan describes them as "exported, used elsewhere" — that is **stale**: `grep -rn "entrypoints/background\|injectScript\|executeFunction" src tests` outside the file itself returns nothing.

#### [src/entrypoints/background/index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/index.js) — 1024 lines
- Keeps only what has to run at worker start-up: the sync→local storage migration, Firefox-mobile popup + dynamic content-script registration, Chrome action behaviour and its 6-attempt backoff, the cloud-sync alarm block, context-menu lifecycle, the side-panel port, keyboard commands, and the tab listeners.
- Relative specifiers (`../stores/…`) became `@/`-alias form, since every file is now one level deeper.
- The `onMessage` chain is replaced by a single `createMessageRouter([...])` call, registered at exactly the same point in module execution as the old listener so listener-registration order relative to `onConnect` / `onCommand` is unchanged.

### 2. Seam (a) — the message router

#### [src/entrypoints/background/messageRouter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/messageRouter.js)
- `createMessageRouter(handlerGroups)` merges one object per domain module into a `Map` and returns the `onMessage` listener.
- Two properties of the old chain are preserved deliberately and documented in the file:
  - **A handler's return value passes straight through.** `true` keeps the message channel open for an async `sendResponse`; `undefined` closes it immediately. This is *not* normalised — `OPEN_ARCHIVE` and the other five fire-and-forget messages never call `sendResponse`, so returning `true` for them would leave every sender's promise pending forever.
  - **`message.type` is looked up before `message.action`, with fall-through on a miss.** A `REQUEST_SUMMARY` message carries `type: 'selectedText'` — the *summary* kind, not a routing key — so a `type` that matches no handler must fall through to `action`. Implemented with `||` rather than `??` so an empty-string `type` also falls through.
- A `Map` rather than a plain object, so a message with `type: 'constructor'` can't resolve `Object.prototype.constructor` and get invoked as a handler.
- Duplicate keys across modules `throw` at wiring time instead of last-one-wins.

#### [src/entrypoints/background/handlers/](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/handlers/) — 7 modules, 25 message types
Split by the domains the plan names. Each exports a `create*Handlers(deps)` factory; handler bodies were moved verbatim.

| Module | Message types |
|---|---|
| `syncHandlers.js` | `SETUP_AUTO_SYNC_ALARM`, `CLEAR_AUTO_SYNC_ALARM`, `TRIGGER_SYNC` |
| `summarizeHandlers.js` | `QUICK_SUMMARY_OPEN_TAB`, `fetchYouTubeComments`, `getTranscript`, `REQUEST_SUMMARY` |
| `permissionHandlers.js` | `PERMISSION_CHANGED`, `CHECK_FIREFOX_PERMISSION` |
| `ollamaHandlers.js` | `OLLAMA_API_REQUEST`, `UPDATE_OLLAMA_ENDPOINT` |
| `storageHandlers.js` | `SAVE_TO_HISTORY`, `SAVE_TO_ARCHIVE` |
| `externalChatHandlers.js` | `SUMMARIZE_ON_GEMINI`, `…_GEMINI_WITH_URL`, `…_CHATGPT`, `…_PERPLEXITY`, `…_GROK`, `OPEN_DEEP_DIVE_CHAT` |
| `navigationHandlers.js` | `RESUME_CONVERSATION`, `OPEN_ARCHIVE`, `OPEN_SETTINGS`, `OPEN_URL`, `courseContentFetched`, `requestCurrentTabInfo` |

Two details worth naming:
- **Mutable worker state crosses the boundary as a getter, never a captured value.** `sidePanelPort` is reassigned on every side-panel connect/disconnect, so `permissionHandlers` and `navigationHandlers` receive `getSidePanelPort: () => sidePanelPort`. Same for the write side: `setPendingConversationResume`.
- **`getTranscript` keeps its second condition.** The old branch was `if (message.action === 'getTranscript' && message.tabId)`, so a `getTranscript` with no `tabId` fell through to *no* handler at all. The handler now re-checks and returns `undefined`, preserving that.

### 3. Seam (b) — Ollama module

#### [src/entrypoints/background/ollamaService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/ollamaService.js)
- `OllamaCorsService` (the `declarativeNetRequest` dynamic-rule pair) and `OllamaApiProxyService` (which actually runs `generateText` in the worker) moved verbatim and are now `export class`.
- `index.js` still owns the instances, because the start-up IIFE that calls `setupOllamaCorsRules` for an `ollama`-provider user is not a message handler. The instances are passed into `createOllamaHandlers({ ollamaApiProxy, ollamaCorsService })`.

### 4. Seam (c) — external-chat handoff module

#### [src/entrypoints/background/externalChat.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/externalChat.js) — 309 lines
- `waitForChatTabReady` and `sendChatMessageWithRetry` (the Cloudflare/SPA readiness polling and send retries) joined `getProviderMessageType`, `validateService`, `createAITab`, `buildPrompt`, `sendContentToTab`, `handleAISummarization`, and `handleGeminiWithYouTubeURL` — all of which the plan lists under seams (c) and #13, and all of which only exist to serve the five `SUMMARIZE_ON_*` messages plus Deep Dive.
- `validateService` / `createAITab` / `buildPrompt` / `sendContentToTab` are module-private now (they were closure-private before); only the four entry points are exported.

### 5. Supporting extractions (required by the split, not extra scope)

#### [src/entrypoints/background/settingsBootstrap.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/settingsBootstrap.js)
- `isStorageReady`, `loadSettingsDirectly`, `initializeDefaultSettings`, `loadSettingsWithReadiness` moved verbatim so `externalChat.js` can *import* the loader instead of receiving it as an injected dependency.
- **This is a relocation only.** Seam (f) — the actual latent bug, two independent code paths loading and defaulting the same settings — is untouched, and the module's header comment says so explicitly.

#### [src/entrypoints/background/tabInfo.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/entrypoints/background/tabInfo.js)
- `describeTab(tab, action)` — the YouTube/Udemy/Coursera classification the worker sends to the side panel.
- Three call sites each had their own copy of the same three regexes and built a byte-identical object: `requestCurrentTabInfo` (moved to `navigationHandlers.js`), the `summarize-current-page` command, and `handleTabChange`. Moving the router out would have carried one copy across a module boundary and stranded the other two, so they now share one function. Without this the split would have *increased* duplication.

### 6. Architecture guard updated for the directory entrypoint

#### [tests/architecture/layering.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/architecture/layering.test.js)
- `enumerateEntrypointRoots()` hardcoded `entrypoints/background.js`. Left alone it would have silently dropped the background root and **weakened Rule 6** rather than failing — the guard would still be green while covering one fewer surface. It now resolves `background/index.js` or `background.js`, whichever exists.
- `canonicalSurface()`'s `if (top === 'background.js')` special case is dead for a directory entrypoint (the first path segment is already `background`) and was removed, with the reason recorded in the doc comment.

#### [tests/background/messageRouter.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/background/messageRouter.test.js) — new, 9 tests
Pins the two properties that were easy to lose in the rewrite and that no other test would catch: return-value pass-through (`true` vs `undefined`) and `type`-before-`action` precedence with fall-through. Also covers group merging, the duplicate-key throw, unknown messages, and the `Object.prototype` key hazard.

### 7. Docs

#### [CLAUDE.md](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/CLAUDE.md)
- The "Entrypoints" entry for `background.js` was replaced with a `background/` entry describing `index.js` and each sibling, including the router's `return true` contract and the note that `settingsBootstrap.js` is still a duplicate.
- Two stale `background.js` path references updated ("Special handling for mobile in…", "Add listener in…"); the "Adding New Shortcuts" step now also says where the message handler goes.
- Test-file count 50 → 51.

## Verification Results

### 1. No message type was dropped or reclassified

Compared the routed key set in the deleted file (lines 1009–1547 at `HEAD`) against the keys registered by the new handler modules:

```
old: 25  new: 25
--- diff (old vs new) ---
IDENTICAL
```

The 25 keys: `CHECK_FIREFOX_PERMISSION CLEAR_AUTO_SYNC_ALARM OLLAMA_API_REQUEST OPEN_ARCHIVE OPEN_DEEP_DIVE_CHAT OPEN_SETTINGS OPEN_URL PERMISSION_CHANGED QUICK_SUMMARY_OPEN_TAB REQUEST_SUMMARY RESUME_CONVERSATION SAVE_TO_ARCHIVE SAVE_TO_HISTORY SETUP_AUTO_SYNC_ALARM SUMMARIZE_ON_CHATGPT SUMMARIZE_ON_GEMINI SUMMARIZE_ON_GEMINI_WITH_URL SUMMARIZE_ON_GROK SUMMARIZE_ON_PERPLEXITY TRIGGER_SYNC UPDATE_OLLAMA_ENDPOINT courseContentFetched fetchYouTubeComments getTranscript requestCurrentTabInfo`

Async/sync classification also matches exactly: the old chain had **19** real `return true` statements (a 20th `grep` hit is the `// Async handlers that need \`return true\`` comment), and the new modules have **19**, with these 6 correctly left as fire-and-forget:

```
   OPEN_ARCHIVE (navigationHandlers.js)
   OPEN_SETTINGS (navigationHandlers.js)
   OPEN_URL (navigationHandlers.js)
   courseContentFetched (navigationHandlers.js)
   requestCurrentTabInfo (navigationHandlers.js)
   UPDATE_OLLAMA_ENDPOINT (ollamaHandlers.js)
```

19 + 6 = 25. ✅

### 2. Automated tests

Ran `npm test`:

```
 Test Files  51 passed (51)
      Tests  505 passed (505)
```

Was 50 files / 496 tests before this phase — the delta is exactly the new `messageRouter.test.js` (+1 file, +9 tests). The architecture guard (`tests/architecture/layering.test.js`) passes with the updated entrypoint-root resolution.

### 3. Type checks

Ran `npm run check` (`svelte-check`):

```
COMPLETED 1634 FILES 0 ERRORS 14 WARNINGS 8 FILES_WITH_PROBLEMS
```

All 14 warnings are pre-existing a11y/unused-CSS warnings in `settings/` and `sidepanel/` components — none in `entrypoints/background/`.

### 4. Builds

- `npm run build` → `✔ Finished in 14.8 s`. `.output/chrome-mv3/background.js` emitted at **1.25 MB**; manifest still `{"service_worker":"background.js"}`.
- `npm run build:firefox` → `✔ Finished in 14.7 s`. Manifest still `{"scripts":["background.js"]}`, and the Firefox-only branches (`CHECK_FIREFOX_PERMISSION`, `dynamic-content-script`) are present in that bundle.
- Grepped the built Chrome bundle for a sample of handler keys across all seven modules (`TRIGGER_SYNC`, `CHECK_FIREFOX_PERMISSION`, `OLLAMA_API_REQUEST`, `SAVE_TO_ARCHIVE`, `SUMMARIZE_ON_PERPLEXITY`, `requestCurrentTabInfo`) — all survive bundling, as does the duplicate-key guard string.
- The one rollup warning (`settingsStore.svelte.js is dynamically imported by settingsPort.js but also statically imported by…`) is pre-existing and unrelated — it names only `lib/config/settingsPort.js` and component files, none of which this phase touched.

### 5. Line-count effect

| | Lines |
|---|---|
| `background.js` before | 2080 |
| `background/index.js` after | 1024 |
| 12 new sibling modules | 1318 (incl. new doc comments) |

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] All 25 routed message types preserved — set-diff against `HEAD`'s version is `IDENTICAL`.
- [x] Async vs fire-and-forget classification preserved for all 25 (19 `return true`, 6 `undefined`), matching the old chain's counts.
- [x] `type`-before-`action` precedence with fall-through preserved (the `REQUEST_SUMMARY` / `type: 'selectedText'` case), covered by a test.
- [x] `getTranscript`'s `&& message.tabId` guard preserved.
- [x] `npm test` — 51 files / 505 tests pass, including the architecture guard.
- [x] `npm run check` — 0 errors; no new warnings.
- [x] `npm run build` and `npm run build:firefox` both succeed; both manifests still point at `background.js` and the bundle contains handlers from every module.
- [x] Nothing outside the old file imported `injectScript` / `executeFunction` / `entrypoints/background` (verified by grep before deleting).
- [x] `.wxt/types/paths.d.ts` churn from alternating build targets reverted, so the diff contains no unrelated generated-file noise.

### Still-Required Manual Verification (To Be Done by User)

The service worker cannot be exercised headlessly — every check above is static or build-time. Load the unpacked build and confirm the message paths actually round-trip:

1. `npm run dev`, then load `.output/chrome-mv3` as an unpacked extension.
2. **Summarize + persist** — summarize a normal page and a YouTube video from the side panel. Confirms `getTranscript`, `SAVE_TO_HISTORY`, `SAVE_TO_ARCHIVE`, and that history/archive entries appear.
3. **Fire-and-forget messages** — from the side panel/FAB, open Settings, open Archive, and click an external link. If any of these hangs or logs an unresolved-promise error, the `return true`/`undefined` contract regressed.
4. **Context menu** — select ≥20 characters and choose "Summarize selected text" both with the FAB enabled and with it disabled (the second path uses `cachedFabEnabled` and must open the side panel inside the user-gesture window). Also right-click a YouTube link and a non-YouTube link → "Summarize in new tab".
5. **External chat handoff** — Deep Dive to each of Gemini, ChatGPT, Perplexity, Grok; then a YouTube video with no transcript available, which takes the `SUMMARIZE_ON_GEMINI_WITH_URL` path. These exercise seam (c)'s readiness polling and retries.
6. **Ollama** — set the provider to Ollama, change the endpoint in Settings (`UPDATE_OLLAMA_ENDPOINT`), and run a summary (`OLLAMA_API_REQUEST` proxy).
7. **Cloud sync** — sign in, toggle auto-sync off and on (`SETUP_AUTO_SYNC_ALARM` / `CLEAR_AUTO_SYNC_ALARM`), and change a setting to trigger the 10-second debounced `TRIGGER_SYNC`.
8. **Tab tracking + shortcuts** — switch tabs and confirm the side panel's title/type updates (`tabUpdated` via `describeTab`), then press the summarize-current-page shortcut (same helper, different action).
9. **Firefox** — `npm run dev:firefox` and repeat steps 2–4, plus grant/revoke the `<all_urls>` optional permission to exercise `CHECK_FIREFOX_PERMISSION` and `PERMISSION_CHANGED`.
10. **Resume conversation** — from the Archive page, resume a saved conversation with the side panel both open and closed (the closed case goes through the `pendingConversationResume` buffer).

## Known Follow-ups

Still open in unit 1 of [`03-god-files.md`](../03-god-files.md), deliberately not started here:

- **(d)** Background sync scheduler — the alarm/cleanup/`initSync` block is still inline in `index.js` (it is start-up wiring, not message handling).
- **(e)** Context-menu module — create + `onShown` + `onClicked` still inline; the `onClicked` handler is ~185 lines on its own.
- **(f)** Settings bootstrap dedup — `settingsBootstrap.js` was relocated but **not** reconciled with `settingsStore`. This is the plan's flagged latent bug, not just duplicated code.
- **(g)** Separating the Chrome- and Firefox-specific setup blocks.

Units 2–4 (`indexedDBService.js`, `settingsStore.svelte.js`, `summaryStore.svelte.js`) are untouched.
