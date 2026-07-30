/**
 * Persistence for discovered model capabilities.
 *
 * Context windows are only learned when a provider's `/models` endpoint is hit
 * (see {@link fetchProviderModels}). Without caching, the registry starts empty
 * on every reload and the context donut falls back to estimates until the next
 * discovery. These helpers snapshot the registry to storage after discovery and
 * merge it back at startup, so exact limits are available immediately.
 *
 * Storage goes through `lib/config/storagePort.js` and the reactive capability
 * signal through `lib/chat/capabilitiesSignal.js` — both resolve lazily, so the
 * pure registry stays unit-testable without triggering `browser.runtime` side
 * effects, and `lib/` never imports `services/` or `stores/` (see the layering
 * table in CLAUDE.md).
 */

import { getStorage } from '@/lib/config/storagePort.js'
import { notifyCapabilitiesChanged } from '@/lib/chat/capabilitiesSignal.js'

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
    await notifyCapabilitiesChanged()

    const { modelCapabilitiesStorage } = await getStorage()
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
    const { modelCapabilitiesStorage } = await getStorage()
    const { mergeDiscoveredCapabilities } = await import(
      './providerCapabilities.js'
    )

    const stored = await modelCapabilitiesStorage.getValue()
    if (stored?.entries && typeof stored.entries === 'object') {
      mergeDiscoveredCapabilities(stored.entries)
      await notifyCapabilitiesChanged()
    }
  } catch (error) {
    console.warn('[modelCapabilityCache] hydrate failed:', error)
  }
}
