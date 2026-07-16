<script>
  // @ts-nocheck
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

  const hasMatchingInlineError = $derived.by(() => {
    const errorMessage = chatState.error?.message
    if (!errorMessage) return false

    const latestMessage =
      chatState.streamingMessage || chatState.messages.at(-1)

    return Boolean(
      latestMessage?.role === 'assistant' &&
        latestMessage.status === 'error' &&
      latestMessage.error?.message === errorMessage,
    )
  })
</script>

<div class="flex w-full flex-1 flex-col" data-testid="chat-shell">
  <div
    class="flex w-full flex-1 flex-col"
    style="padding-bottom: {composerBlockHeight}px"
  >
    {#if chatState.messages.length > 0 || chatState.streamingMessage}
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
      {#if chatState.error && !hasMatchingInlineError}
        <ErrorDisplay error={chatState.error} />
      {/if}
    </div>

    <ChatComposer bind:this={composerRef} />
  </div>
</div>
