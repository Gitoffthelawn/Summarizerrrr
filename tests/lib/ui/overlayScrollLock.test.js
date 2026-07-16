// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const overlayMock = vi.hoisted(() => {
  const state = { instance: null }
  const getInstance = vi.fn(() => state.instance)
  getInstance.valid = vi.fn((instance) => Boolean(instance))
  return { state, getInstance }
})

vi.mock('overlayscrollbars', () => ({
  OverlayScrollbars: overlayMock.getInstance,
}))

import { acquireOverlayScrollLock } from '../../../src/lib/ui/overlayScrollLock.js'

function createInstance(initialOverflowY = 'scroll') {
  let overflowY = initialOverflowY
  const options = vi.fn((nextOptions) => {
    if (nextOptions?.overflow?.y) overflowY = nextOptions.overflow.y
    return { overflow: { x: 'scroll', y: overflowY } }
  })

  return { options }
}

describe('acquireOverlayScrollLock', () => {
  beforeEach(() => {
    overlayMock.state.instance = null
    overlayMock.getInstance.mockClear()
    overlayMock.getInstance.valid.mockClear()
    document.documentElement.style.overflow = ''
  })

  it('locks and restores the OverlayScrollbars vertical overflow option', () => {
    const instance = createInstance('scroll')
    overlayMock.state.instance = instance

    const release = acquireOverlayScrollLock(document.body)

    expect(instance.options).toHaveBeenLastCalledWith({ overflow: { y: 'hidden' } })

    release()

    expect(instance.options).toHaveBeenLastCalledWith({ overflow: { y: 'scroll' } })
  })

  it('keeps scrolling locked until all overlapping locks are released', () => {
    const instance = createInstance('visible-scroll')
    overlayMock.state.instance = instance

    const releaseFirst = acquireOverlayScrollLock(document.body)
    const releaseSecond = acquireOverlayScrollLock(document.body)

    releaseFirst()
    expect(instance.options).not.toHaveBeenLastCalledWith({ overflow: { y: 'visible-scroll' } })

    releaseSecond()
    expect(instance.options).toHaveBeenLastCalledWith({ overflow: { y: 'visible-scroll' } })

    releaseSecond()
    expect(instance.options).toHaveBeenCalledTimes(4)
  })

  it('falls back to the native document scroller before OverlayScrollbars is ready', () => {
    document.documentElement.style.overflow = 'auto'

    const release = acquireOverlayScrollLock(document.body)

    expect(document.documentElement.style.overflow).toBe('hidden')

    release()

    expect(document.documentElement.style.overflow).toBe('auto')
  })
})
