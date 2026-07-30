# Walkthrough - Phase 5: Write the rule down + add the regression guard

Implemented Phase 5 of the Structure Cleanup + Layering Rule plan.

## Changes Made

### 1. Architecture Rules

#### [CLAUDE.md](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/CLAUDE.md)
- Added `Code Layering & Component Rules` under `Architecture Overview` detailing the dependency direction and component placement.

#### [layering.test.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/tests/architecture/layering.test.js)
- Created the regression guard to enforce the layering architecture rules and prevent duplicate component names.

### 2. Fixes

#### [api.js](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/api/api.js)
- Re-applied Phase 3 changes (using settingsPort) that were accidentally reverted.

## Verification Results

### 1. Tests
- Ran `npm test tests/architecture/layering.test.js` → Passed.
- Modified `api.js` to break a rule and ran `npm test tests/architecture/layering.test.js` → Confirmed it failed correctly.
- Ran `npm test && npm run check && npm run build && npm run build:firefox` → All checks passed.

## Verification Categories

### Completed Verification (Verified by Agent)
- [x] Tested architecture rules enforcement with intentional breakages and verifications.
- [x] Wrote down the layering and component placement rules.
- [x] Guard test proven to fail when the rule is broken.
- [x] Passed `npm test`, `npm run check`, `npm run build`, and `npm run build:firefox`.
- [x] `CLAUDE.md` contains the layering table and the component-placement rule.

### Still-Required Manual Verification (To Be Done by User)
- [ ] Sidepanel: summarize a YouTube video, streaming **and** non-streaming; model status shows in the footer.
- [ ] Floating panel: enable the FAB on a regular web page, summarize, hover copy/download — tooltips appear.
- [ ] Settings: export a ZIP and re-import it.
- [ ] Archive: TOC and tag filter still render.
- [ ] Chat: send a message in the sidepanel.
- [ ] Reduce Motion toggle actually stops animations.
