/**
 * Settings port — lets `src/lib/**` read/write settings without importing
 * `stores/settingsStore` (see the layering table in CLAUDE.md).
 *
 * `settingsStore` registers itself at module load via `setSettingsObject()` +
 * `setSettingsProvider()` + `setSettingsWriter()`. The dynamic-import fallbacks
 * below exist so the port still resolves if registration order is wrong; they
 * are the reason this file is on the lazy-import allowlist in
 * `tests/architecture/layering.test.js`.
 */

let settingsObj = null
let settingsWriter = null

let settingsProvider = async () => {
  const { settings, loadSettings } = await import('@/stores/settingsStore.svelte.js')
  await loadSettings()
  return settings
}

export function setSettingsProvider(provider) {
  settingsProvider = provider
}

/**
 * Register the live settings object **synchronously**.
 *
 * The store's `settings` is a `$state` object that is only ever mutated in
 * place (`Object.assign`), never reassigned — so holding the reference from
 * module load is safe, and pre-load reads return `DEFAULT_SETTINGS` values just
 * like reading the store directly would.
 *
 * Without this, every synchronous `settings.*` read through the proxy returned
 * `undefined` until something awaited `ensureSettingsLoaded()` — which silently
 * disabled Reduce Motion in `lib/utils/slideScaleFade.js` on any page that had
 * not yet run a summarization.
 */
export function setSettingsObject(obj) {
  settingsObj = obj
}

/** Register the store's `updateSettings` so `lib/` can persist changes. */
export function setSettingsWriter(writer) {
  settingsWriter = writer
}

export async function ensureSettingsLoaded() {
  settingsObj = await settingsProvider()
  return settingsObj
}

/**
 * Persist a settings patch through the registered writer.
 * @param {Record<string, any>} patch
 */
export async function updateSettings(patch) {
  if (settingsWriter) {
    await ensureSettingsLoaded()
    return settingsWriter(patch)
  }
  const store = await import('@/stores/settingsStore.svelte.js')
  await store.loadSettings()
  return store.updateSettings(patch)
}

export const getSettings = () => settingsObj

export const settings = new Proxy({}, {
  get(target, prop) {
    if (!settingsObj) {
      console.warn('[settingsPort] Settings read before registration')
      return undefined
    }
    return settingsObj[prop]
  },
  set(target, prop, value) {
    if (!settingsObj) {
      throw new Error(
        `[settingsPort] Cannot write "${String(prop)}" before the settings store registers itself`
      )
    }
    settingsObj[prop] = value
    return true
  },
  ownKeys() {
    return settingsObj ? Reflect.ownKeys(settingsObj) : []
  },
  getOwnPropertyDescriptor(target, prop) {
    if (settingsObj && prop in settingsObj) {
      return {
        configurable: true,
        enumerable: true,
        value: settingsObj[prop],
        writable: true,
      }
    }
    return undefined
  },
  has(target, prop) {
    return settingsObj ? prop in settingsObj : false
  }
})
