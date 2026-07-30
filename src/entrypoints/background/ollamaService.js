// @ts-nocheck
/**
 * Ollama support that only the background service worker can provide:
 *
 * - `OllamaCorsService` installs `declarativeNetRequest` dynamic rules so
 *   requests to a local Ollama endpoint carry a matching `origin` and come back
 *   with permissive CORS headers.
 * - `OllamaApiProxyService` actually *runs* `generateText` here, for contexts
 *   that cannot reach `localhost` themselves.
 *
 * Seam (b) of `docs/refactor/03-god-files.md`.
 */
import { browser } from 'wxt/browser'
import { generateText } from 'ai'
import { getAISDKModel, mapGenerationConfig } from '@/lib/api/aiSdkAdapter.js'

export class OllamaCorsService {
  constructor() {
    this.ruleId = 1001
    this.initialized = false
  }
  async setupOllamaCorsRules(endpoint = 'http://127.0.0.1:11434') {
    if (!browser.declarativeNetRequest) return false
    try {
      const normalizedEndpoint = endpoint.endsWith('/')
        ? endpoint.slice(0, -1)
        : endpoint
      const requestRule = {
        id: this.ruleId,
        priority: 1,
        condition: {
          urlFilter: `${normalizedEndpoint}/*`,
          resourceTypes: ['xmlhttprequest'],
        },
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'origin', operation: 'set', value: normalizedEndpoint },
          ],
        },
      }
      const responseRule = {
        id: this.ruleId + 1,
        priority: 1,
        condition: {
          urlFilter: `${normalizedEndpoint}/*`,
          resourceTypes: ['xmlhttprequest'],
        },
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'Access-Control-Allow-Origin',
              operation: 'set',
              value: '*',
            },
            {
              header: 'Access-Control-Allow-Methods',
              operation: 'set',
              value: 'GET, POST, PUT, DELETE, OPTIONS',
            },
            {
              header: 'Access-Control-Allow-Headers',
              operation: 'set',
              value: 'Content-Type, Authorization',
            },
          ],
        },
      }
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [this.ruleId, this.ruleId + 1],
        addRules: [requestRule, responseRule],
      })
      this.initialized = true
      console.log(
        '[OllamaCorsService] CORS rules setup for:',
        normalizedEndpoint
      )
      return true
    } catch (error) {
      console.error('[OllamaCorsService] Failed to setup CORS rules:', error)
      return false
    }
  }
  async updateEndpoint(newEndpoint) {
    if (!newEndpoint) return false
    return this.setupOllamaCorsRules(newEndpoint)
  }
}

export class OllamaApiProxyService {
  async handleApiRequest(
    providerId,
    settings,
    systemInstruction,
    userPrompt,
    messages,
    requestConfig = {}
  ) {
    try {
      const baseModel = getAISDKModel(providerId, settings)
      const generationConfig = mapGenerationConfig(settings)
      const { providerOptions, tools, ...proxyGenerationConfig } = requestConfig
      const { text } = await generateText({
        model: baseModel,
        instructions: systemInstruction,
        ...(messages ? { messages } : { prompt: userPrompt }),
        ...generationConfig,
        ...proxyGenerationConfig,
        ...(providerOptions && { providerOptions }),
        ...(tools && { tools }),
      })
      return text
    } catch (error) {
      console.error(`[OllamaApiProxy] API request failed:`, error)
      throw error
    }
  }
}
