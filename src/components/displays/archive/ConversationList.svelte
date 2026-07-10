<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import {
    conversationArchiveStore,
    selectConversation,
    setArchivedConversationState,
    deleteArchivedConversation,
    resumeArchivedConversation,
  } from '@/stores/conversationArchiveStore.svelte.js'

  let { onRefresh = null } = $props()

  async function run(action) {
    await action()
    await onRefresh?.()
  }
</script>

<div class="flex flex-col gap-1 px-2 py-4">
  {#each conversationArchiveStore.conversationList as conversation (conversation.id)}
    <div class="group rounded-md p-2 hover:bg-surface-1 dark:hover:bg-surface-2 {conversationArchiveStore.selectedConversationId === conversation.id ? 'bg-surface-2 text-text-primary' : ''}">
      <button class="w-full text-left" onclick={() => selectConversation(conversation)} title={conversation.title}>
        <div class="flex items-center gap-1.5">
          <span class="line-clamp-1 flex-1 text-sm">{conversation.title}</span>
          {#if conversation.archived}<Icon icon="heroicons:archive-box-solid" width="14" height="14" />{/if}
        </div>
        <div class="mt-1 line-clamp-1 text-xs text-text-secondary">{conversation.sourceDomain || 'No source'}{conversation.lastMessagePreview ? ` · ${conversation.lastMessagePreview}` : ''}</div>
        {#if conversation.tags?.length}
          <div class="mt-1 line-clamp-1 text-[10px] text-text-muted">{conversation.tags.map((tag) => `#${tag}`).join(' ')}</div>
        {/if}
      </button>
      <div class="mt-1 hidden items-center gap-1 text-text-secondary group-hover:flex">
        <button class="p-1 hover:text-text-primary" title="Resume in side panel" onclick={() => run(() => resumeArchivedConversation(conversation.id))}><Icon icon="heroicons:play-solid" width="14" height="14" /></button>
        <button class="p-1 hover:text-text-primary" title={conversation.archived ? 'Unarchive' : 'Archive'} onclick={() => run(() => setArchivedConversationState(conversation.id, !conversation.archived))}><Icon icon={conversation.archived ? 'heroicons:archive-box-arrow-down' : 'heroicons:archive-box'} width="14" height="14" /></button>
        <button class="p-1 hover:text-error" title="Delete conversation" onclick={() => run(() => deleteArchivedConversation(conversation.id))}><Icon icon="heroicons:trash" width="14" height="14" /></button>
      </div>
    </div>
  {:else}
    <p class="px-2 text-xs text-text-muted">No conversations yet.</p>
  {/each}
</div>
