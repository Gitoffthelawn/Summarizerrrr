# Walkthrough - Phase 6A: Core Skills, Global Persona, and Custom-Prompt Migration

Status date: 2026-07-10

Phase 6A of `chat-harness-implementation-plan.md` added versioned, one-shot chat skills, a persisted global persona snapshot, and an idempotent migration of legacy custom prompt pairs. The side-panel composer now exposes skills through a picker and leading slash commands while leaving the legacy prompt settings untouched for the Phase 6B editor migration.

## Changes Made

### 1. Versioned skill model and migration

#### [builtInSkills.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/builtInSkills.js)

- Added code-owned, versioned built-in skills for Summarize, Analyze, Explain, Debate, Translate, Comment Analysis, Chapter Summary, and Course Concepts.
- Reused the existing tuned prompt assets and system instructions, adapting `__CONTENT__` to the grounded chat source rather than duplicating prompt text.

#### [skillService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/skillService.js)

- Added skill discovery, stable invocation snapshots, leading `/command` parsing, user-skill persistence helpers, and global-persona snapshot creation.
- Recognizes a command only as the first composer token and preserves unknown slash commands as ordinary text.

#### [skillMigration.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/skillMigration.js)

- Added migration version `1` for enabled or genuinely customized legacy per-content prompt pairs.
- Creates deterministic `migrated-*` user skill IDs, retains the original system instruction/template, avoids duplicate creation, and never deletes or overwrites legacy settings.

### 2. Persisted settings and conversation precedence

#### [settingsStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/settingsStore.svelte.js)

- Added `chatGlobalPersona`, `chatUserSkills`, and `chatSkillMigrationVersion` defaults.
- Runs the idempotent prompt-to-skill migration during settings initialization before saving the cleaned settings.

#### [settingsSchema.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/config/settingsSchema.js)

- Whitelisted the Phase 6A chat settings so they persist through settings sanitization and existing backup flows.

#### [chatService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/services/chat/chatService.js)

- Snapshots the global persona when a conversation is created, including language, tone, and version.
- Keeps persona in the system channel, ahead of the one-shot skill block in the user turn, preserving the locked precedence rule.

#### [contracts.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contracts.js)

- Documented the shared `ChatSkill` JSDoc contract.

### 3. Composer selection UI

#### [SkillPicker.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/SkillPicker.svelte)

- Added a keyboard-focusable composer picker listing enabled skills with their command and description.

#### [ChatComposer.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/chat/ChatComposer.svelte)

- Integrates the skill picker, seeds a clicked skill's starter prompt only when the composer is empty, and turns a recognized leading slash command into a selected skill while removing its token from the visible request.

#### [chatStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/chatStore.svelte.js)

- Added centralized selection/command-consumption helpers that create the persisted instruction snapshot used by `chatService`.

### 4. Focused regression coverage

#### [skills.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/skills.test.js)

- Covers built-in parity for the existing action buttons, slash-command behavior, immutable old-turn instruction snapshots, idempotent prompt migration, legacy value preservation, and persona/skill channel precedence.

## Verification Results

### 1. Automated tests

```sh
npm test
```

Output:

```text
Test Files  7 passed (7)
     Tests  35 passed (35)
```

### 2. Svelte checks

```sh
npm run check
```

Output:

```text
svelte-check found 0 errors and 20 warnings in 7 files
```

The warnings are the existing project accessibility/CSS warnings; no Phase 6A errors were reported.

### 3. Browser builds and diff validation

```sh
npm run build
npm run build:firefox
git diff --check
```

Output:

```text
✔ Built extension in 13.0 s
Σ Total size: 9.91 MB

Firefox build completed successfully.
git diff --check completed with no output.
```

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] All 35 automated tests pass, including the five new Phase 6A skill tests.
- [x] `npm run check` reports zero errors (20 pre-existing warnings).
- [x] Chrome and Firefox production builds complete successfully.
- [x] `git diff --check` is clean.

### Still-Required Manual Verification (To Be Done by User)

1. Load the extension unpacked, open the side panel on a normal page, and choose each built-in skill from the bolt menu. Confirm the chip appears, a suitable starter prompt is seeded only into an empty composer, and nothing sends until Send is clicked.
2. Enter `/summarize Explain this article` and confirm the chip is selected and the visible composer text becomes `Explain this article`. Enter `/unknown keep this text` and confirm it remains unchanged.
3. Send a skill-enabled message, then send a second normal message. Confirm the second request does not reuse the first turn's one-shot instruction.
4. With pre-existing enabled/custom legacy prompts in extension storage, reopen the extension twice. Confirm migrated skills are available once, legacy prompt settings remain editable in the legacy view, and duplicate migrated skills are not created.
5. Configure a global persona through the stored setting while the Phase 6B editor is pending, start a new conversation, then change that setting and reopen the conversation. Confirm the original conversation retains its snapshot.

## Known Follow-ups

- Phase 6B will expose user-skill CRUD, built-in overrides/resets, and global-persona editing in the prompt editor.
- Phase 6B will also make Deep Dive conversation/message scoped; this phase leaves the legacy summary path unchanged.

