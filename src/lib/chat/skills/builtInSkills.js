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
    description: 'Create a structured summary of the active page.',
    command: 'summarize',
    instruction: summarizeInstruction,
    starterPrompt: 'Summarize this page.',
    pinned: true,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'analyze',
    version: 1,
    name: 'Analyze',
    description: 'Examine evidence, patterns, bias, and implications.',
    command: 'analyze',
    instruction: templateInstruction(customActionTemplates.analyze),
    starterPrompt: 'Analyze this page.',
    pinned: true,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'explain',
    version: 1,
    name: 'Explain',
    description: 'Explain the active page clearly and step by step.',
    command: 'explain',
    instruction: templateInstruction(customActionTemplates.explain),
    starterPrompt: 'Explain this page simply.',
    pinned: true,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'debate',
    version: 1,
    name: 'Debate',
    description: 'Present balanced arguments for and against.',
    command: 'debate',
    instruction: templateInstruction(customActionTemplates.debate),
    starterPrompt: 'Present the strongest arguments for and against this page.',
    pinned: false,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'translate',
    version: 1,
    name: 'Translate',
    description: 'Translate the relevant page content into the requested language.',
    command: 'translate',
    instruction:
      'Translate the relevant grounded source content faithfully. Preserve structure, names, links, technical terms where useful, and any uncertainty. Ask the user for a target language only when it is not clear from the current request or global persona.',
    starterPrompt: 'Translate this page into ',
    pinned: false,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'comment-analysis',
    version: 1,
    name: 'Comment Analysis',
    description: 'Analyze audience sentiment and recurring discussion themes.',
    command: 'comments',
    instruction: templateInstruction(customActionTemplates.commentAnalysis),
    starterPrompt: 'Analyze the comments on this page.',
    pinned: false,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'chapter-summary',
    version: 1,
    name: 'Chapter Summary',
    description: 'Organize a YouTube video into detailed chapter summaries.',
    command: 'chapters',
    instruction: skillInstruction(systemInstructions.chapter, youtubeChapter.userPrompt),
    starterPrompt: 'Create chapter summaries for this video.',
    pinned: false,
    builtIn: true,
    enabled: true,
  },
  {
    id: 'course-concepts',
    version: 1,
    name: 'Course Concepts',
    description: 'Extract and explain the key concepts in this course material.',
    command: 'concepts',
    instruction: skillInstruction(courseConcepts.systemInstruction, courseConcepts.userPrompt),
    starterPrompt: 'Extract the key concepts from this course material.',
    pinned: false,
    builtIn: true,
    enabled: true,
  },
])

export function getBuiltInSkill(id) {
  return BUILT_IN_SKILLS.find((skill) => skill.id === id) || null
}
