<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import { tabMentionService } from '@/services/chat/tabMentionService.js'
  let { open = false, query = '', onSelect = null, onClose = null } = $props()
  let tabs = $state([])
  let error = $state('')
  let selectedIndex = $state(0)
  let itemEls = $state([])

  $effect(() => {
    if (open) {
      tabMentionService.listTabs(query)
        .then((items) => {
          tabs = items
          selectedIndex = 0
        })
        .catch((e) => error = e.message)
    }
  })

  // Keep the highlighted item within the scrollable viewport during keyboard nav.
  $effect(() => {
    if (open) itemEls[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  })

  async function select(tab) {
    try {
      await onSelect?.(tab)
      onClose?.()
    } catch (e) {
      error = e.message
    }
  }

  export function handleKeyDown(event) {
    if (!open || tabs.length === 0) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex = (selectedIndex + 1) % tabs.length
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex = (selectedIndex - 1 + tabs.length) % tabs.length
      return true
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const tab = tabs[selectedIndex]
      if (tab && !tab.disabledReason) {
        select(tab)
      }
      return true
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose?.()
      return true
    }

    return false
  }
</script>
{#if open}
  <div role="listbox" aria-label="Matching tabs" class="absolute bottom-full left-3 right-3 mb-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-1 p-1 shadow-xl z-30">
    {#if error}<p class="p-2 text-xs text-error">{error}</p>{/if}
    {#each tabs as tab, i (tab.id)}
      <button
        bind:this={itemEls[i]}
        role="option"
        aria-selected={i === selectedIndex}
        class="flex w-full items-center gap-2 rounded p-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50 {i === selectedIndex ? 'bg-surface-2 ring-1 ring-border' : ''}"
        disabled={!!tab.disabledReason}
        title={tab.disabledReason || tab.url}
        onclick={() => select(tab)}
      >
        <Icon icon="heroicons:document-text" width="16" height="16" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{tab.title || 'Untitled tab'}</span>
          <span class="block truncate text-xs text-text-secondary">
            {tab.hostname}{tab.disabledReason ? ` · ${tab.disabledReason}` : ''}
          </span>
        </span>
      </button>
    {:else}
      <p class="p-2 text-xs text-text-secondary">No matching tabs.</p>
    {/each}
  </div>
{/if}

