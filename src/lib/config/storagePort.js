/**
 * Storage port — lets `src/lib/**` reach the WXT-backed storage items without
 * importing `services/wxtStorageService` (see the layering table in CLAUDE.md).
 *
 * `wxtStorageService` pulls in browser-only globals, so `lib/` modules must not
 * import it statically: pure functions in the same file would then be
 * un-unit-testable. The default provider dynamic-imports it on first use, which
 * is why this file is on the lazy-import allowlist in
 * `tests/architecture/layering.test.js`.
 */

let storageProvider = () => import('@/services/wxtStorageService.js')

/** Override the provider (used by tests to inject fakes). */
export function setStorageProvider(provider) {
  storageProvider = provider
}

/**
 * Resolve the storage-items module.
 * @returns {Promise<Record<string, any>>}
 */
export function getStorage() {
  return storageProvider()
}
