// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  serializeMarkdown,
  normalizeMarkdown,
  isMarkdownEmpty
} from '../../../src/lib/chat/composer/markdownCodec.js';

describe('markdownCodec', () => {
  describe('round-trip parsing and serialization', () => {
    const fixtures = [
      {
        name: 'paragraphs and blank lines',
        markdown: 'Hello world.\n\nThis is the second paragraph.'
      },
      {
        name: 'bold, italic, strike formatting',
        markdown: 'This is **bold**, *italic*, and ~~strike~~.'
      },
      {
        name: 'bullet list',
        markdown: '- Bullet item 1\n- Bullet item 2\n- Bullet item 3'
      },
      {
        name: 'ordered list',
        markdown: '1. First item\n2. Second item\n3. Third item'
      },
      {
        name: 'inline code',
        markdown: 'Here is some `const x = 1` inline code.'
      },
      {
        name: 'fenced code block with blank lines and metacharacters',
        markdown: '```\nfunction test() {\n  // Code Block\n  console.log("Hello @tab /skill * _ ~");\n\n  return true;\n}\n```'
      },
      {
        name: 'Vietnamese Unicode',
        markdown: 'Xin chào, đây là văn bản Tiếng Việt có dấu: á, à, ả, ã, ạ, â, ê, ô, ư, đ.'
      },
      {
        name: 'literal /skill and @tab commands',
        markdown: '/skill explain this code and ask @tab about details.'
      }
    ];

    fixtures.forEach(({ name, markdown }) => {
      it(`correctly round-trips ${name}`, () => {
        const doc = parseMarkdown(markdown);
        expect(doc).toBeTypeOf('object');
        expect(doc.type).toBe('doc');
        
        const serialized = serializeMarkdown(doc);
        // Normalize line breaks or extra endings since serializers might differ slightly
        const normalizedInput = markdown.replace(/\r\n/g, '\n').trim();
        const normalizedOutput = serialized.replace(/\r\n/g, '\n').trim();
        expect(normalizedOutput).toBe(normalizedInput);
      });
    });
  });

  describe('isMarkdownEmpty', () => {
    it('returns true for empty or whitespace-only strings', () => {
      expect(isMarkdownEmpty('')).toBe(true);
      expect(isMarkdownEmpty(null)).toBe(true);
      expect(isMarkdownEmpty(undefined)).toBe(true);
      expect(isMarkdownEmpty('   ')).toBe(true);
      expect(isMarkdownEmpty('\n\n')).toBe(true);
      expect(isMarkdownEmpty('\t')).toBe(true);
    });

    it('returns true for markdown parsing to empty paragraph', () => {
      expect(isMarkdownEmpty('<p></p>')).toBe(true); // if it parses to plain text `<p></p>` or similar
    });

    it('returns false for actual text and formatting', () => {
      expect(isMarkdownEmpty('hello')).toBe(false);
      expect(isMarkdownEmpty('**bold**')).toBe(false);
      expect(isMarkdownEmpty('- item')).toBe(false); // bullet list node present
      expect(isMarkdownEmpty('1. item')).toBe(false); // ordered list node present
    });
  });

  describe('unsupported block types stay literal (Claude-input-style minimal set)', () => {
    it('keeps heading syntax as literal paragraph text without dropping content', () => {
      const doc = parseMarkdown('# Heading 1\n\nbody text');
      // No heading node is ever produced (it is not in the schema).
      expect(doc.content.map((n) => n.type)).not.toContain('heading');
      // The "#" characters and the following block both survive.
      const serialized = serializeMarkdown(doc);
      expect(serialized).toContain('# Heading 1');
      expect(serialized).toContain('body text');
    });

    it('keeps blockquote syntax as literal text without dropping content', () => {
      const doc = parseMarkdown('> quoted\n\nbody text');
      expect(doc.content.map((n) => n.type)).not.toContain('blockquote');
      const serialized = serializeMarkdown(doc);
      expect(serialized).toContain('quoted');
      expect(serialized).toContain('body text');
    });

    it('keeps horizontal-rule syntax as literal text without dropping content', () => {
      const doc = parseMarkdown('above\n\n---\n\nbelow');
      expect(doc.content.map((n) => n.type)).not.toContain('horizontalRule');
      const serialized = serializeMarkdown(doc);
      expect(serialized).toContain('above');
      expect(serialized).toContain('below');
    });
  });

  describe('normalizeMarkdown', () => {
    it('normalizes markdown input consistently', () => {
      const input = 'Word **bold** _italic_';
      const output = normalizeMarkdown(input);
      expect(output).toBeTypeOf('string');
      expect(output.trim()).toBe('Word **bold** *italic*'); // TipTap serializes italic to *
    });
  });
});
