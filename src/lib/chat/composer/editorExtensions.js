import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { SkillTokenExtension } from './skillTokenExtension.js';

/**
 * Returns the locked list of extensions for the TipTap composer/editor.
 * 
 * Includes (Claude-input-style minimal set):
 * - StarterKit: Document, Paragraph, Text, Bold, Italic, Strike,
 *   BulletList, OrderedList, ListItem, Code (inline), CodeBlock (plain),
 *   HardBreak, History.
 *   Heading, Blockquote and HorizontalRule are disabled — only bullet list,
 *   ordered list and code block are supported as block-level formatting.
 * - Placeholder extension.
 * - SkillToken: the selected skill, shown inline in the input. Part of the
 *   locked schema so the headless markdown codec shares it and can serialize
 *   a document containing one (to nothing — see the extension).
 *
 * @param {Object} options Configuration options
 * @param {string} [options.placeholder] Placeholder text
 * @returns {Array} List of extensions
 */
export function getEditorExtensions(options = {}) {
  const { placeholder = '' } = options;

  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      horizontalRule: false,
    }),
    Placeholder.configure({
      placeholder,
      emptyEditorClass: 'is-editor-empty',
    }),
    SkillTokenExtension,
  ];
}
