<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'

  let { warnings = [] } = $props()
</script>

{#if warnings?.length}
  <div
    class="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-secondary"
    role="status"
    aria-live="polite"
  >
    {#each warnings as warning}
      <div class="flex items-start gap-1.5">
        <Icon
          icon="heroicons:exclamation-circle"
          width="14"
          height="14"
          class="mt-0.5 shrink-0 text-warning"
        />
        <span>{warning}</span>
      </div>
    {/each}
  </div>
{/if}
