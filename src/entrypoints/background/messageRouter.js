// @ts-nocheck
/**
 * Dispatch for `browser.runtime.onMessage`, replacing the ~540-line sequential
 * `if (message.type === …)` chain that used to live in `index.js`.
 *
 * Seam (a) of `docs/refactor/03-god-files.md`.
 *
 * ## The handler contract, unchanged
 *
 * A handler is `(message, sender, sendResponse) => true | undefined`, exactly
 * what each `if` branch already returned. Returning `true` tells the browser to
 * keep the message channel open for an async `sendResponse`; returning
 * `undefined` closes it immediately. That distinction is load-bearing and is NOT
 * normalised here: `OPEN_ARCHIVE` and friends respond to nothing and must keep
 * returning `undefined`, or every sender's promise hangs forever.
 *
 * ## Why `type` is tried before `action`
 *
 * The old chain tested every `message.type` before it reached
 * `message.action === 'REQUEST_SUMMARY'` — and a REQUEST_SUMMARY message
 * carries `type: 'selectedText'` (the *summary* type, not a routing key). So
 * `type` must be looked up first and, on a miss, fall through to `action`.
 * Registering a handler under the key `selectedText` would break that; the
 * duplicate-key check below is the closest thing to a guard against it.
 */

/**
 * @param {Array<Record<string, Function>>} handlerGroups
 *   One object per domain module (sync, storage, ollama, …). Merged into a
 *   single lookup; a key claimed twice is a programming error, not a
 *   last-one-wins override.
 * @returns {(message: any, sender: any, sendResponse: Function) => true|undefined}
 */
export function createMessageRouter(handlerGroups) {
  const handlers = new Map()
  for (const group of handlerGroups) {
    for (const [key, handler] of Object.entries(group)) {
      if (handlers.has(key)) {
        throw new Error(
          `[Background] Duplicate message handler registered for "${key}"`
        )
      }
      handlers.set(key, handler)
    }
  }

  return (message, sender, sendResponse) => {
    const handler =
      (message?.type && handlers.get(message.type)) ||
      (message?.action && handlers.get(message.action))
    if (!handler) return
    return handler(message, sender, sendResponse)
  }
}
