// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  cleanedHtmlToStructuredText,
  extractSemanticPageContent,
} from '@/lib/content/semanticPageExtractor.js'

describe('semantic page extraction', () => {
  it('keeps structured article content while removing navigation clutter', () => {
    document.title = 'Semantic extraction test'
    document.body.innerHTML = `
      <nav>${'<a href="#">Navigation item</a>'.repeat(30)}</nav>
      <main>
        <article>
          <h1>Semantic extraction test</h1>
          <p>This article contains a complete sentence with enough words for content scoring.</p>
          <p>The second paragraph provides additional important details for the model context.</p>
        </article>
      </main>
    `

    const result = extractSemanticPageContent(document)

    expect(result.method).toBe('defuddle')
    expect(result.content).toContain('complete sentence')
    expect(result.content).toContain('second paragraph')
    expect(result.content).not.toContain('Navigation item')
  })

  it('preserves headings, lists, code, and table rows as compact text', () => {
    const text = cleanedHtmlToStructuredText(document, `
      <article>
        <h2>Details</h2>
        <ul><li>First item</li><li>Second item</li></ul>
        <pre>const answer = 42</pre>
        <table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>42</td></tr></table>
      </article>
    `)

    expect(text).toContain('## Details')
    expect(text).toContain('- First item')
    expect(text).toContain('```\nconst answer = 42\n```')
    expect(text).toContain('Name | Value')
  })
})
