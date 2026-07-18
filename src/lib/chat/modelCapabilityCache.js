/**
 * Persistence for discovered model capabilities.
 *
 * Context windows are only learned when a provider's `/models` endpoint is hit
 * (see {@link fetchProviderModels}). Without caching, the registry starts empty
 * on every reload and the context donut falls back to estimates until the next
 * discovery. These helpers snapshot the registry to storage after discovery and
 * merge it back at startup, so exact limits are available immediately.
 *
 * Storage and providerCapabilities are imported lazily so the pure registry can
 * be unit-tested without triggering `browser.runtime` side effects.
 */

/**
 * Nudge the reactive capability signal so capability-derived UI (the context
 * donut's pre-send preview) recomputes. Lazy-imported and best-effort — the
 * store pulls in browser-only deps, so failures are swallowed in tests.
 */
async function bumpCapabilitiesSignal() {
  try {
    const { bumpCapabilitiesVersion } = await import(
      '@/stores/chatStore.svelte.js'
    )
    bumpCapabilitiesVersion()
  } catch {
    // No reactive store available (e.g. unit tests) — nothing to refresh.
  }
}

/**
 * Persist the current runtime registry snapshot to storage. Fire-and-forget
 * safe: awaits internally so the storage write never surfaces as an unhandled
 * rejection, and skips writing when nothing has been discovered yet.
 */
export async function persistDiscoveredCapabilities() {
  try {
    const { getDiscoveredCapabilitiesSnapshot } = await import(
      './providerCapabilities.js'
    )
    const entries = getDiscoveredCapabilitiesSnapshot()
    if (Object.keys(entries).length === 0) return

    // The registry already holds these limits; refresh capability UI now.
    await bumpCapabilitiesSignal()

    const { modelCapabilitiesStorage } = await import(
      '@/services/wxtStorageService.js'
    )
    await modelCapabilitiesStorage.setValue({ updatedAt: Date.now(), entries })
  } catch (error) {
    console.warn('[modelCapabilityCache] persist failed:', error)
  }
}

/**
 * Load persisted capabilities into the runtime registry. Safe to call at
 * startup (fire-and-forget) — never blocks and never throws.
 */
export async function hydrateModelCapabilitiesFromStorage() {
  try {
    const { modelCapabilitiesStorage } = await import(
      '@/services/wxtStorageService.js'
    )
    const { mergeDiscoveredCapabilities } = await import(
      './providerCapabilities.js'
    )

    const stored = await modelCapabilitiesStorage.getValue()
    if (stored?.entries && typeof stored.entries === 'object') {
      mergeDiscoveredCapabilities(stored.entries)
      await bumpCapabilitiesSignal()
    }
  } catch (error) {
    console.warn('[modelCapabilityCache] hydrate failed:', error)
  }
}
