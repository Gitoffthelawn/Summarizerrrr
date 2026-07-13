<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'

  let {
    label = 'This page',
    icon = 'heroicons:document-text',
    /** @type {string|undefined} Human-readable kind label shown after '·' */
    kindLabel = undefined,
    /** @type {number|null} Estimated token cost of this source, once extracted. */
    estimatedTokens = null,
    /** @type {boolean} True while the source content is being extracted. */
    estimating = false,
    onRemove = null,
  } = $props()

  function formatK(n) {
    if (n == null || n < 0) return ''
    if (n < 1000) return String(n)
    if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
</script>

<span
  class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-secondary"
>
  <Icon icon={icon} width="14" height="14" />
  <span class="max-w-40 truncate">{label}{#if kindLabel} <span class="text-text-tertiary">·</span> {kindLabel}{/if}</span>
  {#if estimating}
    <Icon icon="solar:loader-2-bold" width="12" height="12" class="animate-spin text-text-tertiary" />
  {:else if estimatedTokens != null}
    <span class="text-text-tertiary tabular-nums">~{formatK(estimatedTokens)}</span>
  {/if}
  {#if onRemove}
    <button
      type="button"
      class="ml-0.5 rounded-full p-0.5 hover:bg-surface-1 hover:text-text-primary"
      aria-label="Remove attached source"
      onclick={(e) => { e.stopPropagation(); onRemove() }}
    >
      <Icon icon="tabler:x" width="12" height="12" />
    </button>
  {/if}
</span>
