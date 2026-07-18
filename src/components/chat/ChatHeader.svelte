<script>
  // @ts-nocheck
  import ConversationMenu from './ConversationMenu.svelte'
  import Icon from '@iconify/svelte'
  import { tabTitle } from '@/stores/tabTitleStore.svelte.js'
  import {
    chatState,
    renameConversation,
    archiveConversation,
    closeConversation,
  } from '@/stores/chatStore.svelte.js'
  import { browser } from 'wxt/browser'

  let { onOpenConversation = null, onShowLegacySummary = null } = $props()

  function openHistory() {
    browser.tabs.create({ url: browser.runtime.getURL('archive.html') })
  }

  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL('settings.html') })
  }

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
  class="relative flex h-8 w-full shrink-0 items-center gap-1 px-2"
>
  {#if isRenaming}
    <input
      bind:this={titleInputEl}
      bind:value={draftTitle}
      onkeydown={handleTitleKeydown}
      onblur={commitRename}
      class="flex-1 truncate bg-transparent text-left text-xs text-text-primary outline-none border-b border-primary/40"
      aria-label="Conversation title"
    />
  {:else}
    <div class="line-clamp-1 flex-1 text-left text-xs text-text-secondary">
      {$tabTitle}
    </div>
  {/if}

  <button
    class="p-1.5 text-text-secondary hover:text-text-primary"
    aria-label="New chat"
    onclick={handleNewChat}
  >
    <Icon icon="heroicons:plus" width="20" height="20" />
  </button>

  <ConversationMenu
    activeConversationId={chatState.activeConversationId}
    onRename={startRename}
    onArchive={handleArchive}
    {onOpenConversation}
    {onShowLegacySummary}
    onOpenHistory={openHistory}
    onOpenSettings={openSettings}
  />
</div>
