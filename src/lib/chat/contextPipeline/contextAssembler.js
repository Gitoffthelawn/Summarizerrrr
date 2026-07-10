import {
  buildThinSystemInstruction,
  formatSkillInvocation,
  formatSource,
} from './sourceFormatter.js'

/**
 * Build ephemeral AI SDK messages without mutating stored display records.
 * @param {object} options
 */
export function assembleContext({
  conversation,
  history = [],
  currentUserMessage,
  skillInvocation,
  conversationSources = [],
  attachmentSources = [],
  diagnostics,
}) {
  const persona = conversation?.personaSnapshot?.content || conversation?.persona || ''
  const system = buildThinSystemInstruction(persona)
  const messages = []

  if (conversationSources.length > 0) {
    messages.push({
      role: 'user',
      content: conversationSources
        .map((source) => formatSource(source, source.selectedContent || source.condensedContent || ''))
        .join('\n\n'),
    })
  }

  for (const message of history) {
    if (message.role === 'user' || message.role === 'assistant') {
      messages.push({ role: message.role, content: message.content })
    }
  }

  const currentTurnParts = [
    formatSkillInvocation(skillInvocation),
    ...attachmentSources.map((source) =>
      formatSource(source, source.selectedContent || source.condensedContent || '')
    ),
    `[[CURRENT_USER_REQUEST]]\n${currentUserMessage?.content || ''}\n[[/CURRENT_USER_REQUEST]]`,
  ].filter(Boolean)

  messages.push({ role: 'user', content: currentTurnParts.join('\n\n') })

  return {
    system,
    messages,
    estimatedInputTokens: diagnostics?.estimatedInputTokens || 0,
    includedSourceIds: diagnostics?.includedSourceIds || [],
    droppedSourceIds: diagnostics?.droppedSourceIds || [],
    trimmedTurnCount: diagnostics?.trimmedTurnCount || 0,
    warnings: diagnostics?.warnings || [],
  }
}
