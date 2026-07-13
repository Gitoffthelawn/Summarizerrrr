<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'

  let {
    label = 'This page',
    icon = 'heroicons:document-text',
    /** @type {string|undefined} Human-readable kind label shown after '·' */
    kindLabel = undefined,
    onRemove = null,
  } = $props()
</script>

<span
  class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text-secondary"
>
  <Icon icon={icon} width="14" height="14" />
  <span class="max-w-40 truncate">{label}{#if kindLabel} <span class="text-text-tertiary">·</span> {kindLabel}{/if}</span>
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
