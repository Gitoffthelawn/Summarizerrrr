<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import { tabTitle } from '@/stores/tabTitleStore.svelte.js'
  import { chatState } from '@/stores/chatStore.svelte.js'

  let { onFocusComposer = null } = $props()

  const starters = [
    {
      label: 'Summarize this page',
      icon: 'octicon:sparkle-fill-16',
      prompt: 'Summarize this page.',
    },
    {
      label: 'Key takeaways',
      icon: 'heroicons:list-bullet',
      prompt: 'What are the key takeaways from this page?',
    },
    {
      label: 'Explain simply',
      icon: 'heroicons:light-bulb',
      prompt: 'Explain this page in simple terms.',
    },
  ]

  function useStarter(prompt) {
    chatState.composerText = prompt
    onFocusComposer?.()
  }
</script>

<div
  class="flex h-full w-full flex-col items-center justify-center gap-7 px-6"
>
  <div class="flex flex-col items-center gap-3 text-center">
    <div
      class="flex size-11 items-center justify-center rounded-full border border-border bg-surface-2 text-primary"
    >
      <Icon icon="octicon:sparkle-fill-16" width="22" height="22" />
    </div>
    <p class="max-w-xs text-sm font-medium text-text-primary line-clamp-2">
      {$tabTitle || 'This page'}
    </p>
    <p class="max-w-[16rem] text-xs text-text-secondary">
      Ask anything about this page — summarize, explain, or dig deeper.
    </p>
  </div>

  <div class="flex w-full max-w-[16rem] flex-col items-stretch gap-2">
    <p
      class="text-center font-mono text-[0.65rem] uppercase tracking-wider text-muted"
    >
      Try
    </p>
    {#each starters as starter}
      <button
        type="button"
        class="group flex items-center gap-2 rounded-full border border-border px-4 py-2 font-mono text-xs text-text-secondary transition-colors duration-150 hover:bg-blackwhite-5 hover:text-text-primary"
        onclick={() => useStarter(starter.prompt)}
      >
        <Icon
          icon={starter.icon}
          width="15"
          height="15"
          class="text-muted transition-colors group-hover:text-primary"
        />
        <span>{starter.label}</span>
      </button>
    {/each}
  </div>
</div>
