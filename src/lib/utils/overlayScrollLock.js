import { OverlayScrollbars } from 'overlayscrollbars'

const overlayLocks = new WeakMap()
const nativeLocks = new WeakMap()

function once(callback) {
  let called = false

  return () => {
    if (called) return
    called = true
    callback()
  }
}

function lockNativeScroller() {
  if (typeof document === 'undefined') return () => {}

  const scroller = document.scrollingElement || document.documentElement
  if (!scroller) return () => {}

  let state = nativeLocks.get(scroller)
  if (!state) {
    state = {
      count: 0,
      overflow: scroller.style.overflow,
    }
    nativeLocks.set(scroller, state)
  }

  if (state.count === 0) {
    state.overflow = scroller.style.overflow
    scroller.style.overflow = 'hidden'
  }
  state.count += 1

  return once(() => {
    state.count = Math.max(0, state.count - 1)
    if (state.count > 0) return

    scroller.style.overflow = state.overflow
    nativeLocks.delete(scroller)
  })
}

/**
 * Locks the actual OverlayScrollbars viewport used by the side panel.
 *
 * Bits UI locks `document.body`, which does not stop scrolling after
 * OverlayScrollbars takes ownership of the document scroller. The returned
 * cleanup is idempotent so it is safe to call on both close and unmount.
 */
export function acquireOverlayScrollLock(target) {
  if (typeof document === 'undefined') return () => {}

  const resolvedTarget = target || document.body
  const instance = resolvedTarget ? OverlayScrollbars(resolvedTarget) : null

  if (!instance) return lockNativeScroller()

  let state = overlayLocks.get(instance)
  if (!state) {
    state = {
      count: 0,
      overflowY: instance.options().overflow.y,
    }
    overlayLocks.set(instance, state)
  }

  if (state.count === 0) {
    state.overflowY = instance.options().overflow.y
    instance.options({ overflow: { y: 'hidden' } })
  }
  state.count += 1

  return once(() => {
    state.count = Math.max(0, state.count - 1)
    if (state.count > 0) return

    if (OverlayScrollbars.valid(instance)) {
      instance.options({ overflow: { y: state.overflowY } })
    }
    overlayLocks.delete(instance)
  })
}
