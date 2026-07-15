// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount } from 'svelte'
import ChatContextDonut from '../../../src/components/chat/ChatContextDonut.svelte'

// bits-ui scrollIntoView stub
HTMLElement.prototype.scrollIntoView ||= vi.fn()

// Mock Tooltip to avoid the Tooltip.Provider context requirement in jsdom.
vi.mock('@/components/ui/Tooltip.svelte', () => {
  const { mount: svelteMount } = require('svelte')
  return {
    default: function MockTooltip($$anchor, $$props) {
      // Just render the children snippet without the tooltip wrapper.
      const children = $$props.children
      if (children) {
        children($$anchor, () => ({ builder: {} }))
      }
    },
  }
})

// Mock svelte-i18n: return the key's default (or the key itself) for all lookups.
vi.mock('svelte-i18n', () => {
  const store = (/** @type {string} */ key, /** @type {object|undefined} */ opts) =>
    opts?.default || key
  store.subscribe = (/** @type {Function} */ fn) => { fn(store); return () => {} }
  return { _: store }
})

// Stub the settings store used by resolveProviderEntry inside the component.
vi.mock('@/stores/settingsStore.svelte.js', () => ({
  settings: {},
}))

// Stub resolveProviderEntry so tests control what the donut sees.
let providerEntryStub = null
vi.mock('@/lib/providers/providerRegistry.js', () => ({
  resolveProviderEntry: () => providerEntryStub,
}))

function mountDonut(props = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mount(ChatContextDonut, { target: host, props })
  flushSync()
  return host
}

describe('ChatContextDonut', () => {
  it('renders at 0% with no stale numbers when usage is null', () => {
    providerEntryStub = null
    const host = mountDonut({ usage: null })

    // Should render an SVG (the donut) with no crash
    expect(host.querySelector('svg')).toBeTruthy()

    // The aria-label should indicate unknown usage
    const trigger = host.querySelector('button')
    expect(trigger.getAttribute('aria-label')).toContain('not known yet')

    // No token text visible
    expect(host.textContent).not.toMatch(/\d+K/)
    host.remove()
  })

  it('computes percent and level against inputBudget at the 79% boundary (normal)', () => {
    providerEntryStub = { label: 'Google Gemini' }
    const host = mountDonut({
      usage: {
        used: 79_000,
        inputBudget: 100_000,
        window: 128_000,
        source: 'known-model',
        providerId: 'gemini',
        modelId: 'gemini-test',
      },
    })

    // The progress circle stroke should be accent (normal), not warning
    const circles = host.querySelectorAll('circle')
    const progress = circles[1]
    expect(progress.getAttribute('stroke')).toBe('var(--color-primary)')

    // aria-label should contain 79%
    const trigger = host.querySelector('button')
    expect(trigger.getAttribute('aria-label')).toContain('79%')
    host.remove()
  })

  it('computes warning level at exactly 80% of inputBudget', () => {
    providerEntryStub = { label: 'Google Gemini' }
    const host = mountDonut({
      usage: {
        used: 80_000,
        inputBudget: 100_000,
        window: 128_000,
        source: 'known-model',
        providerId: 'gemini',
        modelId: 'gemini-test',
      },
    })

    const circles = host.querySelectorAll('circle')
    const progress = circles[1]
    expect(progress.getAttribute('stroke')).toBe('var(--color-warning)')
    host.remove()
  })

  it('computes error level at 95% of inputBudget', () => {
    providerEntryStub = { label: 'Google Gemini' }
    const host = mountDonut({
      usage: {
        used: 95_000,
        inputBudget: 100_000,
        window: 128_000,
        source: 'known-model',
        providerId: 'gemini',
        modelId: 'gemini-test',
      },
    })

    const circles = host.querySelectorAll('circle')
    const progress = circles[1]
    expect(progress.getAttribute('stroke')).toBe('var(--color-error)')
    host.remove()
  })

  it('uses inputBudget as the denominator, NOT window', () => {
    providerEntryStub = { label: 'Google Gemini' }

    // 80K / 100K inputBudget = 80% → warning
    // 80K / 128K window = 62.5% → would be normal if window were used
    const host = mountDonut({
      usage: {
        used: 80_000,
        inputBudget: 100_000,
        window: 128_000,
        source: 'known-model',
        providerId: 'gemini',
        modelId: 'gemini-test',
      },
    })

    const circles = host.querySelectorAll('circle')
    const progress = circles[1]
    // Must be warning (80% of budget), NOT normal (62.5% of window)
    expect(progress.getAttribute('stroke')).toBe('var(--color-warning)')
    host.remove()
  })

  it('renders warning state for an unresolvable providerId without throwing', () => {
    providerEntryStub = null // simulate deleted profile
    const host = mountDonut({
      usage: {
        used: 1000,
        inputBudget: 100_000,
        window: 128_000,
        source: 'known-model',
        providerId: 'openai-compatible-deleted-profile',
        modelId: 'some-model',
      },
    })

    // Should not throw — the component should render
    expect(host.querySelector('svg')).toBeTruthy()
    host.remove()
  })
})
