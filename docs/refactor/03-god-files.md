# God Files — splitting seams

> **Status:** recorded for later. Not yet executed.
> Splitting a god file is a **behavioral refactor** (real risk), unlike moving a file (near-zero risk).
> Don't fold this into the structural cleanup — when the build breaks you won't know which change caused it.

Survey date: 2026-07-27, branch `v3.0-NewSettingUI-2` (commit `ad75f1c`). Line numbers are from that commit.

Unlike [`02-full-reorg-direction.md`](./02-full-reorg-direction.md), this work has **no dependency on** [`01-cleanup-and-rule.md`](./01-cleanup-and-rule.md) — it can be slotted in at any point.

Suggested order: **`background.js` → `indexedDBService.js` → `settingsStore.js` → `summaryStore.js`**. The first two split almost mechanically; the last two are redesigns.

---

## 1. `src/entrypoints/background.js` — 2080 lines

**The highest-value split available.** Everything lives inside a single `defineBackground()`, mixing 13 unrelated responsibilities.

| # | Responsibility | Lines |
|---|---|---|
| 1 | Settings bootstrap with retry (`isStorageReady`, `loadSettingsDirectly`, `initializeDefaultSettings`, `loadSettingsWithReadiness`) — **a private reimplementation of settings loading that bypasses `settingsStore`** | L26–148 |
| 2 | Script injection helpers (`injectScript`, `executeFunction`) — exported, used elsewhere | L149–172 |
| 3 | Ollama CORS rule management (`OllamaCorsService`, `declarativeNetRequest` dynamic rules) | L175–244 |
| 4 | Ollama API proxying (`OllamaApiProxyService` — actually runs `generateText` in the background) | L249–285 |
| 5 | External chat-site automation (`waitForChatTabReady`, `sendChatMessageWithRetry` — Cloudflare/SPA readiness polling) | L287–364 |
| 6 | Storage sync→local migration | L368–393 |
| 7 | Platform branching: Firefox mobile popup vs sidebar; Chrome `action` with 6-attempt exponential backoff; `cachedFabEnabled` mirrored from `chrome.storage.onChanged` so the context-menu handler can read it synchronously inside the user-gesture window | L423+, L940–1005 |
| 8 | Cloud-sync scheduling (`onInstalled`/`onStartup` alarms, `setupAutoSyncAlarm`, `runSoftDeleteCleanup`, `alarms.onAlarm`, `initSync`) | L771–880 |
| 9 | Context-menu lifecycle (create/refresh/onShown/onHidden/onClicked, quick-summary-in-new-tab, FAB selected-text) | L861–940, L1626–1850 |
| 10 | **The message router — one `onMessage` listener, ~540 lines of sequential `if`** | L1009–1549 |
| 11 | Port connection to the sidepanel + `pendingSelectedText` / `pendingConversationResume` handoff buffers | L1550–1586 |
| 12 | Keyboard commands | L1587–1625 |
| 13 | Tab lifecycle (`onActivated`, `onUpdated`, `onRemoved`) | L1851–1880 |

### Seams

- **(a) Message router → handler map.** The 540-line `if (message.type === ...)` chain, split by domain: sync / summarize / permissions / ollama / external-chat / storage. **Start here** — it's purely mechanical and each handler can be verified independently. It covers sync alarms, quick summary, YouTube comments, permissions, the Ollama proxy, `SAVE_TO_HISTORY`/`SAVE_TO_ARCHIVE`, transcript fetch, 5 external-chat handoffs, deep-dive chat, conversation resume, and window/tab opening.
- **(b) Ollama module** — `OllamaCorsService` + `OllamaApiProxyService` + the `OLLAMA_API_REQUEST` case.
- **(c) External-chat handoff module** — `waitForChatTabReady` + `sendChatMessageWithRetry` + the 5 `SUMMARIZE_ON_*` cases.
- **(d) Background sync scheduler** — the alarm/cleanup/initSync block.
- **(e) Context-menu module** — create + onShown + onClicked.
- **(f) Settings bootstrap (#1)** — should be **shared with `settingsStore`** rather than reimplemented. This is a latent bug, not just duplicated code: two independent code paths load and default the same settings.
- **(g)** Separate the Chrome- and Firefox-specific setup blocks.

---

## 2. `src/lib/db/indexedDBService.js` — 1317 lines

`openDatabase()` **alone occupies L16–292** — roughly 275 lines of `onupgradeneeded` covering all 11 schema versions and 6 object stores. Everything after it is **five unrelated repositories in one module**.

| Region | Lines |
|---|---|
| Connection + schema migration (11 versions) | L16–292 |
| Summaries | L304–444 |
| History (including cross-store moves `moveHistoryItemToArchive`, `removeFromArchiveByHistoryId`) | L445–721 |
| Tags | L722–864 |
| Tag↔summary association + tag statistics | L865–938 |
| Bulk insert + counts | L939–984 |
| Clear all | L985–1039 |
| Soft-delete cleanup (30-day threshold) | L1040–1141 |
| Cloud-sync soft-delete writers | L1142–1244 |
| Whole-store replacement helpers (for sync) | L1245–1317 |

### Seams

Extracting `openDatabase()` into its own connection/migration module is **the clearest single split across all four god files**. After that: one repository per object store, and a sync-support module gathering soft-delete + `replace*Store` + cleanup.

**Note:** `conversationRepository.js` (1136 lines) was already extracted, **but it still imports `getDatabase` and the store-name constants from here** — so the split is only half-done. Finish it following that same pattern.

---

## 3. `src/stores/settingsStore.svelte.js` — 1274 lines

| Region | Lines |
|---|---|
| The `DEFAULT_SETTINGS` literal | L17–175 (160 lines) |
| **6 migration functions** (deprecated Gemini models, Gemini Pro models, DeepSeek models, tone, deep-dive model, feature-model settings) + `normalizeStoredSettings` (122 lines) + `normalizeFabWhitelist` | L188–416 |
| Load / save / subscribe (`loadSettings` alone is ~195 lines) | L588–944 |
| Firefox permission cache (own cache + `clearPermissionCache`) | L945–1018 |
| Tool settings helpers | L1019–1091 |
| Added-provider management | L1092–1143 |
| OpenAI-compatible profile CRUD | L1144–1274 |

### Seams

Extract the **migration block (L188–416)** first — it's the clearest candidate, and it should land next to `lib/config/settingsSchema.js`, which **already holds exactly this category of code** (`sanitizeSettings`, `migrateLegacyGeminiAdvanced`). Right now the same kind of logic is split across two trees.

Then, in order: the defaults table / core persist+subscribe / Firefox permissions / tool settings / provider & profile management.

---

## 4. `src/stores/summaryStore.svelte.js` — 1602 lines

**Hardest, save for last** — not because of size, but because it's a redesign rather than a relocation.

Mixes:

- **State container + lifecycle** — `summaryState`, `globalStoreUpdate`, `resetState`, `resetDisplayState`, `stopStreaming`, `updateVideoActiveStates` (L43–220)
- **Content acquisition** — calls `getPageContent`, fetches YouTube comments, checks Firefox permissions, all inside `fetchAndSummarize` (L221–490)
- **Five near-duplicate summarize orchestrators** — `fetchAndSummarize` (270 lines), `fetchAndSummarizeStream` (274), `fetchChapterSummary` (128), `fetchCourseConcepts` (121), `fetchCommentSummary` (L1352+); plus `summarizeSelectedText` and `executeCustomAction` (138)
- **Persistence** — `saveAllGeneratedSummariesToArchive` (89) and `logSingleSummaryToHistory` (61) write IndexedDB directly, then dynamically `import('cloudSync')` to `triggerSync` at L1133 and L1182
- **Tab-state coupling** — `getOrCreateTabState` / `setCurrentTabId` from `tabCacheService`
- **UI tab selection** — `updateActiveYouTubeTab` / `updateActiveCourseTab`

### Seams

The valuable one: **collapse the 5–7 summarize variants into a single parameterized pipeline**. They differ in prompt, result field, and whether they stream — not in structure.

Remaining seams: state+reset / archive+history persistence (including the sync trigger) / active-tab selection / content acquisition.

> **Warning:** don't touch this file without also reading `entrypoints/content/composables/useSummarization.svelte.js` (913 lines) — it is the **in-page parallel implementation** of this same logic. Refactoring one side while ignoring the other will push the two copies further apart. See [`02-full-reorg-direction.md`](./02-full-reorg-direction.md) §7.

---

## See also

- [`01-cleanup-and-rule.md`](./01-cleanup-and-rule.md) — structural cleanup + layering rule
- [`02-full-reorg-direction.md`](./02-full-reorg-direction.md) — surface-first component reorg
