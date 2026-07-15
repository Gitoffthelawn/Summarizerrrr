/**
 * Format a token count for compact display.
 *
 * - `null` / negative → `'0'`
 * - < 1 000          → exact integer string
 * - < 1 000 000      → e.g. `'12.3K'`, trailing `.0` dropped
 * - ≥ 1 000 000      → e.g. `'1.2M'`, trailing `.0` dropped
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatK(n) {
  if (n == null || n < 0) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}
