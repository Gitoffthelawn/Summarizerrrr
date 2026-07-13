<script>
  // @ts-nocheck
  let {
    /** Real usage of the last sent turn (from the provider), or null. */
    usage = null,
    /** Sum of estimated tokens for @tab chips not yet sent. */
    pendingEstimate = 0,
  } = $props()

  function formatK(n) {
    if (n == null || n < 0) return '0'
    if (n < 1000) return String(n)
    if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  }

  // Fill against the input budget (window minus the reserved output), which is
  // what actually constrains the input. The full window would leave the bar
  // permanently short of its ceiling and never reach the warning/error bands.
  // Fall back to `window` if the budget isn't available.
  const capacity = $derived(usage?.inputBudget > 0 ? usage.inputBudget : usage?.window)

  const percent = $derived(
    usage && capacity > 0
      ? Math.min(100, Math.max(0, Math.round((usage.used / capacity) * 100)))
      : 0
  )

  const level = $derived(
    percent >= 95 ? 'error' : percent >= 80 ? 'warning' : 'normal'
  )

  const SOURCE_LABELS = {
    'discovered': 'exact',
    'openrouter-catalog': 'catalog',
    'known-model': 'curated',
    'default-fallback': 'estimated',
  }

  const sourceLabel = $derived(SOURCE_LABELS[usage?.source] || usage?.source || '')

  // Render when we either have a real usage figure or pending chips to preview.
  const visible = $derived(Boolean(usage) || pendingEstimate > 0)
</script>

{#if visible}
  <div
    class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-text-secondary"
    role="status"
    aria-label="Context window usage: {percent}%"
  >
    {#if usage}
      <!-- Bar: real used / input budget -->
      <div class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-blackwhite-5">
        <div
          class="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          class:bg-accent={level === 'normal'}
          class:bg-warning={level === 'warning'}
          class:bg-error={level === 'error'}
          style="width: {percent}%"
        ></div>
      </div>

      <!-- Label: exact provider count, no tilde. -->
      <span class="shrink-0 tabular-nums">
        {formatK(usage.used)} / {formatK(capacity)}
      </span>

      <!-- Source badge -->
      {#if sourceLabel}
        <span
          class="shrink-0 rounded-sm px-1 py-px text-[10px] leading-tight opacity-60 {usage.source === 'default-fallback' ? 'bg-warning/10' : ''}"
          title="Context window source: {usage.source}"
        >
          {sourceLabel}
        </span>
      {/if}
    {:else}
      <!-- No real usage yet (before the first send): fill the row so the pending
           estimate sits on the right, mirroring the sent-state layout. -->
      <div class="flex-1"></div>
    {/if}

    <!-- Pending @tab estimate, kept separate from the real sent count. -->
    {#if pendingEstimate > 0}
      <span class="shrink-0 tabular-nums text-text-tertiary" title="Estimated tokens of attached sources not yet sent">
        + ~{formatK(pendingEstimate)}
      </span>
    {/if}
  </div>
{/if}
