// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'

// Mock svelte-i18n — same shape as tests/chat/composer/ChatModelSelect.test.svelte.js
vi.mock('svelte-i18n', () => {
  const store = (/** @type {string} */ key, /** @type {object|undefined} */ opts) => {
    let text = opts?.default || key
    if (opts?.values) {
      for (const [k, v] of Object.entries(opts.values)) {
        text = text.replace(`{${k}}`, v)
      }
    }
    return text
  }
  store.subscribe = (/** @type {Function} */ fn) => {
    fn(store)
    return () => {}
  }
  return { _: store }
})

const { default: ChatMessageMeta } = await import(
  '../../src/entrypoints/sidepanel/components/chat/ChatMessageMeta.svelte'
)

function render(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const component = mount(ChatMessageMeta, { target: host, props })
  flushSync()
  return {
    host,
    component,
    trigger: () => host.querySelector('button'),
    // The panel is portalled to <body>, so it is never inside `host`.
    panelText: () => document.body.textContent,
    async destroy() {
      await unmount(component)
      host.remove()
    },
  }
}

function fire(el, type) {
  el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerType: 'mouse' }))
  flushSync()
}

async function tick(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
  flushSync()
}

// Trigger is configured with openDelay={120}; bits-ui waits that long before
// opening on hover.
async function hoverOpen(el) {
  fire(el, 'pointerenter')
  await tick(200)
}

describe('ChatMessageMeta', () => {
  it('renders nothing when there is no metadata at all', async () => {
    const r = render({})
    expect(r.trigger()).toBeNull()
    await r.destroy()
  })

  it('opens on hover and lists model, token and time rows', async () => {
    const r = render({
      modelId: 'deepseek/deepseek-v4-pro',
      usage: { promptTokens: 24374, completionTokens: 1241, cachedInputTokens: 2048 },
      createdAt: '2026-07-30T04:20:00.000Z',
    })

    expect(r.panelText()).not.toContain('24,374')

    await hoverOpen(r.trigger())

    const text = r.panelText()
    expect(text).toContain('Deepseek v4 pro') // formatModelDisplayName
    expect(text).toContain('24,374')
    expect(text).toContain('1,241')
    expect(text).toContain('2,048')

    await r.destroy()
  })

  it('accepts the alternate inputTokens/outputTokens usage shape', async () => {
    const r = render({ usage: { inputTokens: 900, outputTokens: 12 } })
    await hoverOpen(r.trigger())
    expect(r.panelText()).toContain('900')
    expect(r.panelText()).toContain('12')
    await r.destroy()
  })

  it('hides the cache row when nothing was cached', async () => {
    const r = render({ usage: { promptTokens: 100, cachedInputTokens: 0 } })
    await hoverOpen(r.trigger())
    expect(r.panelText()).toContain('Input')
    expect(r.panelText()).not.toContain('Cache')
    await r.destroy()
  })

  it('opens on click alone, for touch and keyboard users', async () => {
    const r = render({ usage: { promptTokens: 4242 } })

    r.trigger().click()
    flushSync()
    expect(r.panelText()).toContain('4,242')

    await r.destroy()
  })

  it('stays open when clicked, even after the pointer leaves', async () => {
    const r = render({ usage: { promptTokens: 4242 } })

    // Hover opens it, then a click converts that into a click-open.
    await hoverOpen(r.trigger())
    r.trigger().click()
    flushSync()

    fire(r.trigger(), 'pointerleave')
    await tick(400) // longer than closeDelay={200}
    expect(r.panelText()).toContain('4,242')

    await r.destroy()
  })
})
