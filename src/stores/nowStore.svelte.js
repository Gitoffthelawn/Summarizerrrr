// @ts-nocheck
/**
 * A single shared, ticking "now" so relative timestamps across the UI
 * (e.g. chat turn footers) re-derive on their own without a per-component
 * interval. 30s granularity is plenty for minute-level "x min ago" labels and
 * costs virtually nothing.
 */
export const nowState = $state({ value: Date.now() })

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    nowState.value = Date.now()
  }, 30_000)
}
