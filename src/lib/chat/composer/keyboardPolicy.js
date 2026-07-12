/**
 * Pure keyboard policy helper. Decides what action the editor should take
 * when a key event (typically Enter or modifier + Enter) is triggered.
 * 
 * @param {Object} params Key resolution parameters
 * @param {string} params.key The event.key value (e.g., 'Enter')
 * @param {boolean} [params.shiftKey=false] Whether shift key is pressed
 * @param {boolean} [params.metaKey=false] Whether meta/cmd key is pressed
 * @param {boolean} [params.ctrlKey=false] Whether ctrl key is pressed
 * @param {boolean} [params.isComposing=false] Whether IME composition is in progress
 * @param {number} [params.keyCode=0] The event.keyCode
 * @param {string} [params.blockType='paragraph'] The active node type at current selection
 * @param {boolean} [params.menuOpen=false] Whether a suggestions/mention menu is currently open
 * @param {boolean} [params.disabled=false] Whether the composer is disabled
 * 
 * @returns {'submit' | 'editor-default' | 'hard-break' | 'ignore'} Resolves to the planned editor action
 */
export function resolveKey({
  key,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
  isComposing = false,
  keyCode = 0,
  blockType = 'paragraph',
  menuOpen = false,
  disabled = false
}) {
  if (disabled) {
    return 'ignore';
  }
  
  if (isComposing || keyCode === 229) {
    return 'ignore';
  }
  
  if (menuOpen) {
    return 'ignore';
  }

  if (key !== 'Enter') {
    return 'editor-default';
  }

  if (shiftKey) {
    return 'hard-break';
  }

  // Cmd/Ctrl+Enter always submits
  if (metaKey || ctrlKey) {
    return 'submit';
  }

  // List items, blockquotes, code blocks receive standard editor editing behavior
  const nativeBlockTypes = ['bulletList', 'orderedList', 'blockquote', 'codeBlock', 'listItem'];
  if (nativeBlockTypes.includes(blockType)) {
    return 'editor-default';
  }

  return 'submit';
}
