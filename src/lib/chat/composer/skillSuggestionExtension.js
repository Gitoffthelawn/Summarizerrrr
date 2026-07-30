import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

/**
 * Tracks a slash-prefixed skill query. The dropdown and selection behavior
 * remain in Svelte; this extension only owns trigger detection, mapped ranges,
 * and keyboard priority inside ProseMirror.
 */
export const SkillSuggestionExtension = Extension.create({
  name: 'skillSuggestion',

  addOptions() {
    return {
      onSkillStateChange: () => {},
      onSkillKeyDown: () => false,
    }
  },

  addProseMirrorPlugins() {
    const { onSkillStateChange, onSkillKeyDown } = this.options

    const emit = (open, props) => {
      onSkillStateChange({
        open,
        query: open ? props.query : '',
        range: open ? props.range : null,
        clientRect: open ? props.clientRect : null,
      })
    }

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('skillSuggestion'),
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: () => [],
        command: () => {},
        render: () => ({
          onStart: (props) => emit(true, props),
          onUpdate: (props) => emit(true, props),
          onKeyDown: (props) => onSkillKeyDown(props.event),
          onExit: () => emit(false, {}),
        }),
      }),
    ]
  },
})
