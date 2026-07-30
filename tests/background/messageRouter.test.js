/**
 * The background message router replaced a ~540-line sequential `if` chain
 * (docs/refactor/03-god-files.md seam a). Two properties of that chain were
 * load-bearing and easy to lose in the rewrite, so they are pinned here:
 *
 *  1. A handler's return value passes straight through. `true` keeps the message
 *     channel open for an async `sendResponse`; `undefined` closes it. Get this
 *     wrong for a fire-and-forget message like `OPEN_ARCHIVE` and every sender's
 *     promise hangs forever.
 *  2. `message.type` is looked up before `message.action`, and a `type` that
 *     matches nothing must fall through to `action` — because a REQUEST_SUMMARY
 *     message carries `type: 'selectedText'`, which is a *summary* type, not a
 *     routing key.
 */
import { describe, expect, it, vi } from 'vitest'
import { createMessageRouter } from '@/entrypoints/background/messageRouter.js'

describe('background message router', () => {
  it('dispatches on message.type', () => {
    const handler = vi.fn(() => true)
    const route = createMessageRouter([{ SAVE_TO_HISTORY: handler }])

    const sendResponse = () => {}
    const result = route({ type: 'SAVE_TO_HISTORY', payload: 1 }, { tab: { id: 7 } }, sendResponse)

    expect(result).toBe(true)
    expect(handler).toHaveBeenCalledWith(
      { type: 'SAVE_TO_HISTORY', payload: 1 },
      { tab: { id: 7 } },
      sendResponse
    )
  })

  it('dispatches on message.action when no type matches', () => {
    const handler = vi.fn(() => true)
    const route = createMessageRouter([{ fetchYouTubeComments: handler }])

    expect(route({ action: 'fetchYouTubeComments' }, {}, () => {})).toBe(true)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('falls through to action when type is present but unregistered', () => {
    // The REQUEST_SUMMARY shape: `type` is the summary kind, `action` is the route.
    const requestSummary = vi.fn(() => true)
    const route = createMessageRouter([{ REQUEST_SUMMARY: requestSummary }])

    const message = { action: 'REQUEST_SUMMARY', type: 'selectedText', payload: { text: 'hi' } }
    expect(route(message, {}, () => {})).toBe(true)
    expect(requestSummary).toHaveBeenCalledOnce()
  })

  it('prefers type over action when both are registered', () => {
    const byType = vi.fn(() => true)
    const byAction = vi.fn(() => true)
    const route = createMessageRouter([{ PICK_ME: byType, ignore_me: byAction }])

    route({ type: 'PICK_ME', action: 'ignore_me' }, {}, () => {})

    expect(byType).toHaveBeenCalledOnce()
    expect(byAction).not.toHaveBeenCalled()
  })

  it('returns undefined for a fire-and-forget handler so the channel closes', () => {
    const openArchive = vi.fn(() => undefined)
    const route = createMessageRouter([{ OPEN_ARCHIVE: openArchive }])

    expect(route({ type: 'OPEN_ARCHIVE' }, {}, () => {})).toBeUndefined()
    expect(openArchive).toHaveBeenCalledOnce()
  })

  it('ignores unknown messages without calling sendResponse', () => {
    const sendResponse = vi.fn()
    const route = createMessageRouter([{ KNOWN: () => true }])

    expect(route({ type: 'NOPE' }, {}, sendResponse)).toBeUndefined()
    expect(route({ action: 'NOPE' }, {}, sendResponse)).toBeUndefined()
    expect(route(undefined, {}, sendResponse)).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('does not treat Object.prototype keys as handlers', () => {
    // A Map, not a plain object: `handlers.constructor` would otherwise resolve
    // to `Object` and get invoked as a handler.
    const route = createMessageRouter([{ KNOWN: () => true }])

    expect(route({ type: 'constructor' }, {}, () => {})).toBeUndefined()
    expect(route({ type: 'toString' }, {}, () => {})).toBeUndefined()
  })

  it('merges handler groups from every domain module', () => {
    const sync = vi.fn(() => true)
    const storage = vi.fn(() => true)
    const route = createMessageRouter([{ TRIGGER_SYNC: sync }, { SAVE_TO_ARCHIVE: storage }])

    route({ type: 'TRIGGER_SYNC' }, {}, () => {})
    route({ type: 'SAVE_TO_ARCHIVE' }, {}, () => {})

    expect(sync).toHaveBeenCalledOnce()
    expect(storage).toHaveBeenCalledOnce()
  })

  it('throws when two modules claim the same message type', () => {
    expect(() =>
      createMessageRouter([{ SAVE_TO_ARCHIVE: () => true }, { SAVE_TO_ARCHIVE: () => true }])
    ).toThrow(/Duplicate message handler registered for "SAVE_TO_ARCHIVE"/)
  })
})
