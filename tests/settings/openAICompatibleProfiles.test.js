import { describe, it, expect, vi } from 'vitest'
import {
  isOpenAICompatibleProfileId,
  generateProfileId,
  validateBaseUrl,
  validateProfile,
  getNextDefaultName,
  normalizeProfile,
  normalizeProfiles,
  findProfileById,
  mergeProfiles,
} from '@/lib/providers/openAICompatibleProfiles.js'

describe('OpenAI Compatible Profiles Domain Model', () => {
  describe('isOpenAICompatibleProfileId', () => {
    it('returns true only for valid format', () => {
      expect(isOpenAICompatibleProfileId('openai-compatible-123')).toBe(true)
      expect(isOpenAICompatibleProfileId('openai-compatible-legacy')).toBe(true)
      expect(isOpenAICompatibleProfileId('openaiCompatible')).toBe(false)
      expect(isOpenAICompatibleProfileId('gemini')).toBe(false)
      expect(isOpenAICompatibleProfileId(null)).toBe(false)
      expect(isOpenAICompatibleProfileId(undefined)).toBe(false)
    })
  })

  describe('generateProfileId', () => {
    it('returns a string starting with openai-compatible-', () => {
      const id = generateProfileId()
      expect(id).toMatch(/^openai-compatible-[a-f0-9-]+/)
    })
  })

  describe('validateBaseUrl', () => {
    it('validates HTTP and HTTPS protocols', () => {
      expect(validateBaseUrl('https://api.openai.com/v1')).toBe(true)
      expect(validateBaseUrl('http://localhost:11434')).toBe(true)
      expect(validateBaseUrl('ftp://example.com')).toBe(false)
      expect(validateBaseUrl('invalid-url')).toBe(false)
      expect(validateBaseUrl('')).toBe(false)
      expect(validateBaseUrl(null)).toBe(false)
    })
  })

  describe('validateProfile', () => {
    it('returns true for a fully configured profile', () => {
      const valid = {
        id: 'openai-compatible-1',
        name: 'Profile 1',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-12345',
        defaultModel: 'gpt-4',
      }
      expect(validateProfile(valid)).toBe(true)
    })

    it('returns false if any field is missing or empty', () => {
      const invalidName = {
        id: 'openai-compatible-1',
        name: '',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-12345',
        defaultModel: 'gpt-4',
      }
      expect(validateProfile(invalidName)).toBe(false)

      const invalidUrl = {
        id: 'openai-compatible-1',
        name: 'Profile 1',
        baseUrl: 'not-a-url',
        apiKey: 'sk-12345',
        defaultModel: 'gpt-4',
      }
      expect(validateProfile(invalidUrl)).toBe(false)

      const missingKey = {
        id: 'openai-compatible-1',
        name: 'Profile 1',
        baseUrl: 'https://api.example.com',
        apiKey: '',
        defaultModel: 'gpt-4',
      }
      expect(validateProfile(missingKey)).toBe(false)
    })
  })

  describe('getNextDefaultName', () => {
    it('generates case-insensitively unique names', () => {
      const profiles = [
        { name: 'OpenAI Compatible 1' },
        { name: 'openai compatible 2' },
      ]
      expect(getNextDefaultName(profiles)).toBe('OpenAI Compatible 3')
      expect(getNextDefaultName([])).toBe('OpenAI Compatible 1')
    })
  })

  describe('normalizeProfile', () => {
    it('fills in missing ID and name, trims string fields', () => {
      const raw = {
        baseUrl: '  https://api.example.com  ',
        apiKey: '  sk-12345 ',
        defaultModel: 'gpt-4',
      }
      const norm = normalizeProfile(raw)
      expect(norm.id).toMatch(/^openai-compatible-/)
      expect(norm.name).toBe('OpenAI Compatible 1')
      expect(norm.baseUrl).toBe('https://api.example.com')
      expect(norm.apiKey).toBe('sk-12345')
      expect(norm.defaultModel).toBe('gpt-4')
    })

    it('retains existing valid ID and name', () => {
      const raw = {
        id: 'openai-compatible-custom',
        name: 'Custom Profile',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-123',
        defaultModel: 'model-a',
      }
      const norm = normalizeProfile(raw)
      expect(norm.id).toBe('openai-compatible-custom')
      expect(norm.name).toBe('Custom Profile')
    })
  })

  describe('normalizeProfiles', () => {
    it('returns empty array if input is invalid', () => {
      expect(normalizeProfiles(null)).toEqual([])
      expect(normalizeProfiles({})).toEqual([])
    })

    it('filters out non-object entries, duplicates, and preserves order', () => {
      const raw = [
        null,
        { id: 'openai-compatible-1', name: 'Profile 1', baseUrl: 'https://api.a.com', apiKey: 'k1', defaultModel: 'm1' },
        { id: 'openai-compatible-1', name: 'Profile 1 Duplicate', baseUrl: 'https://api.b.com', apiKey: 'k2', defaultModel: 'm2' },
        { id: 'openai-compatible-2', name: 'Profile 2', baseUrl: 'https://api.c.com', apiKey: 'k3', defaultModel: 'm3' },
      ]
      const norm = normalizeProfiles(raw)
      expect(norm.length).toBe(2)
      expect(norm[0].id).toBe('openai-compatible-1')
      expect(norm[0].name).toBe('Profile 1')
      expect(norm[1].id).toBe('openai-compatible-2')
    })
  })

  describe('findProfileById', () => {
    it('returns matching profile or null', () => {
      const profiles = [{ id: 'openai-compatible-1', name: 'P1' }]
      expect(findProfileById(profiles, 'openai-compatible-1')).toEqual({ id: 'openai-compatible-1', name: 'P1' })
      expect(findProfileById(profiles, 'openai-compatible-2')).toBeNull()
      expect(findProfileById(null, 'openai-compatible-1')).toBeNull()
    })
  })

  describe('mergeProfiles', () => {
    it('merges two lists, letting imported ones overwrite matching IDs', () => {
      const local = [
        { id: 'openai-compatible-1', name: 'Local P1', baseUrl: 'http://local-1', apiKey: 'k1', defaultModel: 'm1' },
        { id: 'openai-compatible-2', name: 'Local P2', baseUrl: 'http://local-2', apiKey: 'k2', defaultModel: 'm2' },
      ]
      const imported = [
        { id: 'openai-compatible-2', name: 'Imported P2', baseUrl: 'http://import-2', apiKey: 'k2-imp', defaultModel: 'm2-imp' },
        { id: 'openai-compatible-3', name: 'Imported P3', baseUrl: 'http://import-3', apiKey: 'k3', defaultModel: 'm3' },
      ]
      const merged = mergeProfiles(local, imported)
      expect(merged.length).toBe(3)
      expect(merged.find(p => p.id === 'openai-compatible-1').name).toBe('Local P1')
      expect(merged.find(p => p.id === 'openai-compatible-2').name).toBe('Imported P2')
      expect(merged.find(p => p.id === 'openai-compatible-2').apiKey).toBe('k2-imp')
      expect(merged.find(p => p.id === 'openai-compatible-3').name).toBe('Imported P3')
    })
  })
})
