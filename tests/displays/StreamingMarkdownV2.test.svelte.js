// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { flushSync, mount } from 'svelte'
import StreamingMarkdownV2 from '@/components/displays/ui/StreamingMarkdownV2.svelte'

function render(sourceMarkdown) {
  const host = document.createElement('div')
  document.body.appendChild(host)

  mount(StreamingMarkdownV2, {
    target: host,
    props: {
      sourceMarkdown,
      enableCursor: false,
      isLoading: false,
      summaryLang: 'English',
    },
  })
  flushSync()

  return host
}

describe('StreamingMarkdownV2', () => {
  it('preserves table and timestamp renderers with the Markdown 1.x URL sanitizer', () => {
    const host = render(
      '| Column | Value |\n| --- | --- |\n| Status | Ready |\n\nWatch at [1:05]',
    )

    expect(host.querySelector('.table-container table')).toBeTruthy()

    const timestampLink = host.querySelector('.timestamp-link')
    expect(timestampLink).toBeTruthy()
    expect(timestampLink.getAttribute('href')).toBe('timestamp:65')
    host.remove()
  })

  it('does not render executable raw HTML in streamed output', () => {
    const host = render(
      '<script>window.__markdownXss = true</script><img id="unsafe-image" src="x" onerror="window.__markdownXss = true">',
    )

    expect(host.querySelector('script')).toBeNull()
    expect(host.querySelector('#unsafe-image')?.getAttribute('onerror')).toBeNull()
    expect(window.__markdownXss).toBeUndefined()
    host.remove()
  })
})
