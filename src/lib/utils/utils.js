// @ts-nocheck

export function formatDate(isoString) {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Describe how long ago `createdAt` was, for the chat turn footer. Returns a
 * structured result (not a translated string) so the component owns i18n.
 * Under 1 hour → relative minutes; from 1 hour → absolute clock time (24h),
 * with the date prepended once it is no longer the same calendar day.
 * @param {string | number | Date} createdAt
 * @param {number} now Epoch ms; injectable for deterministic tests.
 * @returns {{mode:'just-now'} | {mode:'minutes',minutes:number} | {mode:'clock',clock:string} | {mode:'datetime',label:string} | null}
 */
export function getElapsedDisplay(createdAt, now = Date.now()) {
  if (!createdAt) return null
  const then = new Date(createdAt).getTime()
  if (Number.isNaN(then)) return null

  const diffMs = now - then
  if (diffMs < 60_000) return { mode: 'just-now' }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) return { mode: 'minutes', minutes: diffMinutes }

  const thenDate = new Date(then)
  const nowDate = new Date(now)
  const sameDay =
    thenDate.getFullYear() === nowDate.getFullYear() &&
    thenDate.getMonth() === nowDate.getMonth() &&
    thenDate.getDate() === nowDate.getDate()

  if (sameDay) {
    return {
      mode: 'clock',
      clock: thenDate.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }
  }
  return { mode: 'datetime', label: formatDate(createdAt) }
}

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * A simple sleep utility.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A higher-order function that adds retry logic with exponential backoff to an async function.
 * REDUCED RETRIES: Now default 1 retry (down from 3) to avoid long waits
 * With auto-fallback for Gemini, we don't need many retries
 * @param {Function} fn The async function to retry.
 * @param {number} maxRetries Maximum number of retries.
 * @param {number} initialDelay Initial delay in ms.
 * @returns {Function} A new function with retry logic.
 */
export function withRetry(fn, maxRetries = 1, initialDelay = 1000) {
  return async function (...args) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn(...args)
      } catch (error) {
        if (i === maxRetries - 1 || !error.canRetry) {
          throw error
        }
        const delay = initialDelay * Math.pow(2, i)
        console.warn(
          `[withRetry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`,
          error.message
        )
        await sleep(delay)
      }
    }
  }
}

/**
 * Debounce function - delays execution until after wait milliseconds have elapsed
 * @param {Function} fn - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, wait = 300) {
  let timeout
  return function (...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), wait)
  }
}
