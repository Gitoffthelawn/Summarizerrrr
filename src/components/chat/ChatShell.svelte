<script>
  // @ts-nocheck
  import ChatHeader from './ChatHeader.svelte'
  import ChatEmptyState from './ChatEmptyState.svelte'
  import ChatMessageList from './ChatMessageList.svelte'
  import ChatComposer from './ChatComposer.svelte'
  import ChatContextWarning from './ChatContextWarning.svelte'
  import ErrorDisplay from '@/components/displays/ui/ErrorDisplay.svelte'
  import {
    chatState,
    openConversation,
    retryChatMessage,
    sendChatFollowUp,
  } from '@/stores/chatStore.svelte.js'

  let { onShowLegacySummary = null } = $props()

  let composerRef = $state()

  function focusComposer() {
    composerRef?.focus()
  }
</script>

<div class="flex h-full w-full flex-col" data-testid="chat-shell">
  <ChatHeader onOpenConversation={openConversation} {onShowLegacySummary} />

  <div class="flex min-h-0 flex-1 flex-col">
    {#if chatState.messages.length === 0 && !chatState.streamingMessage}
      <ChatEmptyState onFocusComposer={focusComposer} />
    {:else}
      <ChatMessageList
        messages={chatState.messages}
        streamingMessage={chatState.streamingMessage}
        onRetry={retryChatMessage}
        conversation={chatState.conversation}
        onFollowUp={sendChatFollowUp}
      />
    {/if}
  </div>

  <div class="flex flex-col gap-2 px-3">
    <ChatContextWarning warnings={chatState.contextWarnings} />
    {#if chatState.error}
      <ErrorDisplay error={chatState.error} />
    {/if}
  </div>

  <ChatComposer bind:this={composerRef} />
</div>
