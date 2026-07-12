<script>
  // @ts-nocheck
  import ChatEmptyState from './ChatEmptyState.svelte'
  import ChatMessageList from './ChatMessageList.svelte'
  import ChatComposer from './ChatComposer.svelte'
  import ChatContextWarning from './ChatContextWarning.svelte'
  import ErrorDisplay from '@/components/displays/ui/ErrorDisplay.svelte'
  import {
    chatState,
    retryChatMessage,
    sendChatFollowUp,
  } from '@/stores/chatStore.svelte.js'

  let composerRef = $state()
  let composerBlockHeight = $state(0)

  function focusComposer() {
    composerRef?.focus()
  }
</script>

<div class="flex w-full flex-1 flex-col" data-testid="chat-shell">
  <div
    class="flex w-full flex-1 flex-col"
    style="padding-bottom: {composerBlockHeight}px"
  >
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

  <div
    bind:clientHeight={composerBlockHeight}
    class="fixed bottom-0 left-0 z-30 w-full min-w-[22.5rem]"
  >
    <div class="flex flex-col gap-2 px-3">
      <ChatContextWarning warnings={chatState.contextWarnings} />
      {#if chatState.error}
        <ErrorDisplay error={chatState.error} />
      {/if}
    </div>

    <ChatComposer bind:this={composerRef} />
  </div>
</div>
