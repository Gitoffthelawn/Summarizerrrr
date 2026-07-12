/**
 * Chat-native skill instructions.
 *
 * Each instruction focuses on the task objective and semantic guidance.
 * Formatting is handled by DEFAULT_RESPONSE_BEHAVIOR in the system prompt;
 * skills only add formatting rules when they are semantically meaningful
 * (e.g. timestamp placement in chapter summaries).
 *
 * Legacy summarize-era templates (general.js, youtube.js, course.js, etc.)
 * remain untouched and are still used by the old summarize flow.
 */

const SKILL_INSTRUCTIONS = {
  summarize: `Summarize the grounded source content comprehensively and faithfully.
Capture all key points, important details, arguments, and conclusions.
Adapt depth to the source length — long or dense content deserves thorough coverage; short content gets a focused summary.
Include a Key Takeaways section highlighting the most important insights.
If community comments or discussions are present, summarize notable reactions separately.`,

  analyze: `Analyze the grounded source content with depth and critical thinking.
Provide both an objective summary of the content AND an expert analysis that covers:
- Bias and perspective: author framing, agenda, or slant
- Patterns and connections: recurring themes, contradictions, correlations
- Evidence quality and internal consistency: claims that cannot be verified from the source alone must be noted as "externally unverified" rather than affirmed or denied
- Context: how this fits broader trends in the relevant field
- What the reader should know: missing context, important caveats, questions worth exploring`,

  explain: `Explain the grounded source content in a way that is easy to understand.
Break complex ideas into logical parts, progressing from simple to advanced.
Use familiar analogies, real-world examples, and concrete illustrations.
Highlight key takeaways and mental models the reader should remember.`,

  debate: `Examine the grounded source content from two opposing perspectives — arguments for and against.
Present both sides with equal depth using evidence and examples when available.
Identify assumptions and biases underlying each position.
Note which aspects need more evidence or remain unresolved.
Stay neutral — do not take a side.`,

  commentAnalysis: `Analyze the provided comments/discussion and provide:
- Overall sentiment summary (positive/neutral/negative balance)
- Main topics and themes being discussed
- Notable comments worth highlighting (use engagement metadata such as likes or reply count when the source provides it)
Focus on patterns across multiple comments, not isolated opinions.
Ignore spam or low-quality remarks.`,

  chapterSummary: `Analyze the video transcript and create detailed chapter-by-chapter summaries.
CRITICAL: Preserve timestamps that exist in the transcript — include the start timestamp (e.g. [00:00], [3:45]) in each chapter heading. Never fabricate timestamps that are not present in the source.
For each chapter: summarize key points, preserve important examples/stories/data, and note practical takeaways.
Maintain chronological order from the transcript.`,

  courseConcepts: `Identify and explain the key technical concepts from the educational content.
Categorize concepts by importance:
- 🔥 Core Concepts: fundamental ideas requiring deep explanation with how-it-works, examples, and common pitfalls
- ⭐ Important Concepts: key supporting ideas with definitions and practical relevance
- 📚 Supporting Concepts: additional terms worth knowing with brief definitions
Prioritise the grounded transcript as the primary source. Professional knowledge may be used to enrich explanations, but must be clearly distinguished from what the source states.
Show relationships between concepts to build a learning roadmap.`,
}

/**
 * Code-owned, versioned skills. User edits are stored as separate overrides
 * rather than mutating this registry.
 */
export const BUILT_IN_SKILLS = Object.freeze([
  {
    id: 'summarize',
    version: 2,
    name: 'Summarize',
    instruction: SKILL_INSTRUCTIONS.summarize,
    pinned: true,
  },
  {
    id: 'analyze',
    version: 2,
    name: 'Analyze',
    instruction: SKILL_INSTRUCTIONS.analyze,
    pinned: true,
  },
  {
    id: 'explain',
    version: 2,
    name: 'Explain',
    instruction: SKILL_INSTRUCTIONS.explain,
    pinned: true,
  },
  {
    id: 'debate',
    version: 2,
    name: 'Debate',
    instruction: SKILL_INSTRUCTIONS.debate,
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
    version: 2,
    name: 'Comment Analysis',
    instruction: SKILL_INSTRUCTIONS.commentAnalysis,
    pinned: false,
  },
  {
    id: 'chapter-summary',
    version: 2,
    name: 'Chapter Summary',
    instruction: SKILL_INSTRUCTIONS.chapterSummary,
    pinned: false,
  },
  {
    id: 'course-concepts',
    version: 2,
    name: 'Course Concepts',
    instruction: SKILL_INSTRUCTIONS.courseConcepts,
    pinned: false,
  },
])

export function getBuiltInSkill(id) {
  return BUILT_IN_SKILLS.find((skill) => skill.id === id) || null
}
