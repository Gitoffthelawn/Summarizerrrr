import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src')

/**
 * bits-ui's `child` snippet hands the trigger's own props down — including its
 * own `onclick`, `onpointerdown`, `onfocus`, … A Svelte spread is last-writer-
 * wins, so spreading those props *after* the element's own handler silently
 * replaces it: the tooltip still opens on hover and the button does nothing.
 *
 * The whole footer row under each chat answer was dead this way. The rule is
 * mechanical, so this test enforces it: spread first, own handlers after.
 */
function collectSvelteFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectSvelteFiles(full))
    else if (entry.endsWith('.svelte')) out.push(full)
  }
  return out
}

describe('bits-ui trigger prop spreads', () => {
  it('never spreads builder/props after an element\'s own event handler', () => {
    const offenders = []

    for (const file of collectSvelteFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      const spread = /\{\.\.\.(builder|props)\}/g
      let match
      while ((match = spread.exec(source))) {
        // Everything between the opening `<` of this element and the spread.
        const head = source.slice(source.lastIndexOf('<', match.index), match.index)
        const handlers = [...head.matchAll(/\bon([a-z]+)=/g)].map((h) => `on${h[1]}`)
        if (handlers.length === 0) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(
          `${path.relative(SRC, file)}:${line} — {...${match[1]}} spread after ${handlers.join(', ')}`,
        )
      }
    }

    expect(offenders).toEqual([])
  })
})
