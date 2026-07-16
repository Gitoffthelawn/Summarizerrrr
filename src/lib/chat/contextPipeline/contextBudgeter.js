import { formatSource, formatSkillInvocation, escapeSourceValue } from './sourceFormatter.js'

const TRUNCATION_MARKER = '\n[TRUNCATED SOURCE: only the beginning of this source was included]\n'

const ESTIMATOR_SAFETY_FRACTION = 0.05

/**
 * Slices withheld from the source allowance. Sources may use everything else.
 *
 * These are source-side reserves, NOT guaranteed floors: they stop sources from
 * eating the slice, but cannot stop an oversized current message from doing so.
 * Phase 4's pre-flight check handles that case.
 *
 * They are constants, and that is load-bearing: the source allowance must depend
 * only on the model's input budget and the (per-conversation stable) system prompt,
 * never on history length or the current question. That keeps the rendered source
 * block byte-identical across turns so provider prompt caching hits the shared
 * prefix. Deriving a reserve from *actual* history or current text breaks the cache
 * every turn.
 *
 * Absolute floor + fraction cap: on a large window the reserve stays a thin slice;
 * on a small window it degrades to a proportion instead of eating the whole budget.
 */
const HISTORY_RESERVE_TOKENS = 8_000
const HISTORY_RESERVE_MAX_FRACTION = 0.25
const CURRENT_TURN_RESERVE_TOKENS = 2_000
const CURRENT_TURN_RESERVE_MAX_FRACTION = 0.1

/**
 * Characters per token, by script. `chars / 4` is calibrated for English and
 * under-estimates CJK by ~4x — the unsafe direction, since an under-estimate
 * becomes a provider 400 while an over-estimate merely drops a source that would
 * have fitted. Bias these constants toward over-estimation.
 *
 * No tokenizer dependency on purpose: the real tokenizer differs per provider
 * (Gemini/Claude/OpenAI all disagree), so a bundled one would be authoritative for
 * at most one of them while costing every user the WASM payload.
 */
const CJK_CHARS_PER_TOKEN = 1
const ACCENTED_LATIN_CHARS_PER_TOKEN = 1.5
const DEFAULT_CHARS_PER_TOKEN = 4

// CJK punctuation, kana, CJK ext-A, unified ideographs, compat ideographs,
// fullwidth forms (escapeSourceValue emits ［［ = U+FF3B here), Hangul.
const CJK_PATTERN =
  /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/g

// Latin-1 Supplement + Latin Extended-A/B (U+00C0–U+024F) and Latin Extended
// Additional (U+1E00–U+1EFF, where Vietnamese lives). Accented Latin costs far more
// than its character count suggests: Vietnamese runs ~26% accented characters, which
// is enough to under-estimate a page by ~1.4x. Also covers de/es/fr (é, ü, ñ).
const ACCENTED_LATIN_PATTERN = /[À-ɏḀ-ỿ]/g

export function estimateTokens(value) {
  const text = String(value || '')
  const cjkCount = (text.match(CJK_PATTERN) || []).length
  const accentedCount = (text.match(ACCENTED_LATIN_PATTERN) || []).length
  const restCount = text.length - cjkCount - accentedCount
  return Math.ceil(
    cjkCount / CJK_CHARS_PER_TOKEN +
      accentedCount / ACCENTED_LATIN_CHARS_PER_TOKEN +
      restCount / DEFAULT_CHARS_PER_TOKEN
  )
}

function selectedSourceContent(source, remainingTokens) {
  // Exact wrapper cost for this source: render it with empty content.
  const wrapperTokens = estimateTokens(formatSource(source, ''))
  const contentAllowance = remainingTokens - wrapperTokens
  if (contentAllowance <= 0) return null   // wrapper alone does not fit → drop

  const rawContent = source.rawContent || null
  const condensedContent = source.condensedContent || null
  const preferredContent = rawContent || condensedContent || ''
  const preferredKind = rawContent ? 'raw' : 'condensed'

  if (estimateTokens(escapeSourceValue(preferredContent)) <= contentAllowance) {
    return { content: preferredContent, kind: preferredKind, truncated: false }
  }

  if (rawContent && condensedContent && estimateTokens(escapeSourceValue(condensedContent)) <= contentAllowance) {
    return { content: condensedContent, kind: 'condensed', truncated: false }
  }

  // @tab sources are deliberately dropped rather than partially included. The
  // active source is the only source permitted to consume the remaining budget
  // as a labeled truncation.
  if (!source.isActive || contentAllowance <= estimateTokens(TRUNCATION_MARKER)) {
    return null
  }

  let characterBudget = Math.max(0, (contentAllowance - estimateTokens(TRUNCATION_MARKER)) * 4)
  const fullText = condensedContent || rawContent || ''
  let sourceText = fullText.slice(0, characterBudget)

  while (sourceText.length > 0 && (estimateTokens(escapeSourceValue(sourceText)) + estimateTokens(TRUNCATION_MARKER)) > contentAllowance) {
    const estimated = estimateTokens(escapeSourceValue(sourceText))
    if (estimated <= 0) break
    const ratio = (contentAllowance - estimateTokens(TRUNCATION_MARKER)) / estimated
    const nextBudget = Math.floor(characterBudget * Math.min(0.99, ratio))
    if (nextBudget >= characterBudget) {
      characterBudget = characterBudget - 1
    } else {
      characterBudget = nextBudget
    }
    if (characterBudget <= 0) {
      sourceText = ''
      break
    }
    sourceText = fullText.slice(0, characterBudget)
  }

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
  const systemTokens = estimateTokens(system)
  const currentText = currentUserMessage?.content || ''
  const skillText = skillInvocation?.instructionSnapshot || skillInvocation?.instruction || ''
  const warnings = []
  const includedSourceIds = []
  const droppedSourceIds = []
  const sourceTokens = {}
  const budgetedConversationSources = []
  const budgetedAttachmentSources = []

  const historyReserve = Math.min(
    HISTORY_RESERVE_TOKENS,
    Math.floor(inputBudgetTokens * HISTORY_RESERVE_MAX_FRACTION)
  )
  const currentTurnReserve = Math.min(
    CURRENT_TURN_RESERVE_TOKENS,
    Math.floor(inputBudgetTokens * CURRENT_TURN_RESERVE_MAX_FRACTION)
  )
  const safetyReserve = Math.floor(inputBudgetTokens * ESTIMATOR_SAFETY_FRACTION)

  // Deterministic source allowance — depends only on the model input budget and
  // the (stable per conversation) system prompt, never on the current turn. This
  // keeps the rendered source block byte-stable across turns so prompt caching
  // hits the shared prefix.
  const sourceBudgetTokens = Math.max(
    0,
    inputBudgetTokens - systemTokens - historyReserve - currentTurnReserve - safetyReserve
  )
  let sourceRemaining = sourceBudgetTokens

  const sourceGroups = [
    ...conversationSources.map((source) => ({ source, destination: budgetedConversationSources })),
    ...attachmentSources.map((source) => ({ source, destination: budgetedAttachmentSources })),
  ].map((group, index) => ({ ...group, index }))

  // Priority decides *what fits*; it must never decide *where a source is rendered*.
  // Render position stays the caller's order so the cached prefix survives the active
  // tab changing between turns.
  const byPriority = [...sourceGroups].sort(
    (left, right) => Number(right.source.isActive) - Number(left.source.isActive)
  )

  const selectedByIndex = new Map()
  for (const { source, index } of byPriority) {
    const selection = selectedSourceContent(source, sourceRemaining)
    if (!selection) {
      selectedByIndex.set(index, null)
      continue
    }

    const tokens = estimateTokens(formatSource(source, selection.content))
    sourceRemaining -= tokens
    selectedByIndex.set(index, {
      selection,
      tokens,
    })
  }

  for (const { source, destination, index } of sourceGroups) {
    const result = selectedByIndex.get(index)
    const sourceId = String(source.sourceId || source.id)
    if (!result) {
      droppedSourceIds.push(sourceId)
      warnings.push({
        code: 'source_dropped',
        params: {
          title: source.title || null,
          sourceId,
        },
      })
      continue
    }

    const { selection, tokens } = result
    includedSourceIds.push(sourceId)
    sourceTokens[sourceId] = tokens
    if (selection.truncated) {
      warnings.push({
        code: 'source_truncated',
        params: {
          title: source.title || null,
          sourceId,
        },
      })
    }
    destination.push({
      ...source,
      selectedContent: selection.content,
      selectedContentKind: selection.kind,
      truncated: selection.truncated,
    })
  }

  const sourcesUsedTokens = sourceBudgetTokens - sourceRemaining

  // History and the current turn draw from what the budget has left after the
  // fixed source allowance. Trimming history here can never alter the cached
  // source prefix above.
  const currentRequestText = `[[CURRENT_USER_REQUEST]]\n${currentText}\n[[/CURRENT_USER_REQUEST]]`
  const formattedSkillText = formatSkillInvocation(skillInvocation)
  const minimumRequired =
    systemTokens +
    estimateTokens(currentRequestText) +
    estimateTokens(formattedSkillText) +
    safetyReserve

  if (minimumRequired > inputBudgetTokens) {
    return {
      conversationSources: budgetedConversationSources,
      attachmentSources: budgetedAttachmentSources,
      history: [],
      estimatedInputTokens: inputBudgetTokens,
      inputBudgetTokens,
      includedSourceIds,
      droppedSourceIds,
      sourceTokens,
      trimmedTurnCount: 0,
      warnings,
      rejected: {
        code: 'input_too_large',
        params: {
          minimumRequired,
          inputBudgetTokens,
        },
      },
    }
  }

  let remainingTokens = inputBudgetTokens - minimumRequired - sourcesUsedTokens
  if (remainingTokens < 0) {
    remainingTokens = 0
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
    warnings.push({
      code: 'history_trimmed',
      params: {
        count: trimmedTurnCount,
      },
    })
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
    sourceTokens,
    trimmedTurnCount,
    warnings,
  }
}
