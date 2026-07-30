import { Node, mergeAttributes } from '@tiptap/core'

/**
 * The selected skill, rendered as an atomic inline node inside the composer
 * instead of a chip parked outside it. Two consequences are load-bearing:
 *
 * - `renderMarkdown` returns `''`, so the token never leaks into
 *   `chatState.composerText`. The skill travels as `skillInvocation`, exactly
 *   as it did when it was a chip — the editor only *displays* it.
 * - It is an `atom`, so it deletes as one unit. The Backspace/Delete shortcuts
 *   below remove it on the first keypress rather than selecting it first,
 *   which is what "backspace into it and the skill is gone" means to a user.
 *
 * Because it serializes to nothing, the token cannot survive a `setContent()`
 * round-trip through markdown — `ChatRichTextInput` re-seeds it from its
 * `skill` prop when the editor is (re)created, e.g. on a chat tab switch.
 */
export const SkillTokenExtension = Node.create({
  name: 'skillToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      skillId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-skill-id'),
        renderHTML: (attributes) => ({ 'data-skill-id': attributes.skillId }),
      },
      name: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-skill-name'),
        renderHTML: (attributes) => ({ 'data-skill-name': attributes.name }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-skill-id]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'skill-token' }),
      `/${node.attrs.name || node.attrs.skillId || ''}`,
    ]
  },

  /** Excluded from `editor.getText()` for the same reason as the markdown. */
  renderText() {
    return ''
  },

  renderMarkdown() {
    return ''
  },

  addCommands() {
    return {
      /**
       * Replace `range` (the typed `/query`) with the token, dropping any token
       * already in the document — only one skill can be selected at a time.
       */
      setSkillToken:
        (attrs, range = null) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.nodes[this.name]
          if (!type) return false
          if (!dispatch) return true

          // Positions are read from the doc at transaction start, so every one
          // of them is mapped through the accumulated steps before use.
          const existing = []
          state.doc.descendants((node, pos) => {
            if (node.type === type) existing.push({ pos, size: node.nodeSize })
          })

          if (range) tr.delete(range.from, range.to)
          for (const { pos, size } of existing) {
            tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + size))
          }

          // Without a range (re-seeding an editor that was just created), the
          // token belongs at the very start of the input, not at the caret.
          let target = range?.from
          if (target == null) {
            state.doc.descendants((node, pos) => {
              if (target == null && node.isTextblock) target = pos + 1
              return target == null
            })
          }
          tr.insert(tr.mapping.map(target ?? 0), type.create(attrs))
          return true
        },

      /** Remove every skill token. Used when the skill is cleared elsewhere. */
      unsetSkillToken:
        () =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.nodes[this.name]
          if (!type) return false
          const existing = []
          state.doc.descendants((node, pos) => {
            if (node.type === type) existing.push({ pos, size: node.nodeSize })
          })
          if (!existing.length) return false
          if (dispatch) {
            for (const { pos, size } of existing) {
              tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + size))
            }
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    // Delete the token outright instead of ProseMirror's default two-step
    // "select the atom, then delete it".
    const deleteAdjacent = (side) => () =>
      this.editor.commands.command(({ tr, state, dispatch }) => {
        const { selection } = state
        if (!selection.empty) return false
        const { $from } = selection
        const node = side === 'before' ? $from.nodeBefore : $from.nodeAfter
        if (node?.type.name !== this.name) return false
        if (dispatch) {
          const from = side === 'before' ? $from.pos - node.nodeSize : $from.pos
          tr.delete(from, from + node.nodeSize)
        }
        return true
      })

    return {
      Backspace: deleteAdjacent('before'),
      Delete: deleteAdjacent('after'),
    }
  },
})
