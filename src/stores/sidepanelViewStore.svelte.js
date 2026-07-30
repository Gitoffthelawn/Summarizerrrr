/**
 * Which surface the side panel is currently showing.
 *
 * Both surfaces scroll the same element (the document — neither has a local
 * overflow container), but each keeps its own per-tab scroll offset: the
 * summary surface in `services/tabCacheService.js`, chat in `chatStore`'s
 * session snapshots. Whoever is off screen must not touch the viewport, so
 * this flag has to be readable outside `App.svelte` — `messageHandler` reads
 * it before saving or restoring the summary offset.
 *
 * Chat is the default surface; the legacy summary is reachable one-way from
 * the conversation menu and resets when the panel is reopened.
 */
export const sidepanelViewState = $state({
  /** @type {'chat' | 'summary'} */
  surface: 'chat',
})

export function showLegacySummarySurface() {
  sidepanelViewState.surface = 'summary'
}
