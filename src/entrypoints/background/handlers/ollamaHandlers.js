// @ts-nocheck
/**
 * The two messages that reach the Ollama services in `../ollamaService.js`.
 *
 * `UPDATE_OLLAMA_ENDPOINT` is intentionally fire-and-forget (returns
 * `undefined`, never calls `sendResponse`) — same as the `else if` branch it
 * came from.
 */

/**
 * @param {{ollamaApiProxy: import('../ollamaService.js').OllamaApiProxyService,
 *          ollamaCorsService: import('../ollamaService.js').OllamaCorsService}} deps
 */
export function createOllamaHandlers({ ollamaApiProxy, ollamaCorsService }) {
  return {
    OLLAMA_API_REQUEST: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          const result = await ollamaApiProxy.handleApiRequest(
            message.providerId,
            message.settings,
            message.systemInstruction,
            message.userPrompt,
            message.messages,
            message.config
          )
          sendResponse({
            type: 'OLLAMA_API_RESPONSE',
            requestId: message.requestId,
            success: true,
            result,
          })
        } catch (error) {
          sendResponse({
            type: 'OLLAMA_API_ERROR',
            requestId: message.requestId,
            success: false,
            error: {
              message: error.message,
              type: error.type || 'PROXY_ERROR',
            },
          })
        }
      })()
      return true
    },

    UPDATE_OLLAMA_ENDPOINT: (message) => {
      ollamaCorsService.updateEndpoint(message.endpoint)
    },
  }
}
