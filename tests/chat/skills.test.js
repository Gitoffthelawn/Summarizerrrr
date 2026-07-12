import { describe, expect, it } from 'vitest'
import { BUILT_IN_SKILLS } from '@/lib/chat/skills/builtInSkills.js'
import {
  createPersonaSnapshot,
  createSkillService,
  getAvailableSkills,
  toSkillInvocation,
} from '@/lib/chat/skills/skillService.js'
import {
  SKILL_MIGRATION_VERSION,
  migrateLegacyPromptsToSkills,
} from '@/lib/chat/skills/skillMigration.js'
import { buildContextPipeline } from '@/lib/chat/contextPipeline/index.js'

describe('chat skills', () => {
  it('exposes built-in skills without deprecated command or prompt metadata', () => {
    const skills = getAvailableSkills([])

    expect(skills.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['analyze', 'explain', 'debate', 'comment-analysis', 'chapter-summary', 'course-concepts']),
    )
    expect(skills[0]).not.toHaveProperty('command')
    expect(skills[0]).not.toHaveProperty('description')
    expect(skills[0]).not.toHaveProperty('starterPrompt')
    expect(skills[0]).not.toHaveProperty('enabled')
  })

  it('keeps an old turn snapshot stable when the source skill is later edited', () => {
    const selected = { ...BUILT_IN_SKILLS[0] }
    const oldTurn = toSkillInvocation(selected)
    selected.instruction = 'A newer instruction.'

    expect(oldTurn.instructionSnapshot).not.toBe(selected.instruction)
    expect(oldTurn.instructionSnapshot).toContain('LEGACY_SYSTEM_INSTRUCTION')
  })

  it('migrates customized legacy prompt pairs into one-shot instructions once', () => {
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
    })
    expect(first.settings.chatUserSkills[0].instruction).toContain('Summarize __CONTENT__ in five bullets.')
    expect(first.settings.chatUserSkills[0]).toEqual({
      id: 'migrated-youtube-summary',
      name: 'YouTube Summary (legacy custom prompt)',
      instruction: expect.any(String),
      pinned: false,
    })
    expect(first.settings.youtubeCustomPromptContent).toBe(original.youtubeCustomPromptContent)
    expect(second.migrated).toBe(false)
    expect(second.settings.chatUserSkills).toHaveLength(2)
  })

  it('compacts previously stored skills while preserving pin state', () => {
    const original = {
      chatSkillMigrationVersion: 1,
      chatUserSkills: [{
        id: 'user-study',
        version: 4,
        name: ' Study notes ',
        description: 'Old description',
        command: 'study',
        instruction: ' Create notes. ',
        starterPrompt: 'Start studying.',
        pinned: true,
        builtIn: false,
        enabled: false,
        migratedFrom: 'study',
      }],
    }

    const first = migrateLegacyPromptsToSkills(original)
    const second = migrateLegacyPromptsToSkills(first.settings)

    expect(first.settings.chatUserSkills).toEqual([{
      id: 'user-study',
      name: 'Study notes',
      instruction: 'Create notes.',
      pinned: true,
    }])
    expect(second.migrated).toBe(false)
    expect(second.settings).toBe(first.settings)
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

  it('persists compact user skills, allows duplicate names, and resets built-in overrides', async () => {
    const state = { chatUserSkills: [] }
    const service = createSkillService({
      getSettings: () => state,
      ensureLoaded: async () => {},
      saveSettings: async (patch) => Object.assign(state, patch),
    })
    const created = await service.saveSkill({
      id: 'user-study',
      name: 'Study notes',
      instruction: 'Create concise study notes.',
      pinned: true,
    }, state)
    const duplicate = await service.saveSkill({
      id: 'user-other',
      name: 'Study notes',
      instruction: 'Different instruction.',
    }, state)
    const invalid = await service.saveSkill({
      id: 'user-invalid',
      name: '   ',
      instruction: '',
    }, state)
    const override = await service.saveSkill({
      ...BUILT_IN_SKILLS[0],
      instruction: 'Use a custom summary format.',
    }, state)

    expect(created.valid).toBe(true)
    expect(state.chatUserSkills.find((skill) => skill.id === 'user-study')).toEqual({
      id: 'user-study',
      name: 'Study notes',
      instruction: 'Create concise study notes.',
      pinned: true,
    })
    expect(duplicate.valid).toBe(true)
    expect(invalid).toEqual({
      valid: false,
      errors: ['A skill name is required.', 'An instruction is required.'],
      value: expect.any(Object),
    })
    expect(override.valid).toBe(true)
    expect(service.listSkills(state).find((skill) => skill.id === 'summarize').instruction).toBe('Use a custom summary format.')

    await service.resetBuiltIn('summarize', state)
    expect(service.listSkills(state).find((skill) => skill.id === 'summarize').instruction).toBe(BUILT_IN_SKILLS[0].instruction)
  })
})
