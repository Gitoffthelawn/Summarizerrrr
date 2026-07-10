<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import ConversationMenu from './ConversationMenu.svelte'
  import {
    chatState,
    renameConversation,
    archiveConversation,
    closeConversation,
  } from '@/stores/chatStore.svelte.js'

  let { onOpenConversation = null, onShowLegacySummary = null } = $props()

  let isRenaming = $state(false)
  let draftTitle = $state('')
  let titleInputEl = $state()

  function startRename() {
    if (!chatState.conversation) return
    draftTitle = chatState.conversation.title || ''
    isRenaming = true
    queueMicrotask(() => titleInputEl?.focus())
  }

  async function commitRename() {
    if (!isRenaming) return
    isRenaming = false
    const nextTitle = draftTitle.trim()
    if (!chatState.conversation || !nextTitle || nextTitle === chatState.conversation.title) return
    await renameConversation(chatState.conversation.id, nextTitle)
  }

  function handleTitleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
    } else if (event.key === 'Escape') {
      isRenaming = false
    }
  }

  function handleNewChat() {
    closeConversation()
  }

  async function handleArchive() {
    if (!chatState.conversation) return
    await archiveConversation(chatState.conversation.id)
  }
</script>

<div
  class="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2"
>
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <Icon
      icon="octicon:sparkle-fill-16"
      width="15"
      height="15"
      class="shrink-0 text-primary"
    />
    {#if isRenaming}
      <input
        bind:this={titleInputEl}
        bind:value={draftTitle}
        onkeydown={handleTitleKeydown}
        onblur={commitRename}
        class="w-full truncate bg-transparent text-sm font-medium text-text-primary outline-none border-b border-primary/40"
        aria-label="Conversation title"
      />
    {:else}
      <button
        type="button"
        class="truncate text-left text-sm font-medium text-text-primary hover:text-primary"
        onclick={startRename}
        title={chatState.conversation?.title || 'New chat'}
      >
        {chatState.conversation?.title || 'New chat'}
      </button>
    {/if}
  </div>

  <ConversationMenu
    activeConversationId={chatState.activeConversationId}
    onNewChat={handleNewChat}
    onRename={startRename}
    onArchive={handleArchive}
    {onOpenConversation}
    {onShowLegacySummary}
  />
</div>
