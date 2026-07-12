import { describe, it, expect } from 'vitest';
import { resolveKey } from '../../../src/lib/chat/composer/keyboardPolicy.js';

describe('keyboardPolicy', () => {
  describe('resolveKey', () => {
    it('returns submit for a normal Enter key press', () => {
      const result = resolveKey({ key: 'Enter' });
      expect(result).toBe('submit');
    });

    it('returns editor-default for list, quote, or code block elements on Enter', () => {
      const listTypes = ['bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock'];
      listTypes.forEach(blockType => {
        const result = resolveKey({ key: 'Enter', blockType });
        expect(result).toBe('editor-default');
      });
    });

    it('returns hard-break for Shift+Enter', () => {
      const result = resolveKey({ key: 'Enter', shiftKey: true });
      expect(result).toBe('hard-break');

      // Shift+Enter even inside bullet list/code block should still return hard-break
      const insideList = resolveKey({ key: 'Enter', shiftKey: true, blockType: 'bulletList' });
      expect(insideList).toBe('hard-break');
    });

    it('returns submit for Cmd+Enter or Ctrl+Enter even inside list/code blocks', () => {
      const cmdResult = resolveKey({ key: 'Enter', metaKey: true, blockType: 'bulletList' });
      expect(cmdResult).toBe('submit');

      const ctrlResult = resolveKey({ key: 'Enter', ctrlKey: true, blockType: 'codeBlock' });
      expect(ctrlResult).toBe('submit');
    });

    it('returns ignore for IME composition or keyCode 229', () => {
      const composingResult = resolveKey({ key: 'Enter', isComposing: true });
      expect(composingResult).toBe('ignore');

      const keyCodeResult = resolveKey({ key: 'Enter', keyCode: 229 });
      expect(keyCodeResult).toBe('ignore');
    });

    it('returns ignore when suggestions/mention menu is open', () => {
      const result = resolveKey({ key: 'Enter', menuOpen: true });
      expect(result).toBe('ignore');
    });

    it('returns ignore when composer is disabled', () => {
      const result = resolveKey({ key: 'Enter', disabled: true });
      expect(result).toBe('ignore');

      // Even Cmd+Enter is ignored if composer is disabled
      const cmdResult = resolveKey({ key: 'Enter', metaKey: true, disabled: true });
      expect(cmdResult).toBe('ignore');
    });

    it('returns editor-default for any key other than Enter', () => {
      const result = resolveKey({ key: 'a' });
      expect(result).toBe('editor-default');
      
      const tabResult = resolveKey({ key: 'Tab' });
      expect(tabResult).toBe('editor-default');
    });
  });
});
