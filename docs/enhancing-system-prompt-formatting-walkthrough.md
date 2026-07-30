---
type: walkthrough
status: done
---

# Walkthrough: Chat System Instruction Upgrade & Skill Refactoring

## Summary

Added a baseline system instruction (`DEFAULT_RESPONSE_BEHAVIOR`) to ensure well-structured, depth-appropriate responses even without a persona or skill. Rewrote all built-in chat skills to be chat-native (task objectives only, no rigid format templates). Removed Chat reply-length control entirely. Fixed budget/assembly persona mismatch.

---

## Changes Made

### Core: System Instruction Baseline

#### [sourceFormatter.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/sourceFormatter.js)
- **Added** `DEFAULT_RESPONSE_BEHAVIOR` constant — always injected as first block in system prompt
  - Response formatting guidance (markdown, headings, bullets)
  - Content depth auto-scaling (comprehensive for long sources, concise for simple questions)
  - Quality rules (no greetings, faithful to sources, skill precedence)
- **Removed** `LENGTH_INSTRUCTIONS` constant (`short/medium/long`)
- **Updated** `buildPreferenceInstructions()` — no longer reads `length`
- **Updated** `buildThinSystemInstruction()` — injects `DEFAULT_RESPONSE_BEHAVIOR` first, removed `length` from JSDoc

#### [index.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/contextPipeline/index.js)
- **Fixed** budget/assembly mismatch — now passes full persona snapshot (with language/tone) to `buildThinSystemInstruction()` instead of just `persona.content`
- **Re-exported** `DEFAULT_RESPONSE_BEHAVIOR`

---

### Skills: Chat-Native Instructions

#### [builtInSkills.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/builtInSkills.js)
- **Removed** all legacy template imports (`generalSummary`, `youtubeChapter`, `courseConcepts`, `customActionTemplates`, `systemInstructions`, `replacePlaceholders`)
- **Removed** `skillInstruction()` and `templateInstruction()` wrapper functions
- **Added** `SKILL_INSTRUCTIONS` object with chat-native instructions for 7 skills:
  - **Summarize**: comprehensive faithful summary + Key Takeaways
  - **Analyze**: objective summary + expert analysis with unverifiable claims marked
  - **Explain**: progressive complexity, analogies, mental models
  - **Debate**: balanced for/against, neutral stance
  - **Comment Analysis**: sentiment + themes + notable comments
  - **Chapter Summary**: timestamp preservation (CRITICAL: no fabrication)
  - **Course Concepts**: tiered concepts with enrichment clearly separated from source
- **Translate**: instruction unchanged, version stays at 1
- **Version bump**: all rewritten skills → `version: 2`

---

### Chat Reply Length Removal

#### [ChatSettings.svelte](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/components/settings/ChatSettings.svelte)
- **Removed** Reply length UI section (4 buttons: none/short/medium/long)
- **Removed** `LENGTH_OPTIONS` constant
- **Removed** `length` from `patchPersona()`
- **Updated** description text and comment

#### [skillService.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/chat/skills/skillService.js)
- **Removed** `length` from `createPersonaSnapshot()` return

#### [settingsStore.svelte.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/stores/settingsStore.svelte.js)
- **Removed** `length: null` from default `chatGlobalPersona`

---

### Tests

#### [skills.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/skills.test.js) (updated)
- Snapshot stability test no longer expects `LEGACY_SYSTEM_INSTRUCTION`
- **New**: version 2/1 assertion for rewritten vs unchanged skills
- **New**: no legacy wrappers (`LEGACY_SYSTEM_INSTRUCTION`, `<OUTPUT_FORMAT>`, `<EXAMPLE>`, `TASK_TEMPLATE`) in any built-in skill

#### [systemInstruction.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/chat/contextPipeline/systemInstruction.test.js) (new)
- `buildThinSystemInstruction`: baseline/persona/tone/guardrail ordering
- Empty persona still renders useful system prompt
- String persona handled correctly
- Old snapshot with `length` does NOT render length instruction
- Tone rendering + absence
- Precedence wording: skills can't override source guardrail
- `createPersonaSnapshot`: no `length` field in output
- Pipeline persona sync: full persona (language/tone) used for both budget and assembly
- Simple request: no rigid template in user message

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` | ✅ 150 tests passed (26 files) |
| `npm run check` | ✅ 0 errors, 21 warnings (all pre-existing) |
| `npm run build` | ✅ Production build succeeded (10.77 MB) |
