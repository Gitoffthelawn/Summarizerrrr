import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

/**
 * TipTap extension that wires the `@tiptap/suggestion` utility to the `@`
 * mention trigger. The plugin is used purely as a *state source*: it handles
 * trigger detection, range tracking (via ProseMirror mapping) and keyboard
 * events, while the actual dropdown is rendered by a Svelte component
 * (`TabMentionMenu.svelte`). This keeps the fragile bits (caret-anchored
 * detection, range math, key priority) in ProseMirror and the UI in Svelte.
 *
 * Options:
 * - `onMentionStateChange({ open, query, range, clientRect })` — called on
 *   start/update/exit of a mention. `range` is `{ from, to }` covering the
 *   `@query` text; `clientRect` is a `() => DOMRect | null` for positioning.
 * - `onMentionKeyDown(event) => boolean` — called for every keydown while the
 *   mention is active. Return `true` to consume the event (e.g. arrow/enter
 *   navigation handled by the Svelte menu), `false` to let the editor handle it.
 */
export const TabMentionExtension = Extension.create({
  name: 'tabMention',

  addOptions() {
    return {
      onMentionStateChange: () => {},
      onMentionKeyDown: () => false,
    }
  },

  addProseMirrorPlugins() {
    const { onMentionStateChange, onMentionKeyDown } = this.options

    const emit = (open, props) => {
      onMentionStateChange({
        open,
        query: open ? props.query : '',
        range: open ? props.range : null,
        clientRect: open ? props.clientRect : null,
      })
    }

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('tabMention'),
        char: '@',
        allowSpaces: false,
        startOfLine: false,
        // The list is fetched and rendered in Svelte; the plugin only tracks
        // trigger state, so it never needs to compute or command items.
        items: () => [],
        command: () => {},
        render: () => ({
          onStart: (props) => emit(true, props),
          onUpdate: (props) => emit(true, props),
          onKeyDown: (props) => onMentionKeyDown(props.event),
          onExit: () => emit(false, {}),
        }),
      }),
    ]
  },
})
