import { describe, expect, it } from 'vitest'
import { getElapsedDisplay } from '@/lib/utils/utils.js'

describe('getElapsedDisplay', () => {
  const base = new Date(2026, 6, 17, 14, 30, 0).getTime()

  it('returns null for a missing or invalid timestamp', () => {
    expect(getElapsedDisplay(null, base)).toBeNull()
    expect(getElapsedDisplay('not-a-date', base)).toBeNull()
  })

  it('reports "just now" under a minute', () => {
    const created = new Date(base - 30_000)
    expect(getElapsedDisplay(created, base)).toEqual({ mode: 'just-now' })
  })

  it('reports whole minutes under an hour', () => {
    const created = new Date(base - 5 * 60_000)
    expect(getElapsedDisplay(created, base)).toEqual({ mode: 'minutes', minutes: 5 })

    const created59 = new Date(base - 59 * 60_000)
    expect(getElapsedDisplay(created59, base)).toEqual({ mode: 'minutes', minutes: 59 })
  })

  it('switches to an absolute clock time from one hour, same day', () => {
    const created = new Date(base - 90 * 60_000) // 13:00 same day
    const result = getElapsedDisplay(created, base)
    expect(result.mode).toBe('clock')
    expect(result.clock).toMatch(/^\d{2}:\d{2}$/)
  })

  it('falls back to a full datetime once it is a different day', () => {
    const created = new Date(2026, 6, 16, 23, 0, 0) // previous day
    const result = getElapsedDisplay(created, base)
    expect(result.mode).toBe('datetime')
    expect(typeof result.label).toBe('string')
  })
})
