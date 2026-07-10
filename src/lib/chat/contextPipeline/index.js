import { budgetContext } from './contextBudgeter.js'
import { assembleContext } from './contextAssembler.js'
import { getProviderCapabilities } from '../providerCapabilities.js'
import { resolveSources } from './sourceResolver.js'
import { buildThinSystemInstruction } from './sourceFormatter.js'

export { budgetContext } from './contextBudgeter.js'
export { assembleContext } from './contextAssembler.js'
export { resolveSources } from './sourceResolver.js'
export {
  SOURCE_GUARDRAIL,
  buildThinSystemInstruction,
  escapeSourceValue,
  formatSkillInvocation,
  formatSource,
} from './sourceFormatter.js'

/**
 * Resolve, budget, and assemble context using injected persistence/capture
 * dependencies. No Svelte store, browser API, or provider SDK is imported.
 * @param {import('../contracts.js').ContextPipelineInput & object} input
 * @param {object} dependencies
 */
export async function buildContextPipeline(input, dependencies) {
  const sourceResolution = await resolveSources({
    conversationSourceRefs: input.conversationSourceRefs,
    newAttachmentRefs: input.newAttachmentRefs,
    repository: dependencies.repository,
    captureSource: dependencies.captureSource,
  })
  const capabilities = getProviderCapabilities(input.providerId, input.modelId)
  const system = buildThinSystemInstruction(
    input.conversation?.personaSnapshot?.content || input.conversation?.persona || ''
  )
  const budget = budgetContext({
    system,
    currentUserMessage: input.currentUserMessage,
    skillInvocation: input.skillInvocation,
    history: input.history,
    conversationSources: sourceResolution.conversationSources,
    attachmentSources: sourceResolution.attachmentSources,
    contextWindowTokens: capabilities.contextWindowTokens,
    requestedOutputTokens: input.requestedOutputTokens || capabilities.defaultOutputTokens,
  })
  const assembled = assembleContext({
    conversation: input.conversation,
    history: budget.history,
    currentUserMessage: input.currentUserMessage,
    skillInvocation: input.skillInvocation,
    conversationSources: budget.conversationSources,
    attachmentSources: budget.attachmentSources,
    diagnostics: {
      ...budget,
      warnings: [...sourceResolution.warnings, ...budget.warnings],
    },
  })

  return {
    ...assembled,
    capabilities,
    unresolvedRefs: sourceResolution.unresolvedRefs,
  }
}
