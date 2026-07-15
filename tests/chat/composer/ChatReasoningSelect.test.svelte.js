// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushSync, mount } from 'svelte'
import ChatReasoningSelect from '../../../src/components/chat/ChatReasoningSelect.svelte'

HTMLElement.prototype.scrollIntoView ||= vi.fn()

const ALL_OPTIONS = [
  { value: 'provider-default', label: 'Auto', description: 'Let the model decide' },
  { value: 'low', label: 'Low', description: 'Faster, lower cost' },
  { value: 'medium', label: 'Medium', description: 'Balanced speed and depth' },
  { value: 'high', label: 'High', description: 'Deeper reasoning, slower' },
]

const AUTO_ONLY = [ALL_OPTIONS[0]]

describe('ChatReasoningSelect', () => {
  it('renders the current label from options', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    mount(ChatReasoningSelect, {
      target: host,
      props: { value: 'medium', options: ALL_OPTIONS },
    })
    flushSync()

    expect(host.textContent).toContain('Medium')
    host.remove()
  })

  it('shows Auto label when value is provider-default', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    mount(ChatReasoningSelect, {
      target: host,
      props: { value: 'provider-default', options: ALL_OPTIONS },
    })
    flushSync()

    expect(host.textContent).toContain('Auto')
    host.remove()
  })

  it('falls back to first option label when value is not in options', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    mount(ChatReasoningSelect, {
      target: host,
      props: { value: 'high', options: AUTO_ONLY },
    })
    flushSync()

    expect(host.textContent).toContain('Auto')
    host.remove()
  })

  it('disables the trigger when disabled=true', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    mount(ChatReasoningSelect, {
      target: host,
      props: { value: 'provider-default', options: ALL_OPTIONS, disabled: true },
    })
    flushSync()

    const trigger = host.querySelector('button')
    expect(trigger.disabled).toBe(true)
    host.remove()
  })

  it('disables the trigger when only one option (Auto-only)', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    mount(ChatReasoningSelect, {
      target: host,
      props: { value: 'provider-default', options: AUTO_ONLY, disabled: false },
    })
    flushSync()

    const trigger = host.querySelector('button')
    expect(trigger.disabled).toBe(true)
    host.remove()
  })

  it('has correct aria-label reflecting the current level', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    mount(ChatReasoningSelect, {
      target: host,
      props: { value: 'high', options: ALL_OPTIONS },
    })
    flushSync()

    const trigger = host.querySelector('button')
    expect(trigger.getAttribute('aria-label')).toBe('Reasoning effort: High')
    host.remove()
  })
})
