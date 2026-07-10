<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'

  let { skills = [], onSelect = null } = $props()
  let isOpen = $state(false)

  function selectSkill(skill) {
    onSelect?.(skill)
    isOpen = false
  }
</script>

<div class="relative">
  <button
    type="button"
    class="flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-1 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    aria-label="Choose a chat skill"
    aria-expanded={isOpen}
    onclick={() => (isOpen = !isOpen)}
  >
    <Icon icon="heroicons:bolt" width="17" height="17" />
  </button>

  {#if isOpen}
    <div class="absolute bottom-10 left-0 z-30 flex max-h-64 w-64 flex-col overflow-y-auto rounded-xl border border-border bg-surface-1 p-1 shadow-lg">
      {#each skills as skill (skill.id)}
        <button
          type="button"
          class="flex flex-col rounded-lg px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onclick={() => selectSkill(skill)}
        >
          <span class="text-sm font-medium text-text-primary">{skill.name}</span>
          <span class="text-xs text-text-secondary">/{skill.command} · {skill.description}</span>
        </button>
      {:else}
        <p class="px-3 py-2 text-xs text-text-secondary">No skills are available.</p>
      {/each}
    </div>
  {/if}
</div>
