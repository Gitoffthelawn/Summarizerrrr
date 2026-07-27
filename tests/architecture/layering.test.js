/**
 * Architecture guard — enforces the layering table in CLAUDE.md.
 *
 * Specifiers are *resolved* to a path under `src/` and then classified by their
 * top-level folder, rather than pattern-matched on `../` depth. That way
 * `@/stores/x`, `../../stores/x` and `../../../../stores/x` are all caught by
 * the same rule.
 *
 * Both static (`from '…'`) and dynamic (`await import('…')`) imports are
 * checked. Dynamic imports matter: they are the escape hatch the ports use, so
 * a rule that only saw static imports would be trivially bypassable — and was
 * already being bypassed in `lib/chat/` before this test was tightened.
 */

import { describe, test, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../../src')

/**
 * Files allowed to reach a lower layer **via dynamic import only**.
 *
 * These are the port files whose entire job is to be the boundary: they hold a
 * registered provider plus a lazy fallback so `lib/` keeps working if
 * registration order is wrong. Static imports remain banned for every file,
 * including these.
 *
 * Keep this list tiny. A new entry here is a design decision, not a fix.
 */
const LAZY_PORT_ALLOWLIST = {
  'lib/config/settingsPort.js': ['stores'],
  'lib/config/storagePort.js': ['services'],
  'lib/chat/capabilitiesSignal.js': ['stores'],
}

/** `.svelte` basenames that legitimately repeat — one per entrypoint. */
const DUPLICATE_BASENAME_ALLOWLIST = new Set([
  'App.svelte', // every WXT entrypoint has its own root component
])

const SOURCE_EXT = /\.(js|ts|svelte)$/

function walkDir(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir)) {
    const full = path.resolve(dir, entry)
    if (fs.statSync(full).isDirectory()) out.push(...walkDir(full))
    else out.push(full)
  }
  return out
}

function sourceFilesIn(layer) {
  return walkDir(path.join(SRC, layer)).filter((f) => SOURCE_EXT.test(f))
}

/** Repo-relative-to-src path, POSIX separators: `lib/config/settingsPort.js`. */
function relToSrc(file) {
  return path.relative(SRC, file).split(path.sep).join('/')
}

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*['"]([^'"]+)['"]/g
const BARE_STATIC_IMPORT = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g

/**
 * Extract every import specifier with its kind and 1-indexed line.
 * Lines that are clearly comment bodies (`*`, `//`) are skipped so JSDoc prose
 * naming a forbidden path can't trip the rule.
 * @returns {Array<{spec: string, line: number, kind: 'static'|'dynamic'}>}
 */
function extractImports(content) {
  const found = []
  const collect = (regex, kind) => {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(content)) !== null) {
      const line = content.slice(0, match.index + match[0].length).split('\n').length
      const lineText = content.split('\n')[line - 1] ?? ''
      const trimmed = lineText.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue
      found.push({ spec: match[1], line, kind })
    }
  }
  collect(STATIC_IMPORT, 'static')
  collect(BARE_STATIC_IMPORT, 'static')
  collect(DYNAMIC_IMPORT, 'dynamic')
  return found
}

/**
 * Resolve a specifier to an absolute path under `src/`, or `null` for bare
 * package specifiers (`svelte`, `#imports`, …) which are never layer-relevant.
 */
function resolveSpec(fromFile, spec) {
  if (spec.startsWith('@/')) return path.resolve(SRC, spec.slice(2))
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return path.resolve(path.dirname(fromFile), spec)
  }
  return null
}

/** Top-level folder under `src/` that a resolved path belongs to. */
function layerOf(abs) {
  if (!abs) return null
  const rel = path.relative(SRC, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep)[0]
}

/**
 * Walk a layer's files and report every import that `isViolation` rejects.
 * @param {string[]} layers folders under src/ to scan
 * @param {(ctx: {fromRel: string, targetLayer: string, targetRel: string, kind: string}) => string|null} isViolation
 *   returns a reason string when the import is illegal, else null
 */
function findViolations(layers, isViolation) {
  const violations = []
  for (const layer of layers) {
    for (const file of sourceFilesIn(layer)) {
      const fromRel = relToSrc(file)
      const content = fs.readFileSync(file, 'utf-8')
      for (const { spec, line, kind } of extractImports(content)) {
        const abs = resolveSpec(file, spec)
        const targetLayer = layerOf(abs)
        if (!targetLayer) continue
        const reason = isViolation({
          fromRel,
          targetLayer,
          targetRel: relToSrc(abs),
          kind,
        })
        if (reason) violations.push(`${fromRel}:${line} (${kind}) → ${spec}\n    ${reason}`)
      }
    }
  }
  return violations
}

function report(label, violations) {
  return `${label}\n\n${violations.join('\n')}\n\nSee the layering table in CLAUDE.md.`
}

describe('layering rules (CLAUDE.md)', () => {
  test('Rule 1: src/lib/** imports only src/lib/**', () => {
    const violations = findViolations(['lib'], ({ fromRel, targetLayer, kind }) => {
      if (targetLayer !== 'stores' && targetLayer !== 'services') return null
      if (kind === 'dynamic' && LAZY_PORT_ALLOWLIST[fromRel]?.includes(targetLayer)) {
        return null // registered port fallback — allowed, see LAZY_PORT_ALLOWLIST
      }
      return `lib/ must not depend on ${targetLayer}/. Go through a port in lib/config/ (settingsPort, storagePort) or a reporter (modelStatusReporter, capabilitiesSignal).`
    })
    expect(violations, report('src/lib must not import stores/ or services/:', violations)).toEqual([])
  })

  test('Rule 2: src/services/** imports stores/ only via stores/settingsStore', () => {
    const violations = findViolations(['services'], ({ targetLayer, targetRel }) => {
      if (targetLayer !== 'stores') return null
      if (targetRel === 'stores/settingsStore.svelte.js') return null // named carve-out
      return 'services/ may only read stores/settingsStore — no other store.'
    })
    expect(violations, report('src/services imported a store other than settingsStore:', violations)).toEqual([])
  })

  test('Rule 3: lib|services|stores never import src/entrypoints/**', () => {
    const violations = findViolations(['lib', 'services', 'stores'], ({ targetLayer }) =>
      targetLayer === 'entrypoints'
        ? 'entrypoints/ is the top layer — core code must never depend on it.'
        : null
    )
    expect(violations, report('Core code imported from entrypoints/:', violations)).toEqual([])
  })

  test('Rule 4: no duplicate .svelte basenames anywhere under src/', () => {
    const byBasename = new Map()
    for (const file of walkDir(SRC).filter((f) => f.endsWith('.svelte'))) {
      const base = path.basename(file)
      if (DUPLICATE_BASENAME_ALLOWLIST.has(base)) continue
      if (!byBasename.has(base)) byBasename.set(base, [])
      byBasename.get(base).push(relToSrc(file))
    }
    const violations = [...byBasename.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([base, paths]) => `${base}\n    ${paths.join('\n    ')}`)
    expect(
      violations,
      report(
        'Two different components share a filename — imports become ambiguous at a glance (this is how the two ShadowTooltip/SummaryWrapper implementations drifted apart):',
        violations
      )
    ).toEqual([])
  })

  test('the lazy-import allowlist has no stale entries', () => {
    const missing = Object.keys(LAZY_PORT_ALLOWLIST).filter(
      (rel) => !fs.existsSync(path.join(SRC, rel))
    )
    expect(
      missing,
      `LAZY_PORT_ALLOWLIST names files that no longer exist — drop them so the exception list stays honest:\n${missing.join('\n')}`
    ).toEqual([])
  })
})
