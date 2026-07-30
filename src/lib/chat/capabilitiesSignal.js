/**
 * Capabilities-signal port — lets the catalog/cache modules in `src/lib/chat/**`
 * nudge the reactive capability version without importing `stores/chatStore`
 * (see the layering table in CLAUDE.md).
 *
 * `chatStore` registers `bumpCapabilitiesVersion` at module load. The default
 * reporter dynamic-imports the store so the signal still lands if the catalog
 * hydrates before `chatStore` has been imported — which is why this file is on
 * the lazy-import allowlist in `tests/architecture/layering.test.js`.
 */

let reporter = async () => {
  try {
    const { bumpCapabilitiesVersion } = await import('@/stores/chatStore.svelte.js')
    bumpCapabilitiesVersion()
  } catch {
    // No reactive store available (e.g. unit tests) — nothing to refresh.
  }
}

export function setCapabilitiesSignalReporter(newReporter) {
  reporter = newReporter
}

/** Best-effort: never throws, so callers can `await` it on a hot path. */
export async function notifyCapabilitiesChanged() {
  try {
    await reporter()
  } catch {
    // Signal delivery is decorative — swallow.
  }
}
