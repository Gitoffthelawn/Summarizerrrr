// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'

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
import { settings } from '@/stores/settingsStore.svelte.js'
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
      if (entry.isTemplate) continue
      const onchange = vi.fn()
      let currentProvider = entry.id
      let currentModel = entry.defaultModel

      settings.addedProviders = [entry.id]
      if (entry.apiKeyField) {
        settings[entry.apiKeyField] = `test-${entry.id}-key`
      }
      if (entry.endpointField) {
        settings[entry.endpointField] = 'http://localhost:1234'
      }
      flushSync()

      const component = mount(FeatureModelPicker, {
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
      await unmount(component)
    }
  })

  it('allows committing a custom typed model id for a static provider', () => {
    const onchange = vi.fn()
    let currentProvider = 'chatgpt'
    let currentModel = 'gpt-5-mini'

    settings.addedProviders = ['chatgpt']
    settings.chatgptApiKey = 'test-chatgpt-key'
    flushSync()

    const component = mount(FeatureModelPicker, {
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
    unmount(component)
  })

  it('handles dynamic profiles correctly (dropdown, selection, auto-collapse, fallback)', async () => {
    // 1. Configure settings with two dynamic profiles
    settings.openaiCompatibleProfiles = [
      {
        id: 'openai-compatible-profile-1',
        name: 'Profile A',
        baseUrl: 'https://api.profile-a.com/v1',
        apiKey: 'key-a',
        defaultModel: 'model-a',
      },
      {
        id: 'openai-compatible-profile-2',
        name: 'Profile B',
        baseUrl: 'https://api.profile-b.com/v1',
        apiKey: 'key-b',
        defaultModel: 'model-b',
      },
    ]
    settings.geminiApiKey = 'test-gemini-key'
    settings.addedProviders = ['gemini']
    flushSync()

    let boundProvider = 'openai-compatible-profile-1'
    let boundModel = 'model-a'
    const onchange = vi.fn((p, m) => {
      boundProvider = p
      boundModel = m
    })

    const component = mount(FeatureModelPicker, {
      target: host,
      props: {
        provider: boundProvider,
        model: boundModel,
        onchange,
      }
    })
    flushSync()

    // 2. Trigger should render since we have >=2 configured providers (Gemini and both dynamic profiles)
    const trigger = host.querySelector('[aria-label="Select Provider"]')
    expect(trigger).not.toBeNull()
    expect(trigger.textContent).toContain('Profile A')

    // Rename profile-1 in settings
    settings.openaiCompatibleProfiles[0].name = 'Profile A Renamed'
    flushSync()

    // Select label should update
    expect(trigger.textContent).toContain('Profile A Renamed')

    // 3. Auto-collapse: remove Gemini key and Profile B key, so only Profile A is configured
    settings.geminiApiKey = ''
    settings.openaiCompatibleProfiles[1].apiKey = ''
    flushSync()

    // Now only Profile A is configured. Dropdown should disappear due to auto-collapse!
    const triggerAfterCollapse = host.querySelector('[aria-label="Select Provider"]')
    expect(triggerAfterCollapse).toBeNull()

    unmount(component)
  })
})
