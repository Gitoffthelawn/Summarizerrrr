import { BUILT_IN_SKILLS } from './builtInSkills.js'
import { generateUUID } from '@/lib/utils/utils.js'

function toStoredSkill(skill = {}) {
  return {
    id: skill.id,
    name: String(skill.name || '').trim(),
    instruction: String(skill.instruction || '').trim(),
    pinned: Boolean(skill.pinned),
  }
}

export function getAvailableSkills(userSkills = []) {
  const overrides = new Map(
    (Array.isArray(userSkills) ? userSkills : [])
      .filter((skill) => skill?.id)
      .map((skill) => [skill.id, toStoredSkill(skill)]),
  )
  const builtIns = BUILT_IN_SKILLS.map((skill) => ({
    ...skill,
    ...overrides.get(skill.id),
    builtIn: true,
  }))
  const custom = [...overrides.values()]
    .filter((skill) => !BUILT_IN_SKILLS.some((builtIn) => builtIn.id === skill.id))
    .map((skill) => ({ ...skill, version: 1, builtIn: false }))
  return [...builtIns, ...custom]
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.name.localeCompare(b.name))
}

export function toSkillInvocation(skill) {
  if (!skill) return null
  return {
    skillId: skill.id,
    skillVersion: skill.version || 1,
    instructionSnapshot: String(skill.instruction || ''),
    name: skill.name,
  }
}

export function validateSkillDraft(draft) {
  const name = String(draft?.name || '').trim()
  const instruction = String(draft?.instruction || '').trim()
  const errors = []
  if (!name) errors.push('A skill name is required.')
  if (!instruction) errors.push('An instruction is required.')
  return {
    valid: errors.length === 0,
    errors,
    value: { ...draft, name, instruction, pinned: Boolean(draft?.pinned) },
  }
}

export function createUserSkill(draft = {}) {
  return toStoredSkill({
    ...draft,
    id: draft.id || `user-${generateUUID()}`,
  })
}

export function createPersonaSnapshot(chatGlobalPersona, fallback = {}) {
  const persona = chatGlobalPersona || {}
  return {
    content: String(persona.content || '').trim(),
    language: persona.language || fallback.language || null,
    tone: persona.tone || fallback.tone || null,
    length: persona.length || fallback.length || null,
    version: Number(persona.version) || 1,
  }
}

export function createSkillService({
  getSettings = () => ({}),
  ensureLoaded = null,
  saveSettings = null,
} = {}) {
  return {
    listSkills(currentSettings = getSettings()) {
      return getAvailableSkills(currentSettings?.chatUserSkills)
    },

    getPersonaSnapshot(current = getSettings()) {
      current = current || {}
      return createPersonaSnapshot(current.chatGlobalPersona, {
        language: current.summaryLang,
      })
    },

    async saveUserSkills(userSkills) {
      if (ensureLoaded && saveSettings) {
        await ensureLoaded()
        await saveSettings({ chatUserSkills: userSkills })
        return getAvailableSkills(getSettings().chatUserSkills)
      }
      const settingsModule = await import('@/stores/settingsStore.svelte.js')
      await settingsModule.loadSettings()
      await settingsModule.updateSettings({ chatUserSkills: userSkills })
      return getAvailableSkills(settingsModule.settings.chatUserSkills)
    },

    async saveSkill(draft, currentSettings = getSettings()) {
      const validation = validateSkillDraft(draft)
      if (!validation.valid) return validation

      const builtIn = BUILT_IN_SKILLS.find((skill) => skill.id === draft.id)
      const savedSkill = createUserSkill(validation.value)
      const existing = Array.isArray(currentSettings?.chatUserSkills)
        ? currentSettings.chatUserSkills
        : []
      const index = existing.findIndex((skill) => skill.id === savedSkill.id)
      const next = [...existing]
      if (index >= 0) next[index] = savedSkill
      else next.push(savedSkill)
      await this.saveUserSkills(next)
      return {
        valid: true,
        errors: [],
        value: builtIn
          ? { ...builtIn, ...savedSkill, builtIn: true }
          : { ...savedSkill, version: 1, builtIn: false },
      }
    },

    async deleteSkill(id, currentSettings = getSettings()) {
      const builtIn = BUILT_IN_SKILLS.some((skill) => skill.id === id)
      if (builtIn) return this.resetBuiltIn(id, currentSettings)
      const next = (currentSettings?.chatUserSkills || []).filter((skill) => skill.id !== id)
      await this.saveUserSkills(next)
      return true
    },

    async resetBuiltIn(id, currentSettings = getSettings()) {
      const next = (currentSettings?.chatUserSkills || []).filter((skill) => skill.id !== id)
      await this.saveUserSkills(next)
      return BUILT_IN_SKILLS.find((skill) => skill.id === id) || null
    },

    select(skill) {
      return toSkillInvocation(skill)
    },
  }
}

export const skillService = createSkillService()
