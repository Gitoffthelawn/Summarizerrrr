/**
 * Shared chat data contracts.
 *
 * The project is JavaScript-first, so these JSDoc typedefs are the source of
 * truth until the chat layer is migrated to TypeScript.
 */

/**
 * @typedef {object} GenerationRequest
 * @property {string} providerId
 * @property {object} settings
 * @property {string | undefined} [system]
 * @property {string | undefined} [prompt]
 * @property {Array<object> | undefined} [messages]
 * @property {object | undefined} [tools]
 * @property {object | undefined} [providerOptions]
 * @property {AbortSignal | undefined} [abortSignal]
 * @property {string | undefined} [reasoning] - AI SDK portable reasoning level
 *   (e.g. 'provider-default', 'low', 'medium', 'high'). When present the adapter
 *   suppresses legacy Gemini thinking injection.
 */

/**
 * @typedef {object} ContextPipelineInput
 * @property {object} conversation
 * @property {Array<object>} history
 * @property {object} currentUserMessage
 * @property {object | null} [skillInvocation]
 * @property {Array<string | object>} [conversationSourceRefs]
 * @property {Array<string | object>} [newAttachmentRefs]
 * @property {string} providerId
 * @property {string | null} [modelId]
 * @property {number | undefined} [requestedOutputTokens]
 */

/**
 * @typedef {object} ConversationRecord
 * @property {string} id
 * @property {string} title
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} archived
 * @property {string[]} tags
 * @property {{content: string, language: string, tone: string | null, version: number}} personaSnapshot
 * @property {string} providerId
 * @property {string | null} modelId
 * @property {boolean} deleted
 * @property {string | null} deletedAt
 */

/**
 * @typedef {object} ConversationMessageRecord
 * @property {string} id
 * @property {string} conversationId
 * @property {number} sequence
 * @property {'user' | 'assistant'} role
 * @property {string} content
 * @property {string} createdAt
 * @property {'complete' | 'aborted' | 'error'} status
 * @property {{skillId: string, skillVersion: number, instructionSnapshot: string} | null} skillInvocation
 * @property {string[]} attachmentRefs
 * @property {string | null} providerId
 * @property {string | null} modelId
 * @property {object | null} usage
 * @property {object | null} error
 * @property {string | undefined} [reasoningLevel] - Snapshot of the reasoning
 *   level applied when this user message was sent. One of the four V1 values
 *   ('provider-default', 'low', 'medium', 'high'). Missing on older records
 *   (treated as 'provider-default').
 */

/**
 * @typedef {object} ConversationSourceRecord
 * @property {string} id
 * @property {string} sourceKey
 * @property {string} normalizedUrl
 * @property {string} url
 * @property {string} title
 * @property {'webpage' | 'youtube' | 'course' | 'youtubeTranscript' | 'youtubeComments' | 'courseTranscript' | 'selectedText'} sourceType
 * @property {string} capturedAt
 * @property {string} contentHash
 * @property {string} condensedContent
 * @property {number} condensationVersion
 * @property {string} condensationLanguage
 * @property {number} originalLength
 * @property {number | null} tabIdHint
 */

/**
 * @typedef {object} ContextAssemblyDiagnostics
 * @property {number} estimatedInputTokens
 * @property {string[]} includedSourceIds
 * @property {string[]} droppedSourceIds
 * @property {number} trimmedTurnCount
 * @property {string[]} warnings
 */

/**
 * @typedef {object} ChatSkill
 * @property {string} id
 * @property {number} version
 * @property {string} name
 * @property {string} instruction
 * @property {boolean} pinned
 * @property {boolean} builtIn
 * @property {'auto' | 'webpage' | 'youtubeTranscript' | 'youtubeComments' | 'courseTranscript'} [sourceMode]
 *   Declares the source kind this skill prefers. Defaults to `'auto'` when
 *   absent — the capture engine resolves the kind from the page type.
 */

export {}
