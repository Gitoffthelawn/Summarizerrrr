<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import { tabMentionService } from '@/services/chat/tabMentionService.js'
  let { open = false, query = '', onSelect = null, onClose = null } = $props()
  let tabs = $state([])
  let error = $state('')
  $effect(() => { if (open) tabMentionService.listTabs(query).then((items) => tabs = items).catch((e) => error = e.message) })
  async function select(tab) { try { await onSelect?.(tab); onClose?.() } catch (e) { error = e.message } }
</script>
{#if open}
  <div class="absolute bottom-full left-3 right-3 mb-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-1 p-1 shadow-xl z-30">
    {#if error}<p class="p-2 text-xs text-error">{error}</p>{/if}
    {#each tabs as tab (tab.id)}
      <button class="flex w-full items-center gap-2 rounded p-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50" disabled={!!tab.disabledReason} title={tab.disabledReason || tab.url} onclick={() => select(tab)}>
        <Icon icon="heroicons:document-text" width="16" height="16" />
        <span class="min-w-0 flex-1"><span class="block truncate">{tab.title || 'Untitled tab'}</span><span class="block truncate text-xs text-text-secondary">{tab.hostname}{tab.disabledReason ? ` · ${tab.disabledReason}` : ''}</span></span>
      </button>
    {:else}<p class="p-2 text-xs text-text-secondary">No matching tabs.</p>{/each}
  </div>
{/if}
