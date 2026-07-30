export const SKILL_MIGRATION_VERSION = 2
const LEGACY_PROMPT_MIGRATION_VERSION = 1

const DEFAULT_SYSTEM_INSTRUCTION = 'You are an AI assistant.'
const DEFAULT_SUMMARY_PROMPT = 'Summarize content, format by ## and ###: __CONTENT__'

const LEGACY_PROMPT_CONFIGS = [
  { id: 'youtube-summary', name: 'YouTube Summary', prefix: 'youtube', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'chapter-summary', name: 'Chapter Summary', prefix: 'chapter', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'web-summary', name: 'Web Summary', prefix: 'web', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'course-summary', name: 'Course Summary', prefix: 'courseSummary', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'course-concepts', name: 'Course Concepts', prefix: 'courseConcepts', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'selected-text', name: 'Selected Text', prefix: 'selectedText', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'analyze', name: 'Analyze', prefix: 'analyze', defaultPrompt: '' },
  { id: 'explain', name: 'Explain', prefix: 'explain', defaultPrompt: '' },
  { id: 'debate', name: 'Debate', prefix: 'debate', defaultPrompt: '' },
  { id: 'comment-analysis', name: 'Comment Analysis', prefix: 'comment', defaultPrompt: '' },
]

function hasMeaningfulCustomization(systemInstruction, prompt, config) {
  return (
    (systemInstruction && systemInstruction.trim() !== DEFAULT_SYSTEM_INSTRUCTION) ||
    (prompt && prompt.trim() !== config.defaultPrompt)
  )
}

function compactSkill(skill = {}) {
  return {
    id: skill.id,
    name: String(skill.name || '').trim(),
    instruction: String(skill.instruction || '').trim(),
    pinned: Boolean(skill.pinned),
  }
}

function legacySkill(config, systemInstruction, promptTemplate) {
  return compactSkill({
    id: `migrated-${config.id}`,
    name: `${config.name} (legacy custom prompt)`,
    instruction: [
      'Apply this migrated legacy custom prompt to the current chat turn only. The global persona takes precedence.',
      '',
      '[[LEGACY_CUSTOM_SYSTEM_INSTRUCTION]]',
      systemInstruction || '',
      '[[/LEGACY_CUSTOM_SYSTEM_INSTRUCTION]]',
      '',
      '[[TASK_TEMPLATE]]',
      promptTemplate || '',
      '[[/TASK_TEMPLATE]]',
    ].join('\n'),
    pinned: false,
  })
}

/**
 * Returns a new settings object only when an upgrade is necessary. Old prompt
 * settings remain untouched so the legacy surface stays reversible.
 */
export function migrateLegacyPromptsToSkills(settings = {}) {
  const existingSkills = (Array.isArray(settings.chatUserSkills) ? settings.chatUserSkills : [])
    .filter((skill) => skill?.id)
    .map(compactSkill)
  if (settings.chatSkillMigrationVersion >= SKILL_MIGRATION_VERSION) {
    return { settings, migrated: false, addedSkills: [] }
  }

  const existingIds = new Set(existingSkills.map((skill) => skill.id))
  const addedSkills = []
  if ((settings.chatSkillMigrationVersion || 0) < LEGACY_PROMPT_MIGRATION_VERSION) {
    for (const config of LEGACY_PROMPT_CONFIGS) {
      const selected = Boolean(settings[`${config.prefix}PromptSelection`])
      const systemInstruction = String(settings[`${config.prefix}CustomSystemInstructionContent`] || '')
      const promptTemplate = String(settings[`${config.prefix}CustomPromptContent`] || '')
      if (!selected && !hasMeaningfulCustomization(systemInstruction, promptTemplate, config)) continue

      const skill = legacySkill(config, systemInstruction, promptTemplate)
      if (!existingIds.has(skill.id)) {
        existingIds.add(skill.id)
        addedSkills.push(skill)
      }
    }
  }

  return {
    settings: {
      ...settings,
      chatUserSkills: [...existingSkills, ...addedSkills],
      chatSkillMigrationVersion: SKILL_MIGRATION_VERSION,
    },
    migrated: true,
    addedSkills,
  }
}
