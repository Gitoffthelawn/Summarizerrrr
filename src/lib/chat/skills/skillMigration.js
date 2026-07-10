export const SKILL_MIGRATION_VERSION = 1

const DEFAULT_SYSTEM_INSTRUCTION = 'You are an AI assistant.'
const DEFAULT_SUMMARY_PROMPT = 'Summarize content, format by ## and ###: __CONTENT__'

const LEGACY_PROMPT_CONFIGS = [
  { id: 'youtube-summary', name: 'YouTube Summary', command: 'youtube-summary', prefix: 'youtube', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'chapter-summary', name: 'Chapter Summary', command: 'chapters', prefix: 'chapter', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'web-summary', name: 'Web Summary', command: 'web-summary', prefix: 'web', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'course-summary', name: 'Course Summary', command: 'course-summary', prefix: 'courseSummary', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'course-concepts', name: 'Course Concepts', command: 'course-concepts', prefix: 'courseConcepts', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'selected-text', name: 'Selected Text', command: 'selected-text', prefix: 'selectedText', defaultPrompt: DEFAULT_SUMMARY_PROMPT },
  { id: 'analyze', name: 'Analyze', command: 'analyze', prefix: 'analyze', defaultPrompt: '' },
  { id: 'explain', name: 'Explain', command: 'explain', prefix: 'explain', defaultPrompt: '' },
  { id: 'debate', name: 'Debate', command: 'debate', prefix: 'debate', defaultPrompt: '' },
  { id: 'comment-analysis', name: 'Comment Analysis', command: 'comments', prefix: 'comment', defaultPrompt: '' },
]

function hasMeaningfulCustomization(systemInstruction, prompt, config) {
  return (
    (systemInstruction && systemInstruction.trim() !== DEFAULT_SYSTEM_INSTRUCTION) ||
    (prompt && prompt.trim() !== config.defaultPrompt)
  )
}

function legacySkill(config, systemInstruction, starterPrompt) {
  return {
    id: `migrated-${config.id}`,
    version: 1,
    name: `${config.name} (legacy custom prompt)`,
    description: 'Migrated from the legacy per-content prompt settings.',
    command: config.command,
    instruction: [
      'Apply this migrated legacy custom prompt to the current chat turn only. The global persona takes precedence.',
      '',
      '[[LEGACY_CUSTOM_SYSTEM_INSTRUCTION]]',
      systemInstruction || '',
      '[[/LEGACY_CUSTOM_SYSTEM_INSTRUCTION]]',
    ].join('\n'),
    // Keep the legacy template verbatim for a later editor migration and for
    // users who relied on placeholders such as __CONTENT__.
    starterPrompt: starterPrompt || '',
    pinned: false,
    builtIn: false,
    enabled: true,
    migratedFrom: config.prefix,
  }
}

/**
 * Returns a new settings object only when an upgrade is necessary. Old prompt
 * settings remain untouched so the legacy surface stays reversible.
 */
export function migrateLegacyPromptsToSkills(settings = {}) {
  const existingSkills = Array.isArray(settings.chatUserSkills) ? settings.chatUserSkills : []
  if (settings.chatSkillMigrationVersion >= SKILL_MIGRATION_VERSION) {
    return { settings, migrated: false, addedSkills: [] }
  }

  const existingIds = new Set(existingSkills.map((skill) => skill.id))
  const addedSkills = []
  for (const config of LEGACY_PROMPT_CONFIGS) {
    const selected = Boolean(settings[`${config.prefix}PromptSelection`])
    const systemInstruction = String(settings[`${config.prefix}CustomSystemInstructionContent`] || '')
    const starterPrompt = String(settings[`${config.prefix}CustomPromptContent`] || '')
    if (!selected && !hasMeaningfulCustomization(systemInstruction, starterPrompt, config)) continue

    const skill = legacySkill(config, systemInstruction, starterPrompt)
    if (!existingIds.has(skill.id)) {
      existingIds.add(skill.id)
      addedSkills.push(skill)
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
