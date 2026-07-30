# Walkthrough - Phase 3: Conversation and Source Persistence

Status date: 2026-07-10

Phase 3 of `chat-harness-implementation-plan.md` added durable, turn-based conversation persistence while leaving the existing summaries, history, tags, and backup stores intact. The database upgrades from version 9 to version 10 without converting or rewriting old summary/history record shapes.

## Changes Made

### 1. Version-10 IndexedDB schema

#### [indexedDBService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/db/indexedDBService.js)

- Bumped `DB_VERSION` from 9 to 10.
- Added `conversations`, `conversation_messages`, and `conversation_sources` stores with the required indexes, including unique `['conversationId', 'sequence']` and `sourceKey` indexes.
- Kept existing stores and migrations intact, and added shared open/close helpers so the repository uses one managed connection.

### 2. Conversation repository

#### [conversationRepository.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/db/conversationRepository.js)

- Added atomic conversation creation with an optional first user message, transaction-local sequence allocation, metadata updates, archiving, and soft deletion.
- Added deterministic message listing, finalized assistant persistence, source snapshot deduplication by `normalizedUrl + contentHash`, source lookup, and conservative unreferenced-source garbage collection.
- Added conversation bundle export/import with foreign-key validation, collision-safe ID remapping, and source-key reuse.
- Added complete chat backup export/restore that validates and writes all three chat stores together.

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)

- Added JSDoc contracts for conversation, message, and immutable source records.

### 3. Backup and rollback coverage

#### [dataIntegrityService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/dataIntegrityService.js)

- Added `backupSchemaVersion: 2` and chat conversations, messages, and sources to complete pre-import backups.
- Restored all three chat stores together during backup rollback and included them in complete-data clearing.
- Kept chat data out of existing cloud-sync behavior.

### 4. IndexedDB regression tests

#### [conversationRepository.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/conversationRepository.test.js)

- Added `fake-indexeddb` coverage for version-9 migration preservation, unique message sequences, source identity, deterministic message order, bundle round-tripping, shared-source safety, three-store restore, and complete backup schema coverage.

## Verification Results

### 1. Automated test suite

```sh
npm test
```

Output:

```text
Test Files  5 passed (5)
Tests  26 passed (26)
```

### 2. Type checks

```sh
npm run check
```

Output:

```text
svelte-check found 0 errors and 20 warnings in 7 files
```

The warnings are existing Svelte accessibility, deprecated event-directive, unused-selector, and reactive-state warnings outside this phase.

### 3. Production builds

```sh
npm run build
npm run build:firefox
```

Output:

```text
✔ Finished in 11.8 s
✔ Finished in 11.9 s
```

Both production builds completed successfully, retaining existing Svelte and Rollup chunk-size warnings.

### 4. JavaScript syntax and diff validation

```sh
git diff --check
node --check src/lib/db/indexedDBService.js
node --check src/lib/db/conversationRepository.js
node --check src/services/dataIntegrityService.js
```

Output:

```text
All commands completed successfully with no output.
```

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] A version-9 fixture upgrades to version 10 with legacy summary, history, and tag records preserved.
- [x] Conversation message sequences are deterministic and protected by a unique compound index.
- [x] Source snapshot identity distinguishes identical content from different normalized URLs.
- [x] Conversation bundles retain skill instruction snapshots and attachment references through ID remapping.
- [x] Shared source snapshots survive deletion of another conversation and three chat stores backup/restore together.

### Still-Required Manual Verification (To Be Done by User)

- [ ] In Chrome, load an existing development profile with old summaries/history, reload the extension, and inspect IndexedDB to confirm the three new chat stores appear while old records remain.
- [ ] Repeat the upgrade inspection in Firefox with an existing development profile.

## Known Follow-ups

- Phase 4 will use `conversationRepository` for send, stream, abort, retry, and reopen orchestration.
- Phase 7 will expose the bundle import/export and backup data through the conversation archive UI.
