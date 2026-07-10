const TRUNCATION_MARKER = '\n[TRUNCATED SOURCE: only the beginning of this source was included]\n'

/** @param {unknown} value */
export function estimateTokens(value) {
  return Math.ceil(String(value || '').length / 4)
}

function selectedSourceContent(source, remainingTokens) {
  const rawContent = source.rawContent || null
  const condensedContent = source.condensedContent || rawContent || ''
  const mustUseCondensed = !source.isActive
  const preferredContent = mustUseCondensed ? condensedContent : rawContent || condensedContent
  const preferredKind = mustUseCondensed || !rawContent ? 'condensed' : 'raw'

  if (estimateTokens(preferredContent) <= remainingTokens) {
    return { content: preferredContent, kind: preferredKind, truncated: false }
  }

  if (!mustUseCondensed && rawContent && estimateTokens(condensedContent) <= remainingTokens) {
    return { content: condensedContent, kind: 'condensed', truncated: false }
  }

  // @tab sources are deliberately dropped rather than partially included. The
  // active source is the only source permitted to consume the remaining budget
  // as a labeled truncation.
  if (!source.isActive || remainingTokens <= estimateTokens(TRUNCATION_MARKER)) {
    return null
  }

  const characterBudget = Math.max(0, (remainingTokens - estimateTokens(TRUNCATION_MARKER)) * 4)
  const sourceText = condensedContent.slice(0, characterBudget)
  if (!sourceText) return null
  return {
    content: `${sourceText}${TRUNCATION_MARKER}`,
    kind: 'condensed',
    truncated: true,
  }
}

/** @param {Array<object>} history */
function groupHistoryIntoTurns(history) {
  const sortedHistory = [...history].sort(
    (left, right) => (left.sequence ?? 0) - (right.sequence ?? 0)
  )
  const groups = []

  for (let index = 0; index < sortedHistory.length; index += 1) {
    const message = sortedHistory[index]
    const next = sortedHistory[index + 1]
    if (message.role === 'user' && next?.role === 'assistant') {
      groups.push([message, next])
      index += 1
    } else {
      // Preserve malformed or partial records as their own unit; never split a
      // well-formed user/assistant pair just to fit a budget.
      groups.push([message])
    }
  }

  return groups
}

/** @param {Array<object>} turn */
function estimateTurnTokens(turn) {
  return turn.reduce((total, message) => total + estimateTokens(message.content), 0)
}

/**
 * Apply deterministic source and history priorities to a context budget.
 * @param {object} options
 * @param {string} options.system
 * @param {object} options.currentUserMessage
 * @param {object | null | undefined} options.skillInvocation
 * @param {Array<object>} options.history
 * @param {Array<object>} options.conversationSources
 * @param {Array<object>} options.attachmentSources
 * @param {number} options.contextWindowTokens
 * @param {number} options.requestedOutputTokens
 */
export function budgetContext({
  system,
  currentUserMessage,
  skillInvocation,
  history = [],
  conversationSources = [],
  attachmentSources = [],
  contextWindowTokens,
  requestedOutputTokens,
}) {
  const inputBudgetTokens = Math.max(0, contextWindowTokens - requestedOutputTokens)
  const currentText = currentUserMessage?.content || ''
  const skillText = skillInvocation?.instructionSnapshot || skillInvocation?.instruction || ''
  let remainingTokens = inputBudgetTokens - estimateTokens(system) - estimateTokens(currentText) - estimateTokens(skillText)
  const warnings = []
  const includedSourceIds = []
  const droppedSourceIds = []
  const budgetedConversationSources = []
  const budgetedAttachmentSources = []

  if (remainingTokens < 0) {
    warnings.push('System persona, skill, and current user request exceed the available input budget.')
    remainingTokens = 0
  }

  const sourceGroups = [
    ...conversationSources.map((source) => ({ source, destination: budgetedConversationSources })),
    ...attachmentSources.map((source) => ({ source, destination: budgetedAttachmentSources })),
  ]

  // Active sources are eligible for raw content and are considered before all
  // @tab sources. Non-active sources are condensed and dropped first.
  sourceGroups.sort((left, right) => Number(right.source.isActive) - Number(left.source.isActive))

  for (const { source, destination } of sourceGroups) {
    const selection = selectedSourceContent(source, remainingTokens)
    const sourceId = String(source.sourceId || source.id)
    if (!selection) {
      droppedSourceIds.push(sourceId)
      warnings.push(`Dropped source ${sourceId} because it did not fit the context budget.`)
      continue
    }

    const tokens = estimateTokens(selection.content)
    remainingTokens -= tokens
    includedSourceIds.push(sourceId)
    if (selection.truncated) {
      warnings.push(`Truncated active source ${sourceId} to fit the context budget.`)
    }
    destination.push({ ...source, selectedContent: selection.content, selectedContentKind: selection.kind, truncated: selection.truncated })
  }

  const historyGroups = groupHistoryIntoTurns(history)
  const retainedHistoryGroups = []
  let trimmedTurnCount = 0

  for (let index = historyGroups.length - 1; index >= 0; index -= 1) {
    const turn = historyGroups[index]
    const turnTokens = estimateTurnTokens(turn)
    if (turnTokens <= remainingTokens) {
      retainedHistoryGroups.unshift(turn)
      remainingTokens -= turnTokens
    } else {
      // Once a newer turn cannot fit, every older turn is removed as a whole
      // unit. This preserves recency and never leaves half of a pair behind.
      trimmedTurnCount += index + 1
      break
    }
  }

  if (trimmedTurnCount > 0) {
    warnings.push(`Trimmed ${trimmedTurnCount} oldest complete conversation turn(s) to fit the context budget.`)
  }

  const retainedHistory = retainedHistoryGroups.flat()
  const estimatedInputTokens = inputBudgetTokens - remainingTokens

  return {
    conversationSources: budgetedConversationSources,
    attachmentSources: budgetedAttachmentSources,
    history: retainedHistory,
    estimatedInputTokens,
    inputBudgetTokens,
    includedSourceIds,
    droppedSourceIds,
    trimmedTurnCount,
    warnings,
  }
}
