/**
 * Regression guard for the settings port's **synchronous** read path.
 *
 * `lib/utils/slideScaleFade.js` reads `settings.reduceMotion` synchronously from
 * inside a Svelte transition — there is no place to await. When the port only
 * populated its backing object inside `ensureSettingsLoaded()`, every such read
 * returned `undefined` until something ran a summarization, which silently
 * disabled Reduce Motion on freshly-opened pages.
 */

import { describe, it, expect, vi } from 'vitest'

const mockStorage = vi.hoisted(() => ({
  value: {},
  async getValue() {
    return this.value
  },
  async setValue(val) {
    this.value = val
  },
  watch: vi.fn(),
}))

vi.mock('@/services/wxtStorageService.js', () => ({
  settingsStorage: mockStorage,
}))

vi.mock('@/services/cloudSync/cloudSyncService.svelte.js', () => ({
  triggerSync: vi.fn(),
  saveCustomCredentials: vi.fn(),
}))

// Importing the store is what registers it with the port.
import { settings as storeSettings } from '@/stores/settingsStore.svelte.js'
import {
  settings as portSettings,
  getSettings,
} from '@/lib/config/settingsPort.js'

describe('settingsPort synchronous reads', () => {
  it('resolves defaults without awaiting ensureSettingsLoaded()', () => {
    // No await anywhere in this test — that is the whole point.
    expect(getSettings()).not.toBeNull()
    expect(portSettings.reduceMotion).toBe(false)
  })

  it('reads through to the live store object rather than a snapshot', () => {
    storeSettings.reduceMotion = true
    expect(portSettings.reduceMotion).toBe(true)
    storeSettings.reduceMotion = false
    expect(portSettings.reduceMotion).toBe(false)
  })

  it('exposes the same object identity the store mutates in place', () => {
    expect(getSettings()).toBe(storeSettings)
  })
})
