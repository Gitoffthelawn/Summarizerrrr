// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { getEditorExtensions } from '../../../src/lib/chat/composer/editorExtensions.js'
import { Markdown } from '../../../src/lib/chat/composer/markdownCodec.js'

// ProseMirror needs these in JSDOM.
Element.prototype.getClientRects =
  Element.prototype.getClientRects || (() => [])
Element.prototype.getBoundingClientRect =
  Element.prototype.getBoundingClientRect ||
  (() => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }))

const EXPLAIN = { skillId: 'explain', name: 'Explain' }
const SUMMARIZE = { skillId: 'summarize', name: 'Summarize' }

let editor

function createEditor(content = '') {
  return new Editor({
    element: document.createElement('div'),
    extensions: [...getEditorExtensions(), Markdown],
    content,
    contentType: 'markdown',
  })
}

function tokenCount() {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'skillToken') count += 1
  })
  return count
}

function pressBackspace() {
  const event = new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8 })
  return Boolean(
    editor.view.someProp('handleKeyDown', (fn) => fn(editor.view, event)),
  )
}

beforeEach(() => {
  editor = createEditor()
})

afterEach(() => {
  editor?.destroy()
})

describe('SkillTokenExtension', () => {
  it('renders the skill as plain /name in the document', () => {
    editor.commands.setSkillToken(EXPLAIN)
    const el = editor.view.dom.querySelector('[data-skill-id="explain"]')
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('/Explain')
    expect(el.className).toContain('skill-token')
  })

  it('serializes to nothing, so it never leaks into composerText', () => {
    editor.commands.setContent('hello world', { contentType: 'markdown' })
    editor.commands.setSkillToken(EXPLAIN)
    expect(tokenCount()).toBe(1)
    expect(editor.getMarkdown()).toBe('hello world')
  })

  it('replaces the typed /query at the given range', () => {
    editor.commands.setContent('ask /exp', { contentType: 'markdown' })
    // "ask /exp" starts at position 1, so "/exp" spans 5..9. The space that
    // separated it survives — the range covers the trigger, not the whitespace.
    editor.commands.setSkillToken(EXPLAIN, { from: 5, to: 9 })
    expect(tokenCount()).toBe(1)
    expect(editor.getMarkdown()).toBe('ask ')
  })

  it('keeps only one token when a second skill is selected', () => {
    editor.commands.setSkillToken(EXPLAIN)
    editor.commands.setSkillToken(SUMMARIZE)
    expect(tokenCount()).toBe(1)
    expect(
      editor.view.dom.querySelector('[data-skill-id="summarize"]'),
    ).not.toBeNull()
    expect(editor.view.dom.querySelector('[data-skill-id="explain"]')).toBeNull()
  })

  it('inserts at the start of the input when no range is given', () => {
    editor.commands.setContent('already typed', { contentType: 'markdown' })
    editor.commands.setSkillToken(EXPLAIN)
    const first = editor.state.doc.firstChild.firstChild
    expect(first.type.name).toBe('skillToken')
    expect(editor.getMarkdown()).toBe('already typed')
  })

  it('deletes on a single Backspace when the caret is right after it', () => {
    editor.commands.setSkillToken(EXPLAIN)
    editor.commands.focus('end')
    expect(pressBackspace()).toBe(true)
    expect(tokenCount()).toBe(0)
  })

  it('leaves Backspace alone when the caret is not next to the token', () => {
    editor.commands.setContent('abc', { contentType: 'markdown' })
    editor.commands.focus('end')
    expect(pressBackspace()).toBe(false)
  })

  it('unsetSkillToken clears the token but keeps the typed text', () => {
    editor.commands.setContent('keep me', { contentType: 'markdown' })
    editor.commands.setSkillToken(EXPLAIN)
    expect(editor.commands.unsetSkillToken()).toBe(true)
    expect(tokenCount()).toBe(0)
    expect(editor.getMarkdown()).toBe('keep me')
  })
})
