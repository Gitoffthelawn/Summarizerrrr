<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'

  let { skill, onClear = null } = $props()
</script>

{#if skill}
  <span
    class="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary"
  >
    <Icon icon="heroicons:sparkles" width="14" height="14" />
    <span class="max-w-40 truncate">{skill.name || skill.skillId}</span>
    {#if onClear}
      <button
        type="button"
        class="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
        aria-label="Clear selected skill"
        onclick={onClear}
      >
        <Icon icon="tabler:x" width="12" height="12" />
      </button>
    {/if}
  </span>
{/if}
