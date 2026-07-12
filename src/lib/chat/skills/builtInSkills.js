import { customActionTemplates } from '@/lib/prompts/index.js'
import { generalSummary } from '@/lib/prompts/templates/general.js'
import { youtubeChapter } from '@/lib/prompts/templates/youtube.js'
import { courseConcepts } from '@/lib/prompts/templates/course.js'
import { systemInstructions } from '@/lib/prompts/systemInstructions.js'
import { replacePlaceholders } from '@/lib/prompts/utils.js'

const ACTIVE_SOURCE_PLACEHOLDER = 'the grounded source context supplied with this chat turn'

function skillInstruction(systemPrompt, userPrompt) {
  return [
    'Apply the following one-shot task to the current request only. The global persona and system instructions take precedence.',
    '',
    '[[LEGACY_SYSTEM_INSTRUCTION]]',
    String(systemPrompt || '').trim(),
    '[[/LEGACY_SYSTEM_INSTRUCTION]]',
    '',
    '[[TASK_TEMPLATE]]',
    userPrompt
      .replace(/__CONTENT__/g, ACTIVE_SOURCE_PLACEHOLDER)
      .replace(/<INPUT_CONTENT>/g, ACTIVE_SOURCE_PLACEHOLDER)
      .trim(),
    '[[/TASK_TEMPLATE]]',
  ].join('\n')
}

function templateInstruction(template) {
  return skillInstruction(template.systemPrompt, template.userPrompt)
}

const summarizeInstruction = skillInstruction(
  generalSummary.systemInstruction,
  replacePlaceholders(generalSummary.userPrompt, 'the language set in the global persona', 'long', 'simple'),
)

/**
 * Code-owned, versioned skills. User edits are stored as separate overrides
 * rather than mutating this registry.
 */
export const BUILT_IN_SKILLS = Object.freeze([
  {
    id: 'summarize',
    version: 1,
    name: 'Summarize',
    instruction: summarizeInstruction,
    pinned: true,
  },
  {
    id: 'analyze',
    version: 1,
    name: 'Analyze',
    instruction: templateInstruction(customActionTemplates.analyze),
    pinned: true,
  },
  {
    id: 'explain',
    version: 1,
    name: 'Explain',
    instruction: templateInstruction(customActionTemplates.explain),
    pinned: true,
  },
  {
    id: 'debate',
    version: 1,
    name: 'Debate',
    instruction: templateInstruction(customActionTemplates.debate),
    pinned: false,
  },
  {
    id: 'translate',
    version: 1,
    name: 'Translate',
    instruction:
      'Translate the relevant grounded source content faithfully. Preserve structure, names, links, technical terms where useful, and any uncertainty. Ask the user for a target language only when it is not clear from the current request or global persona.',
    pinned: false,
  },
  {
    id: 'comment-analysis',
    version: 1,
    name: 'Comment Analysis',
    instruction: templateInstruction(customActionTemplates.commentAnalysis),
    pinned: false,
  },
  {
    id: 'chapter-summary',
    version: 1,
    name: 'Chapter Summary',
    instruction: skillInstruction(systemInstructions.chapter, youtubeChapter.userPrompt),
    pinned: false,
  },
  {
    id: 'course-concepts',
    version: 1,
    name: 'Course Concepts',
    instruction: skillInstruction(courseConcepts.systemInstruction, courseConcepts.userPrompt),
    pinned: false,
  },
])

export function getBuiltInSkill(id) {
  return BUILT_IN_SKILLS.find((skill) => skill.id === id) || null
}
