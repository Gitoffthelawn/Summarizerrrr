<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'

  let {
    skills = [],
    selectedId = null,
    onSelect = null,
    onCreate = null,
    onBack = null,
  } = $props()

  let builtIns = $derived(skills.filter((skill) => skill.builtIn))
  let userSkills = $derived(skills.filter((skill) => !skill.builtIn))
</script>

<div
  class="w-56 relative z-20 bg-background overflow-hidden border-r border-border/70 flex flex-col"
>
  {#if onBack}
    <button
      class="flex items-center gap-1.5 px-4 pt-4 pb-1 w-fit text-text-secondary transition-colors hover:text-text-primary"
      onclick={() => onBack()}
    >
      <Icon icon="heroicons:arrow-left" width="15" height="15" />
      <span>Back to prompts</span>
    </button>
  {/if}

  <div class="flex items-center justify-between gap-2 px-4 pt-2 pb-1">
    <h2 class="text-lg font-bold">Skills</h2>
    <button
      class="p-1.5 rounded-sm border border-border/60 text-text-secondary transition-colors hover:border-primary hover:text-primary"
      onclick={() => onCreate?.()}
      aria-label="New skill"
      title="New skill"
    >
      <Icon icon="heroicons:plus" width="16" height="16" />
    </button>
  </div>

  <!-- Built-in Section -->
  <div class="flex flex-col px-2 text-muted gap-1 mt-2">
    <h3
      class="text-xs uppercase tracking-wider text-muted/70 px-2 py-1 font-semibold"
    >
      Built-in
    </h3>
    {#each builtIns as skill (skill.id)}
      <button
        class="prompt-button relative py-2 px-4 transition-colors duration-125 hover:bg-blackwhite/5 rounded-sm {selectedId ===
        skill.id
          ? 'text-text-primary active font-bold'
          : 'text-text-secondary'} w-full text-left"
        onclick={() => onSelect?.(skill.id)}
      >
        {skill.name}
      </button>
    {/each}
  </div>

  <!-- User Skills Section -->
  <div class="flex flex-col px-2 text-muted gap-1 mt-4">
    <h3
      class="text-xs uppercase tracking-wider text-muted/70 px-2 py-1 font-semibold"
    >
      User skills
    </h3>
    {#each userSkills as skill (skill.id)}
      <button
        class="prompt-button relative py-2 px-4 transition-colors duration-125 hover:bg-blackwhite/5 rounded-sm {selectedId ===
        skill.id
          ? 'text-text-primary active font-bold'
          : 'text-text-secondary'} w-full text-left"
        onclick={() => onSelect?.(skill.id)}
      >
        {skill.name}
      </button>
    {:else}
      <p class="px-4 py-2 text-xs text-muted/70">No custom skills yet.</p>
    {/each}
  </div>
</div>

<style>
  .prompt-button::after {
    content: '';
    display: block;
    width: 0px;
    position: absolute;
    background: white;
    top: 50%;
    transform: translateY(-50%) translateX(-4px);
    right: -0.5rem;
    left: -0.5rem;
    height: 1rem;
    border-radius: 0 4px 4px 0;
    transition: all 0.3s ease-in-out;
    box-shadow:
      0 0 2px #ffffff18,
      0 0 0 #ffffff18;
  }
  .prompt-button.active {
    &::after {
      transform: translateY(-50%) translateX(0px);
      width: 4px;
      box-shadow:
        4px 0 8px 2px #ffffff71,
        0 0 3px 1px #ffffff94;
    }
  }
</style>
