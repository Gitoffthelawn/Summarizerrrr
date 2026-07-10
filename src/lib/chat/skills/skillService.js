import { BUILT_IN_SKILLS } from './builtInSkills.js'
import { generateUUID } from '@/lib/utils/utils.js'

export function normalizeSkillCommand(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+/, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
}

function copySkill(skill) {
  return { ...skill, command: normalizeSkillCommand(skill.command) }
}

export function getAvailableSkills(userSkills = []) {
  const overrides = new Map(
    (Array.isArray(userSkills) ? userSkills : [])
      .filter((skill) => skill?.id)
      .map((skill) => [skill.id, copySkill(skill)]),
  )
  const builtIns = BUILT_IN_SKILLS.map((skill) => overrides.get(skill.id) || copySkill(skill))
  const custom = [...overrides.values()].filter((skill) => !BUILT_IN_SKILLS.some((builtIn) => builtIn.id === skill.id))
  return [...builtIns, ...custom]
    .filter((skill) => skill.enabled !== false)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.name.localeCompare(b.name))
}

export function toSkillInvocation(skill) {
  if (!skill) return null
  return {
    skillId: skill.id,
    skillVersion: skill.version || 1,
    instructionSnapshot: String(skill.instruction || ''),
    name: skill.name,
    command: normalizeSkillCommand(skill.command),
  }
}

/** Parse a slash command only when it is the first token of the composer. */
export function parseLeadingSkillCommand(text, skills) {
  const input = String(text || '')
  const match = input.match(/^\/([^\s/]+)(?=\s|$)/)
  if (!match) return { skill: null, text: input }
  const command = normalizeSkillCommand(match[1])
  const skill = (skills || []).find((candidate) => normalizeSkillCommand(candidate.command) === command)
  if (!skill) return { skill: null, text: input }
  return { skill, text: input.slice(match[0].length).replace(/^\s+/, '') }
}

export function validateSkillDraft(draft, skills = []) {
  const name = String(draft?.name || '').trim()
  const instruction = String(draft?.instruction || '').trim()
  const command = normalizeSkillCommand(draft?.command)
  const errors = []
  if (!name) errors.push('A skill name is required.')
  if (!instruction) errors.push('An instruction is required.')
  if (!command) errors.push('A slash command is required.')

  const duplicate = skills.find(
    (skill) =>
      skill.id !== draft?.id && normalizeSkillCommand(skill.command) === command,
  )
  if (duplicate) errors.push(`/${command} is already used by ${duplicate.name}.`)
  return { valid: errors.length === 0, errors, value: { ...draft, name, instruction, command } }
}

export function createUserSkill(draft = {}) {
  return {
    id: draft.id || `user-${generateUUID()}`,
    version: Number(draft.version) || 1,
    name: String(draft.name || '').trim(),
    description: String(draft.description || '').trim(),
    command: normalizeSkillCommand(draft.command),
    instruction: String(draft.instruction || '').trim(),
    starterPrompt: String(draft.starterPrompt || ''),
    pinned: Boolean(draft.pinned),
    builtIn: false,
    enabled: draft.enabled !== false,
  }
}

export function createPersonaSnapshot(chatGlobalPersona, fallback = {}) {
  const persona = chatGlobalPersona || {}
  return {
    content: String(persona.content || '').trim(),
    language: String(persona.language || fallback.language || 'English'),
    tone: persona.tone || fallback.tone || null,
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
        tone: current.summaryTone,
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
      const allSkills = this.listSkills(currentSettings)
      const validation = validateSkillDraft(draft, allSkills)
      if (!validation.valid) return validation

      const builtIn = BUILT_IN_SKILLS.some((skill) => skill.id === draft.id)
      const savedSkill = builtIn
        ? { ...validation.value, builtIn: true, enabled: validation.value.enabled !== false }
        : createUserSkill(validation.value)
      const existing = Array.isArray(currentSettings?.chatUserSkills)
        ? currentSettings.chatUserSkills
        : []
      const index = existing.findIndex((skill) => skill.id === savedSkill.id)
      const next = [...existing]
      if (index >= 0) next[index] = savedSkill
      else next.push(savedSkill)
      await this.saveUserSkills(next)
      return { valid: true, errors: [], value: savedSkill }
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

    parseComposerCommand(text, currentSettings = getSettings()) {
      return parseLeadingSkillCommand(text, this.listSkills(currentSettings))
    },
  }
}

export const skillService = createSkillService()
