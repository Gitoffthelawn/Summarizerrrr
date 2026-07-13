<script>
  // @ts-nocheck
  import ConversationMenu from './ConversationMenu.svelte'
  import { tabTitle } from '@/stores/tabTitleStore.svelte.js'
  import {
    chatState,
    renameConversation,
    archiveConversation,
    closeConversation,
  } from '@/stores/chatStore.svelte.js'
  import { browser } from 'wxt/browser'

  let { onOpenConversation = null, onShowLegacySummary = null } = $props()

  function openChatSettings() {
    browser.tabs.create({ url: browser.runtime.getURL('settings.html') + '?tab=chat' })
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
  class="relative flex h-8 w-full shrink-0 items-center justify-center px-2"
>
  {#if isRenaming}
    <input
      bind:this={titleInputEl}
      bind:value={draftTitle}
      onkeydown={handleTitleKeydown}
      onblur={commitRename}
      class="w-full max-w-[70%] truncate bg-transparent text-center text-[0.7rem] text-text-primary outline-none border-b border-primary/40"
      aria-label="Conversation title"
    />
  {:else}
    <div class="line-clamp-1 w-full text-center text-[0.7rem] text-text-secondary">
      {$tabTitle}
    </div>
  {/if}

  <div class="absolute right-0.5 top-1/2 -translate-y-1/2">
    <ConversationMenu
      activeConversationId={chatState.activeConversationId}
      onNewChat={handleNewChat}
      onRename={startRename}
      onArchive={handleArchive}
      {onOpenConversation}
      {onShowLegacySummary}
      onEditSystemPrompt={openChatSettings}
    />
  </div>
</div>
