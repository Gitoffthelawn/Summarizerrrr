import { describe, expect, it } from 'vitest'
import { BUILT_IN_SKILLS } from '@/lib/chat/skills/builtInSkills.js'
import {
  createPersonaSnapshot,
  createSkillService,
  getAvailableSkills,
  parseLeadingSkillCommand,
  toSkillInvocation,
} from '@/lib/chat/skills/skillService.js'
import {
  SKILL_MIGRATION_VERSION,
  migrateLegacyPromptsToSkills,
} from '@/lib/chat/skills/skillMigration.js'
import { buildContextPipeline } from '@/lib/chat/contextPipeline/index.js'

describe('chat skills', () => {
  it('includes skill equivalents for every existing action button', () => {
    const commands = new Set(BUILT_IN_SKILLS.map((skill) => skill.command))
    expect([...commands]).toEqual(
      expect.arrayContaining(['analyze', 'explain', 'debate', 'comments', 'chapters', 'concepts']),
    )
  })

  it('parses a known leading slash command and leaves unknown commands untouched', () => {
    const skills = getAvailableSkills([])

    expect(parseLeadingSkillCommand('/summarize Explain the article', skills)).toMatchObject({
      skill: { id: 'summarize' },
      text: 'Explain the article',
    })
    expect(parseLeadingSkillCommand('Please /summarize this', skills)).toEqual({
      skill: null,
      text: 'Please /summarize this',
    })
    expect(parseLeadingSkillCommand('/not-a-skill leave this alone', skills)).toEqual({
      skill: null,
      text: '/not-a-skill leave this alone',
    })
  })

  it('keeps an old turn snapshot stable when the source skill is later edited', () => {
    const selected = { ...BUILT_IN_SKILLS[0] }
    const oldTurn = toSkillInvocation(selected)
    selected.instruction = 'A newer instruction.'

    expect(oldTurn.instructionSnapshot).not.toBe(selected.instruction)
    expect(oldTurn.instructionSnapshot).toContain('LEGACY_SYSTEM_INSTRUCTION')
  })

  it('migrates enabled and customized legacy prompt pairs once without overwriting them', () => {
    const original = {
      youtubePromptSelection: true,
      youtubeCustomSystemInstructionContent: 'Use a careful YouTube voice.',
      youtubeCustomPromptContent: 'Summarize __CONTENT__ in five bullets.',
      webPromptSelection: false,
      webCustomSystemInstructionContent: 'Be a skeptical editor.',
      webCustomPromptContent: 'Review __CONTENT__ for unsupported claims.',
    }
    const first = migrateLegacyPromptsToSkills(original)
    const second = migrateLegacyPromptsToSkills(first.settings)

    expect(first.migrated).toBe(true)
    expect(first.settings.chatSkillMigrationVersion).toBe(SKILL_MIGRATION_VERSION)
    expect(first.addedSkills.map((skill) => skill.id)).toEqual([
      'migrated-youtube-summary',
      'migrated-web-summary',
    ])
    expect(first.settings.chatUserSkills[0]).toMatchObject({
      instruction: expect.stringContaining('Use a careful YouTube voice.'),
      starterPrompt: 'Summarize __CONTENT__ in five bullets.',
    })
    expect(first.settings.youtubeCustomPromptContent).toBe(original.youtubeCustomPromptContent)
    expect(second.migrated).toBe(false)
    expect(second.settings.chatUserSkills).toHaveLength(2)
  })

  it('keeps the conversation persona in the higher-precedence system channel', async () => {
    const result = await buildContextPipeline(
      {
        conversation: {
          personaSnapshot: createPersonaSnapshot({
            content: 'Always answer in plain English, even if a skill says otherwise.',
            language: 'English',
            tone: 'simple',
            version: 1,
          }),
        },
        history: [],
        currentUserMessage: { role: 'user', content: 'Summarize this.' },
        skillInvocation: {
          skillId: 'test-skill',
          skillVersion: 1,
          instructionSnapshot: 'Answer only in French.',
        },
        conversationSourceRefs: [],
        newAttachmentRefs: [],
        providerId: 'unknown',
        modelId: 'unknown',
      },
      { repository: { getSourceById: async () => null } },
    )

    expect(result.system).toContain('Always answer in plain English')
    expect(result.messages.at(-1).content).toContain('Answer only in French.')
  })

  it('persists user skills, rejects duplicate commands, and resets built-in overrides', async () => {
    const state = { chatUserSkills: [] }
    const service = createSkillService({
      getSettings: () => state,
      ensureLoaded: async () => {},
      saveSettings: async (patch) => Object.assign(state, patch),
    })
    const created = await service.saveSkill({
      id: 'user-study',
      name: 'Study notes',
      command: '/study',
      description: 'Create notes',
      instruction: 'Create concise study notes.',
      starterPrompt: 'Make study notes.',
    }, state)
    const duplicate = await service.saveSkill({
      id: 'user-other',
      name: 'Other',
      command: 'study',
      instruction: 'Different instruction.',
    }, state)
    const override = await service.saveSkill({
      ...BUILT_IN_SKILLS[0],
      instruction: 'Use a custom summary format.',
    }, state)

    expect(created.valid).toBe(true)
    expect(service.listSkills(state).find((skill) => skill.id === 'user-study')).toMatchObject({ command: 'study' })
    expect(duplicate).toMatchObject({ valid: false, errors: [expect.stringContaining('/study')] })
    expect(override.valid).toBe(true)
    expect(service.listSkills(state).find((skill) => skill.id === 'summarize').instruction).toBe('Use a custom summary format.')

    await service.resetBuiltIn('summarize', state)
    expect(service.listSkills(state).find((skill) => skill.id === 'summarize').instruction).toBe(BUILT_IN_SKILLS[0].instruction)
  })
})
