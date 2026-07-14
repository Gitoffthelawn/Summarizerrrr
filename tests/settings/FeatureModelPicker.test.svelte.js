// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushSync } from 'svelte'

// Mock svelte-i18n
vi.mock('svelte-i18n', () => {
  return {
    t: {
      subscribe: (run) => {
        run((key, options) => options?.default || key)
        return () => {}
      }
    }
  }
})

// Mock wxtStorageService settingStorage using vi.hoisted to prevent hoisting issues
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

// Mock cloudSyncService to avoid unhandled browser/storage exceptions in Node environment
vi.mock('@/services/cloudSync/cloudSyncService.svelte.js', () => ({
  triggerSync: vi.fn(),
  saveCustomCredentials: vi.fn(),
}))

// Mock fetchProviderModels to return dummy models list
vi.mock('@/lib/api/providerModelService.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    fetchProviderModels: vi.fn().mockResolvedValue(['mock-discovered-model-1', 'mock-discovered-model-2'])
  }
})

// Import dependencies after mocking
import { PROVIDER_LIST } from '@/lib/providers/providerRegistry.js'
import FeatureModelPicker from '@/components/inputs/FeatureModelPicker.svelte'

describe('FeatureModelPicker Component', () => {
  let host

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    return () => {
      host.remove()
    }
  })

  it('renders a usable model control for all 10 registry entries', async () => {
    for (const entry of PROVIDER_LIST) {
      const onchange = vi.fn()
      let currentProvider = entry.id
      let currentModel = entry.defaultModel

      mount(FeatureModelPicker, {
        target: host,
        props: {
          provider: currentProvider,
          model: currentModel,
          onchange,
        }
      })

      flushSync()

      // Assert model control is present
      if (entry.modelSource === 'discovery') {
        const input = host.querySelector('#feature-model-select')
        expect(input).not.toBeNull()
      } else if (entry.modelSource === 'static') {
        const input = host.querySelector('#feature-model-input')
        expect(input).not.toBeNull()
      } else if (entry.modelSource === 'freeText') {
        const input = host.querySelector('#feature-model-input')
        expect(input).not.toBeNull()
        expect(input.tagName.toLowerCase()).toBe('input')
      }

      // Cleanup for next iteration
      host.innerHTML = ''
    }
  })

  it('allows committing a custom typed model id for a static provider', () => {
    const onchange = vi.fn()
    let currentProvider = 'chatgpt'
    let currentModel = 'gpt-5-mini'

    mount(FeatureModelPicker, {
      target: host,
      props: {
        provider: currentProvider,
        model: currentModel,
        onchange,
      }
    })

    flushSync()

    const input = host.querySelector('#feature-model-input')
    expect(input).not.toBeNull()

    // Type a custom model ID
    input.value = 'my-custom-gpt-model'
    input.dispatchEvent(new Event('input'))
    
    // Trigger blur
    input.dispatchEvent(new Event('blur'))
    flushSync()

    expect(onchange).toHaveBeenCalledWith('chatgpt', 'my-custom-gpt-model')
  })
})
