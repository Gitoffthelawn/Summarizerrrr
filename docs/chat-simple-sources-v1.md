# Chat: Simple, Automatic Sources — V1

> **How to use this doc:** Self-contained execution plan, intended to be run in a
> fresh session with no prior context. Start at Phase 1 and go in order. Each
> phase ends with a **Verify** step — don't move on until it passes. This plan
> supersedes the earlier draft `docs/youtube-chat-source-aware-skills-v1.md`
> (an abandoned exploration); do **not** treat that file as a dependency.

## Context

The side panel chat lets the user pick a **skill** (Summarize, Analyze, …) and
attach tabs with `@[tab]`. Today the source layer is dumb: it always grabs
webpage DOM text regardless of page type or skill.

Concretely, in `src/services/chat/chatSourceService.js` both
`captureActiveSource()` and `captureTabSource()` hard-code
`getPageContent({ ..., contentType: 'webpageText' })`. So:

- Summarizing a YouTube video summarizes the page DOM, not the timestamped
  transcript the legacy summarizer used.
- `@`-ing a YouTube tab attaches DOM text, not its transcript.
- Skills (`src/lib/chat/skills/builtInSkills.js`) are instruction-only; they
  carry no notion of which source they need.
- There is no way to bring YouTube **comments** into a chat at all.

The extension already has everything needed to fix this, unused by chat:

- `getPageContent({ tabId, url, contentType })` in
  `src/services/contentService.js` supports `'timestampedTranscript'`,
  `'transcript'`, and `'webpageText'`.
- `detectContentType(url)` in `src/lib/utils/contentTypeDetector.js` returns
  `'youtube' | 'course' | 'website'`.
- `fetchYouTubeComments(tabId, opts)` and `formatCommentsForAI(comments, metadata)`
  in `src/lib/utils/youtubeUtils.js` fetch and format comments for a model.

### The product goal: simplicity (confirmed with user)

The user's north star is **the user should not have to think about sources**.
Three principles drive every decision below:

1. **Zero-config Auto.** The right source is chosen automatically from the page
   type, for *every* skill and for free-form chat — not just Summarize.
   - YouTube watch → **transcript**
   - Udemy/Coursera lesson → **course transcript**
   - Any other page → **webpage text**
2. **`@` means "add a source".** One affordance. It lists tabs *and* offers
   **Comments** (on YouTube). Each added source auto-resolves to the right kind
   for its page. Comments are the **only** source that is never automatic — the
   user opts in by choosing them from the `@` menu (or the Comment Analysis
   skill).
3. **The chip shows, it doesn't ask.** A source chip displays what was resolved
   (`This video · Transcript`) with no interaction required. Changing it is
   progressive disclosure — hidden behind a click, for the rare power user.

The mental model we are shipping, in full:

```
Skill    = what to do (instruction) + a default source mode (usually Auto)
Source   = resolved automatically from page type; user never configures it
@        = add a source (a tab, or Comments); still auto-resolves its kind
Comments = the one source you must ask for on purpose
```

Everything else in the source engine (cache keys, provenance, snapshots) stays
**invisible** to the user and out of the UI.

### Scope decisions (confirmed with user)

- Build a single self-contained V1: the minimal source engine **and** the simple
  UX, in one plan.
- Do **not** add a separate `YouTube Summary` built-in skill. `Summarize + Auto`
  on a YouTube page already yields transcript-grounded output; a preset is
  optional polish, listed under Out of scope.
- Do **not** add dependencies or new remote APIs beyond the existing provider
  calls and the existing YouTube comment bridge.
- Do **not** touch the legacy summary screen, archive, Deep Dive, or the
  floating panel. This plan changes the chat path only.
- On a requested-but-unavailable source (e.g. comments disabled, no captions),
  show a clear error. Never silently substitute a different source kind.

## Phase 1 — Auto source resolution in the capture engine

Make source capture *kind-aware* and driven by page type. This is invisible
plumbing; no UI changes yet.

1. Add a small pure resolver. Create
   `src/services/chat/sourceResolution.js` exporting:
   - `resolveAutoSourceKind(url)` → uses `detectContentType(url)` and maps
     `youtube → 'youtubeTranscript'`, `course → 'courseTranscript'`,
     `website → 'webpage'`.
   - `contentTypeForKind(kind)` → maps `'youtubeTranscript' → 'timestampedTranscript'`,
     `'courseTranscript' → 'transcript'`, `'webpage' → 'webpageText'`.
   - `SOURCE_KINDS` constant listing `'webpage' | 'youtubeTranscript' |
     'youtubeComments' | 'courseTranscript' | 'selectedText'`.
2. Refactor `src/services/chat/chatSourceService.js` so both
   `captureActiveSource()` and `captureTabSource()` accept a resolved
   `sourceKind` (default: `resolveAutoSourceKind(tab.url)`) instead of
   hard-coding `'webpageText'`:
   - For `youtubeTranscript` / `courseTranscript` / `webpage`, call
     `getPageContent({ tabId, url, contentType: contentTypeForKind(kind), preferredLang })`.
   - For `youtubeComments`, call `fetchYouTubeComments(tabId, { maxComments:
     settings.commentLimit, maxRepliesPerComment: 10 })` then
     `formatCommentsForAI(comments, metadata)`; store the fetched counts in
     provenance (see step 4). Comments are only ever captured when explicitly
     requested — never from `resolveAutoSourceKind`.
3. Change the runtime cache from one entry per tab to one per
   `(tabId, normalizedUrl, sourceKind)`. Rename/extend the `sourceIdsByTab`
   map accordingly so capturing a transcript never returns a comments snapshot
   or vice versa.
4. Persist provenance. Pass an explicit `sourceKind` and a `sourceKey` of
   `<normalizedUrl>:<sourceKind>:<contentHash>` to
   `repository.putSourceSnapshot()`, and set `sourceType` to the kind. For
   comments include `commentLimit`, `replyLimit`, and `fetchedCount`.
5. Update the `ConversationSourceRecord.sourceType` union in
   `src/lib/chat/contracts.js` to include `'youtubeTranscript'`,
   `'youtubeComments'`, and `'courseTranscript'` (keep the old
   `'youtube'|'course'` values readable for any already-persisted records).
6. Return clear errors unchanged for: transcript unavailable, comments disabled,
   empty comments, tab navigated during capture, bridge timeout. Do **not** fall
   back from a requested kind to webpage text.

**Verify:** `npm check` passes. In a dev build, open a YouTube watch page, and
via a temporary manual `captureActiveSource()` call confirm the persisted
snapshot in IndexedDB `conversationSources` has `sourceType:
'youtubeTranscript'` and its content contains `[mm:ss]`-style timestamps — not
page navigation/DOM text.

## Phase 2 — Skills carry a default source; Auto applies to every skill

1. Add a `sourceMode` field to the skill shape in `src/lib/chat/contracts.js`
   (`ChatSkill`) and to the invocation snapshot built by `toSkillInvocation()`
   in `src/lib/chat/skills/skillService.js`. Persisting it on the invocation
   means a saved message reproduces its source behaviour even if the registry
   later changes.
2. Set `sourceMode` on the built-ins in
   `src/lib/chat/skills/builtInSkills.js`:
   - `summarize`, `analyze`, `explain`, `debate`, `translate` → `'auto'`.
   - `chapter-summary` → `'youtubeTranscript'`.
   - `comment-analysis` → `'youtubeComments'`.
   - `course-concepts` → `'courseTranscript'`.
   - Bump each changed skill's `version`.
   User-created skills default to `'auto'` and must **not** gain comment
   fetching from free-form instruction text — only from an explicit
   `sourceMode`.
3. In `src/services/chat/chatService.js`, resolve the active source kind before
   capture: in `prepareGroundedAttachments()` (and its `send()` caller), read
   `skillInvocation?.sourceMode`. If `'auto'` or absent, use
   `resolveAutoSourceKind(activeTab.url)`; otherwise use the skill's explicit
   kind after validating the active URL supports it. Pass that kind into
   `captureActiveSource(kind)`.
4. Free-form chat (no skill) behaves as `'auto'`: transcript on YouTube, course
   transcript on a lesson, webpage elsewhere. It never fetches comments.

**Verify:** In a dev build on one YouTube video, send `/Summarize`, `/Analyze`,
`/Explain`, and a plain free-form question. Inspect the persisted user messages:
each carries a `youtubeTranscript` active source and **none** fetched comments.
Send `/Comment Analysis` and confirm it (and only it) produces a
`youtubeComments` source.

## Phase 3 — Unified `@` menu: tabs **and** Comments

This is the headline UX. `@` becomes the single "add a source" gesture.

1. In `src/services/chat/tabMentionService.js`, add the notion of non-tab source
   entries. Extend `listTabs(query)` (or add `listMentionSources(query, {
   activeTab, attachments })`) so the returned list can include a synthetic
   **Comments** entry when a YouTube watch page is in play:
   - Comments for the **current** video when the active tab is YouTube.
   - Comments for a **mentioned** YouTube tab already attached this turn.
   Each entry carries `{ kind: 'youtubeComments', tabId, url, title, label }`.
   Never surface Comments for non-YouTube pages.
2. In `src/components/chat/TabMentionMenu.svelte`, render these entries in the
   same list with a distinct icon (e.g. `heroicons:chat-bubble-left-right` for
   Comments vs `heroicons:document-text` for tabs) and a clear label like
   `Comments · <video title>`. Keep the existing keyboard nav and
   `disabledReason` handling.
3. In `src/stores/chatStore.svelte.js`, extend the attach path (currently
   `addTabAttachment` around line 136) so a selected entry stores its
   `sourceKind`. A `youtubeComments` selection adds a pending attachment whose
   capture in Phase 1's engine fetches comments for that video. Respect
   `MAX_TAB_ATTACHMENTS`.
4. `@`-ing a tab still auto-resolves its own kind (a YouTube tab → transcript, an
   article → webpage) via `resolveAutoSourceKind` in `captureTabSource()`. No
   per-tab configuration needed.

**Verify:** In a dev build, on a YouTube page type `@` — the menu lists open
tabs **and** a "Comments" entry; selecting it attaches a comments source and the
next reply reflects audience comments. On a non-YouTube page, `@` shows no
Comments entry. A plain `/Summarize` never triggers a comment fetch.

## Phase 4 — Display-first source chip with progressive override

1. Extend `src/components/chat/ChatSourceChip.svelte` to show the **resolved
   kind**, not just a name: an icon + `"<label> · <Kind>"`
   (e.g. `This video · Transcript`, `Article · Web page`, `This video ·
   Comments`). Pass the source's `sourceKind` in from wherever the chip is
   rendered (the active-source chip and each `@` attachment chip). No user
   interaction is required for the common case.
2. Make the chip optionally clickable to reveal a **minimal** override menu —
   progressive disclosure, only on click. Keep the option set lean:
   `Auto`, `Transcript`, `Comments`, `Web page`, `Remove`. Only show options
   valid for that page (e.g. no `Transcript`/`Comments` on a plain article).
   Selecting an override re-captures that source with the chosen kind for this
   turn only; it does not change the skill's default.
3. The override lives entirely in the chip. Skills provide the default; the chip
   is the escape hatch. Do not add a separate settings surface for it.

**Verify:** In a dev build on a YouTube page, the active-source chip reads
`This video · Transcript` with zero clicks. Clicking it reveals the override
menu; choosing `Comments` re-captures and the chip updates to `This video ·
Comments`. On an article page the chip reads `Web page` and the override menu
omits Transcript/Comments.

## Phase 5 — Unavailable-source clarity + regression

1. Audit the error copy surfaced through `onWarnings`/thrown errors for the new
   kinds: no captions, comments disabled, empty comments, bridge timeout, tab
   navigated. Each must say what could not be accessed and a next action. Never
   downgrade a requested `youtubeComments` to `webpage` silently.
2. Add focused unit tests for the pure logic if the repo's test setup supports
   it (see `tests/`): `resolveAutoSourceKind`, `contentTypeForKind`, and the
   cache-key differentiation `(tabId, url, sourceKind)`. Do not introduce a new
   test framework just for this.
3. Run the repo's real validation: `npm check` and `npm run build`. If any
   Firefox-specific path was touched, also `npm run build:firefox`.

**Verify:** `npm check` and `npm run build` pass. Manual pass on one YouTube
video: (1) `/Summarize` → transcript-grounded, no comments; (2) `@` → Comments →
follow-up reflects audience reaction; (3) disable comments on a video (or
simulate a bridge rejection) and confirm a clear error with no fabricated
webpage source. `git diff --check` reports no whitespace errors.

## Out of scope (V1)

- A dedicated `YouTube Summary` built-in skill (Summarize + Auto already covers
  it; a preset is optional future polish).
- A combined "transcript + comments" single source mode (the user composes it
  today by `@`-ing Comments alongside a normal summary).
- Comment refresh/polling, sorting, or sentiment-over-time.
- Replacing the internal comment bridge with the public YouTube Data API.
- Any change to the legacy summary screen, archive, Deep Dive, floating panel,
  provider adapters, or context-budget policy beyond labeling the new kinds.

## Final verification checklist

- [ ] Generic chat summary on a YouTube video is grounded in the timestamped
      transcript, not webpage DOM.
- [ ] Every skill and free-form chat uses Auto on YouTube → transcript.
- [ ] `@` shows tabs **and** a Comments entry on YouTube; comments are never
      fetched automatically.
- [ ] Source chip shows the resolved kind with zero clicks; override is behind a
      click only.
- [ ] Transcript and comments for one video don't collide in cache or IndexedDB.
- [ ] Unavailable sources produce clear errors, never a silent kind swap.
- [ ] `npm check` and `npm run build` pass (Firefox build if touched).
- [ ] No unrelated dirty-worktree changes are included in the diff.

## Notable files

- `src/services/chat/sourceResolution.js` — **new**; pure page-type → source-kind
  mapping and content-type lookup.
- `src/services/chat/chatSourceService.js` — kind-aware capture, per-kind cache,
  comment fetching, snapshot provenance.
- `src/services/chat/chatService.js` — resolves the active source kind from the
  skill's `sourceMode` before capturing.
- `src/lib/chat/skills/builtInSkills.js` — adds `sourceMode` to built-ins.
- `src/lib/chat/skills/skillService.js` — snapshots `sourceMode` into the
  invocation.
- `src/lib/chat/contracts.js` — expands the source-kind and skill shapes.
- `src/services/chat/tabMentionService.js` — the `@` menu gains Comments entries.
- `src/components/chat/TabMentionMenu.svelte` — renders tabs + Comments together.
- `src/components/chat/ChatSourceChip.svelte` — display-first kind label +
  progressive override menu.
- `src/stores/chatStore.svelte.js` — attach path carries `sourceKind`.
- `src/services/contentService.js` — existing extractor to reuse (transcript /
  course / webpage); do not duplicate its content-script logic.
- `src/lib/utils/youtubeUtils.js` — existing comment bridge + AI formatter.
- `src/lib/utils/contentTypeDetector.js` — existing `detectContentType(url)`.
```
