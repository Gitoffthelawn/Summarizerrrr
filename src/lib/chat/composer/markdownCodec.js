import { Editor } from '@tiptap/core';
import { Markdown as MarkdownExtension } from '@tiptap/markdown';
import { Tokenizer } from 'marked';
import { getEditorExtensions } from './editorExtensions.js';

/**
 * Marked tokenizer that neutralises the block-level syntax we intentionally
 * don't support (heading `#`, blockquote `>`, horizontal rule `---`).
 *
 * Returning `undefined` tells marked the rule didn't match, so it falls through
 * and the raw characters are kept as literal paragraph text. This mirrors the
 * typing experience (those input rules are disabled in editorExtensions.js) and,
 * crucially, prevents content loss: `@tiptap/markdown` otherwise emits e.g. a
 * `heading` node which isn't in our schema, and `setContent()` then silently
 * drops the whole block (verified). Keeps the supported set to bullet list,
 * ordered list, code block + inline marks — "Claude input" style.
 *
 * NOTE: `markedOptions` is passed straight to `marked.setOptions`, which assigns
 * `tokenizer` wholesale — so this must be a *complete* Tokenizer subclass, not a
 * partial override object (a partial one breaks marked's own block lexing).
 */
class MinimalBlockTokenizer extends Tokenizer {
  heading() { return undefined; }
  lheading() { return undefined; }
  blockquote() { return undefined; }
  hr() { return undefined; }
}

export const Markdown = MarkdownExtension.configure({
  markedOptions: { tokenizer: new MinimalBlockTokenizer() },
});

let editorInstance = null;

/**
 * Lazily gets or creates the headless editor instance used for parsing/serialization.
 * @returns {Editor}
 */
function getEditor() {
  if (!editorInstance) {
    editorInstance = new Editor({
      extensions: [
        ...getEditorExtensions(),
        Markdown
      ]
    });
  }
  return editorInstance;
}

/**
 * Parses Markdown string into a Tiptap JSON document structure.
 * @param {string} markdown 
 * @returns {Object} ProseMirror JSON document
 */
export function parseMarkdown(markdown) {
  const editor = getEditor();
  editor.commands.setContent(markdown, { contentType: 'markdown' });
  return editor.getJSON();
}

/**
 * Serializes a Tiptap JSON document or ProseMirror state back into a Markdown string.
 * @param {Object} doc JSON document
 * @returns {string} Markdown string
 */
export function serializeMarkdown(doc) {
  const editor = getEditor();
  editor.commands.setContent(doc);
  return editor.getMarkdown();
}

/**
 * Normalizes a Markdown string by parsing it and serializing it back.
 * @param {string} markdown 
 * @returns {string} Normalized Markdown string
 */
export function normalizeMarkdown(markdown) {
  if (typeof markdown !== 'string') return '';
  const doc = parseMarkdown(markdown);
  return serializeMarkdown(doc);
}

/**
 * Checks if the given Markdown content is empty.
 * @param {string} markdown 
 * @returns {boolean} True if empty or whitespace-only
 */
export function isMarkdownEmpty(markdown) {
  if (!markdown) return true;
  const trimmed = markdown.trim();
  if (!trimmed) return true;
  
  const doc = parseMarkdown(markdown);
  if (!doc || !doc.content || doc.content.length === 0) return true;
  
  if (doc.content.length === 1) {
    const firstChild = doc.content[0];
    if (firstChild.type === 'paragraph' && (!firstChild.content || firstChild.content.length === 0)) {
      return true;
    }
  }
  
  return false;
}
