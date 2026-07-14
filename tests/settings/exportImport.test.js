import { describe, expect, it, vi } from 'vitest'

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

// Mock cloudSyncService
vi.mock('@/services/cloudSync/cloudSyncService.svelte.js', () => ({
  triggerSync: vi.fn(),
  saveCustomCredentials: vi.fn(),
}))

import { sanitizeSettings } from '@/lib/config/settingsSchema.js'
import { mergeProfiles } from '@/lib/providers/openAICompatibleProfiles.js'
import { normalizeStoredSettings } from '@/stores/settingsStore.svelte.js'

describe('Export/Import Settings & Profiles', () => {
  it('proves profile objects survive sanitization for export', () => {
    const rawSettings = {
      selectedProvider: 'openai-compatible-profile-1',
      openaiCompatibleProfiles: [
        {
          id: 'openai-compatible-profile-1',
          name: 'My Custom Profile',
          baseUrl: 'https://api.my-profile.com/v1',
          apiKey: 'secret-key',
          defaultModel: 'model-a',
        }
      ],
      invalidField: 'should be removed'
    }

    const clean = sanitizeSettings(rawSettings)
    
    // Check that valid fields and profiles survived
    expect(clean.selectedProvider).toBe('openai-compatible-profile-1')
    expect(clean.openaiCompatibleProfiles).toHaveLength(1)
    expect(clean.openaiCompatibleProfiles[0].name).toBe('My Custom Profile')
    expect(clean.openaiCompatibleProfiles[0].apiKey).toBe('secret-key')
    
    // Check that invalid fields are stripped
    expect(clean.invalidField).toBeUndefined()
  })

  it('correctly merges profiles using mergeProfiles helper', () => {
    const local = [
      { id: 'openai-compatible-1', name: 'Local A', baseUrl: 'https://local-a.com', apiKey: 'k-a', defaultModel: 'm-a' },
      { id: 'openai-compatible-2', name: 'Local B', baseUrl: 'https://local-b.com', apiKey: 'k-b', defaultModel: 'm-b' },
    ]
    const imported = [
      { id: 'openai-compatible-2', name: 'Imported B', baseUrl: 'https://imported-b.com', apiKey: 'k-b-new', defaultModel: 'm-b-new' },
      { id: 'openai-compatible-3', name: 'Imported C', baseUrl: 'https://imported-c.com', apiKey: 'k-c', defaultModel: 'm-c' },
    ]

    const merged = mergeProfiles(local, imported)
    
    expect(merged).toHaveLength(3)
    
    // Local A is retained
    expect(merged.find(p => p.id === 'openai-compatible-1').name).toBe('Local A')
    
    // Local B is overwritten by Imported B
    expect(merged.find(p => p.id === 'openai-compatible-2').name).toBe('Imported B')
    expect(merged.find(p => p.id === 'openai-compatible-2').apiKey).toBe('k-b-new')
    
    // Imported C is added
    expect(merged.find(p => p.id === 'openai-compatible-3').name).toBe('Imported C')
  })
})
