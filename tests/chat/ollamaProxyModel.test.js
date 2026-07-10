import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendMessage: vi.fn() }))

vi.mock('wxt/browser', () => ({
  browser: { runtime: { sendMessage: mocks.sendMessage } },
}))

import { createOllamaProxyModel } from '@/lib/api/ollamaProxyModel.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sendMessage.mockResolvedValue({ success: true, result: 'local answer' })
})

describe('Ollama proxy model', () => {
  it('accepts legacy prompt requests and new message requests without flattening messages', async () => {
    const model = createOllamaProxyModel({ selectedOllamaModel: 'llama-test' })

    await model.generateText({ system: 'System', prompt: 'Legacy prompt' })
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        systemInstruction: 'System',
        userPrompt: 'Legacy prompt',
        messages: undefined,
      })
    )

    const messages = [
      { role: 'user', content: 'First turn' },
      { role: 'assistant', content: 'Second turn' },
    ]
    await model.generateText({ system: 'System', messages })
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        systemInstruction: 'System',
        messages,
        userPrompt: undefined,
      })
    )
  })

  it('returns one complete stream chunk and races the proxy call with abort', async () => {
    const model = createOllamaProxyModel({})
    const streamed = await model.streamText({ prompt: 'Stream request' })
    await expect(Array.fromAsync(streamed.textStream)).resolves.toEqual(['local answer'])

    const controller = new AbortController()
    mocks.sendMessage.mockReturnValue(new Promise(() => {}))
    const request = model.generateText({
      prompt: 'Abort request',
      abortSignal: controller.signal,
    })
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
