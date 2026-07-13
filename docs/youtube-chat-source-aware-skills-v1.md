# YouTube Chat Source-Aware Skills — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in a fresh session. Start at Phase 0 and go in order. Each phase ends with a verify step — do not move on until it passes.

## Context

The side panel now defaults to the chat surface, but its source-capture path does not preserve the legacy YouTube summarization behaviour. The legacy flow identifies a YouTube watch page, gets a timestamped transcript, then calls the `youtube` prompt builder. The legacy comment flow is separate: it fetches top comments and replies through the YouTube bridge, formats engagement metadata, then invokes `commentAnalysis`.

Chat currently has built-in, one-shot skills in `src/lib/chat/skills/builtInSkills.js`, including `summarize`, `comment-analysis`, and `chapter-summary`. A skill invocation currently persists only its instruction snapshot. Separately, `src/services/chat/chatSourceService.js` always captures `webpageText` for the active tab and `@tab` attachments. Consequently, asking chat to summarize a YouTube video gives the model semantic/DOM page text rather than the timestamped transcript used by the proven legacy flow. Adding a `YouTube Summary` instruction alone would not fix that source mismatch.

The existing source cache is also keyed effectively by tab ID and normalized URL, while source persistence defaults to `normalizedUrl:contentHash`. A single YouTube page must now support independent, provenance-preserving snapshots of transcript and comment data. Comments must remain opt-in: the bridge script uses YouTube internal endpoints, may paginate up to five pages, can fetch replies, and has a 30-second bridge timeout.

### Goal & scope decision (confirmed with user)

- Preserve the legacy behaviour in chat: on a YouTube watch/live video, a normal chat summary must use the timestamped transcript, not page DOM text.
- Add a visible built-in `YouTube Summary` skill for an explicit, predictable video-only action. It must be source-aware, not prompt-only.
- Keep `Comment Analysis` as a separate, opt-in YouTube skill. Never fetch comments for a normal video summary.
- A generic `Summarize` invocation should adapt its active-tab source: YouTube video → transcript; course → course transcript; other page → semantic webpage text.
- Keep the legacy summary UI and legacy custom prompt settings functional. This V1 changes the chat path only and must not delete or redirect legacy controls.
- Do not add dependencies or call a remote API beyond the extension's existing provider calls and existing YouTube comment bridge.
- Do not implement a combined “video + audience insights” skill in V1; it is a future composition once transcript and comments are independently grounded.

## Phase 0 — Prepare an isolated implementation workspace

1. Inspect `git status --short` before editing. The current workspace may contain user-owned dependency/UI work; never reset, stash, or overwrite unrelated files.
2. Create an implementation branch from the repository's current intended base using the required prefix, for example `codex/youtube-chat-source-skills`.
3. Read the current implementations before changing them:
   - `src/services/chat/chatSourceService.js`
   - `src/services/chat/chatService.js`
   - `src/lib/chat/skills/builtInSkills.js` and `skillService.js`
   - `src/lib/chat/contracts.js`
   - `src/services/contentService.js`
   - `src/lib/utils/youtubeUtils.js`
4. If the worktree is already dirty with files needed by this change, stop and coordinate with the owner or use a separate worktree. Do not mix those unrelated changes into this feature.

**Verify:** `git branch --show-current` reports the new `codex/` branch, and `git status --short` contains no unintended modifications to files outside the planned scope.

## Phase 1 — Make chat source snapshots capture-kind aware

1. Extend the source contract in `src/lib/chat/contracts.js` so a chat source records the exact source kind. Use explicit kinds such as `webpage`, `youtubeTranscript`, `youtubeComments`, `courseTranscript`, and `selectedText`; retain compatibility with existing persisted `youtube`/`course` values where necessary.
2. Refactor `src/services/chat/chatSourceService.js` around a capture request rather than hard-coding `contentType: 'webpageText'`:
   - `webpage` calls the existing semantic `webpageText` branch.
   - `youtubeTranscript` calls `getPageContent({ tabId, url, contentType: 'timestampedTranscript', preferredLang })` so it reuses the established transcript content script and timestamp format.
   - `courseTranscript` calls the existing `transcript` branch.
   - `youtubeComments` calls the existing `fetchYouTubeComments(tabId, { maxComments, maxRepliesPerComment })` from `src/lib/utils/youtubeUtils.js`, then `formatCommentsForAI(comments, metadata)` from the same module. Use the stored `settings.commentLimit` as the top-comment limit and the existing default of 10 replies per comment.
3. Preserve source provenance when creating snapshots. Add fields such as `sourceKind`, `preferredLang` (when relevant), and comment capture metadata (`commentLimit`, reply limit, fetched count) without placing raw source data in metadata.
4. Change runtime caching from one entry per tab to one entry per `(tabId, normalizedUrl, sourceKind)`. Capturing comments must never return a transcript snapshot, and vice versa.
5. Provide an explicit `sourceKey` to `conversationRepository.putSourceSnapshot()` that incorporates source kind, for example `<normalizedUrl>:<sourceKind>:<contentHash>`. This prevents different extracts of the same video from colliding while retaining content-hash deduplication for the same kind.
6. Keep the existing 12,000-character condensation policy for inactive `@tab` sources. Do not silently combine transcript and comments; each must remain an independently labeled source for the context formatter and source drawer.
7. Return actionable errors unchanged for unavailable transcripts, disabled comments, empty comments, navigation during capture, and bridge timeouts. Do not fall back from a requested comment source to webpage DOM text.

**Verify:** Run `npm check`. In a loaded development build, capture a YouTube transcript and comments for the same video through a temporary/manual chat invocation; inspect IndexedDB `conversationSources` and confirm two source records exist with different `sourceKind` and `sourceKey`, correct labels, and no cross-return from the cache.

## Phase 2 — Add source requirements to chat skills and invocations

1. Extend the code-owned `ChatSkill` shape in `src/lib/chat/contracts.js` and the invocation snapshot created in `src/lib/chat/skills/skillService.js` with a stable `sourceRequirement` field. Persist the requirement in `skillInvocation` so a saved user message can be reproduced even if built-in registry code later changes.
2. Use code-owned requirements for built-ins; user-created skills default to `activeTabAuto` and must not gain privileged comment fetching merely from free-form instruction text.
3. Update `src/lib/chat/skills/builtInSkills.js` with these V1 behaviours:
   - `summarize`: `activeTabAuto`; the instruction remains source-neutral while its active source is selected by page type.
   - New `youtube-summary`: `youtubeTranscript`; give it a video-focused instruction that preserves only supplied timestamps, presents key takeaways and chronological detail, and never fabricates timestamps.
   - `chapter-summary`: `youtubeTranscript`; retain its chapter-specific instruction.
   - `comment-analysis`: `youtubeComments`; retain sentiment/topics/notable-comment guidance and explicitly state that results represent the fetched top-comment subset.
   - Existing course skills: map to `courseTranscript` only when the active URL matches supported course pages; otherwise report the capability constraint.
4. Do not directly execute legacy prompt templates inside chat. Legacy templates use `__CONTENT__` replacement and are generated by `src/lib/api/api.js`; chat provides sources in its own guarded context format. Keep `skillMigration.js` for user-visible migrated prompts, but normalize or document them as instruction-only custom skills rather than assuming their legacy placeholders are executable in chat.
5. Bump built-in skill versions when their instruction or source semantics change, so persisted `skillInvocation` records clearly show the original version.

**Verify:** In the chat composer, select `/YouTube Summary`, `/Comment Analysis`, and `/Chapters`; send each with an empty message on an eligible video page and confirm the persisted user message includes the selected skill ID, version, instruction snapshot, and source requirement. Select the same skills on an ineligible page and confirm the UI/service emits a clear error without calling the model.

## Phase 3 — Route chat generation through the required active source

1. Update `src/services/chat/chatService.js` so `prepareGroundedAttachments()` receives the current `skillInvocation`, active tab details, and relevant settings. Resolve the required active capture kind before persisting the user message.
2. Add one deterministic policy function (new small module under `src/services/chat/` or a focused function in `chatSourceService.js`) that maps:
   - `activeTabAuto` + YouTube watch/live URL → `youtubeTranscript`
   - `activeTabAuto` + supported course URL → `courseTranscript`
   - `activeTabAuto` + other eligible URL → `webpage`
   - explicit source requirements → their requested kind after validating the active URL
3. Use the same policy for `@tab` attachments. An attached YouTube video should contribute a labeled transcript snapshot, rather than arbitrary page DOM. Attachments that do not meet an explicit skill's requirement should produce a warning/error rather than a silent source-type downgrade.
4. Keep the existing context pipeline intact after capture: `buildContextPipeline()` continues to resolve immutable snapshots, budget them, and wrap them with `formatSource()`. Ensure formatted source `type` exposes the new source kind so the model can distinguish transcript from audience comments.
5. Preserve conversation continuity: a first `YouTube Summary` turn attaches a transcript; a later `Comment Analysis` turn adds a separate comments source; later questions can use both persisted sources when appropriate. Do not refetch comments in every later turn.
6. Verify no automatic comment fetch occurs for generic `Summarize`, free-form questions, transcript summary, or chapter summary.

**Verify:** Build with `npm run build`, load the unpacked extension, and run this manual sequence on one YouTube video: (1) “Summarize this page”, (2) `/YouTube Summary`, (3) `/Comment Analysis`, (4) ask a follow-up comparing video claims with audience reaction. Confirm source labels/provenance show transcript first, comments only after step 3, and no timestamp is invented by transcript-oriented output.

## Phase 4 — Make the chat UI discoverable without duplicating legacy controls

1. Update `src/components/chat/ChatEmptyState.svelte` to inspect the active tab/page type and present contextual starters on YouTube:
   - “Summarize this video” → selects/uses the source-aware summarize or `youtube-summary` path.
   - “Video chapters” → `chapter-summary`.
   - “Analyze audience comments” → `comment-analysis`, with language that indicates comments will be fetched.
   Keep the current page-oriented starters for non-YouTube pages.
2. Update `src/components/chat/SkillPicker.svelte` and/or the composer integration to show source-aware availability. Ineligible skills should be hidden or visually disabled with an explanatory label; the service must still validate because UI state is not a security boundary.
3. Update `ChatSkillChip` and source presentation components as needed so a selected skill and captured source are understandable (for example, “YouTube transcript” and “YouTube comments”), without leaking raw data into the chip.
4. Keep `ActionButtons.svelte`, `ActionButtonsMini.svelte`, floating-panel comment actions, and the legacy summary screen untouched except for shared extraction fixes strictly required by Phase 1. The chat default surface must not break their existing `fetchCommentSummary()` behaviour.
5. Add concise copy for transcript-unavailable and comments-unavailable states. State what the extension could not access and give the user a next action (refresh/retry, captions unavailable, or comments disabled).

**Verify:** Manually switch the same side panel between a YouTube watch page, a normal webpage, and a supported course page. Confirm starters and skills are contextual; generic page summarization remains available; comments are never requested before the user selects the comments action; and legacy summary toggle/actions still render and work.

## Phase 5 — Regression checks, documentation, and handoff

1. Add or update focused tests if the repository's existing test setup supports them. Prioritize pure functions: capture-kind policy, cache/source-key differentiation, and skill-invocation snapshotting. Do not introduce a test framework solely for this feature.
2. Run the repository's real validation commands: `npm check` and `npm run build`. If Firefox-specific behaviour is touched, also run `npm run build:firefox`.
3. Exercise comment failure cases manually: comments disabled/unavailable, bridge timeout (or simulated rejection), and an empty comment result. Confirm chat reports the failure without creating a misleading webpage source or a fabricated response.
4. Add a short developer note under `docs/` or the relevant existing chat documentation explaining source kinds, opt-in comment capture, and the distinction between legacy prompts and chat-native skills.
5. Review the final diff to ensure no unrelated dirty-worktree changes are staged or committed.

**Verify:** `npm check`, `npm run build`, and (if changed) `npm run build:firefox` pass. The final manual YouTube flow and failure cases pass, and `git diff --check` reports no whitespace errors.

## Out of scope (V1)

- A combined `Video + Audience Insights` skill that automatically captures both transcript and comments.
- Background comment refresh, comment polling, sorting controls, or sentiment time-series analysis.
- Replacing the existing YouTube internal API comment bridge with the public YouTube Data API.
- Deleting, migrating, or changing rendering of legacy summaries, archive history, Deep Dive, or prompt-editor controls.
- Rewriting user-created free-form skills into source-fetching capabilities.
- Changing provider selection, provider API adapters, or model context-budget policy beyond labeling/feeding the new source snapshots.

## Final verification checklist

- [ ] Generic chat summary on a YouTube video is grounded in a timestamped transcript, not webpage DOM.
- [ ] `/YouTube Summary` is available only where a YouTube transcript can be requested and never fabricates a timestamp.
- [ ] `/Comment Analysis` is opt-in, creates a separately labeled comments snapshot, and accurately discloses that it reflects fetched top comments.
- [ ] Transcript and comments for one video do not collide in runtime cache or IndexedDB source persistence.
- [ ] Follow-up questions can ground against previously captured transcript and comments without unnecessary refetching.
- [ ] Legacy YouTube summary, chapters, and comments UI flows still work.
- [ ] `npm check` and `npm run build` pass; Firefox build passes if applicable.
- [ ] No unrelated user changes are included in the feature diff.

## Notable files

- `src/services/chat/chatSourceService.js` — core source capture, source-kind cache, and snapshot provenance.
- `src/services/chat/chatService.js` — selects the active source requirement before saving a chat turn.
- `src/lib/chat/skills/builtInSkills.js` — adds the explicit `youtube-summary` skill and code-owned source requirements.
- `src/lib/chat/skills/skillService.js` — snapshots source requirements with selected skill invocations.
- `src/lib/chat/contracts.js` — documents the expanded skill and source record shapes.
- `src/services/contentService.js` — existing transcript/course/web extraction API to reuse; do not duplicate its content-script logic.
- `src/lib/utils/youtubeUtils.js` — existing comment bridge client and AI-oriented comment formatter to reuse.
- `src/lib/db/conversationRepository.js` — accepts explicit source keys and persists immutable source snapshots.
- `src/lib/chat/contextPipeline/sourceFormatter.js` and `contextBudgeter.js` — keep their guarded formatting and budgeting; expose new source-kind labels through the existing path.
- `src/components/chat/ChatEmptyState.svelte`, `SkillPicker.svelte`, and `ChatComposer.svelte` — contextual entry points and skill availability in the chat UI.
- `src/stores/summaryStore.svelte` — reference-only legacy behaviour that must remain working; it is the transcript/comments parity baseline.
