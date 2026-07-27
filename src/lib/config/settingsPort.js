let settingsObj = null;

let settingsProvider = async () => {
  const { settings, loadSettings } = await import('@/stores/settingsStore.svelte.js')
  await loadSettings()
  return settings
}

export function setSettingsProvider(provider) {
  settingsProvider = provider
}

export async function ensureSettingsLoaded() {
  settingsObj = await settingsProvider()
  return settingsObj
}

export const getSettings = () => settingsObj

export const settings = new Proxy({}, {
  get(target, prop) {
    if (!settingsObj) {
      console.warn('[settingsPort] Settings read before load')
      return undefined
    }
    return settingsObj[prop]
  },
  set(target, prop, value) {
    if (settingsObj) {
      settingsObj[prop] = value
      return true
    }
    return false
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
