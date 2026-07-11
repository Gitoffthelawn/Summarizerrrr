<script>
  // @ts-nocheck
  import ChatMessage from './ChatMessage.svelte'
  import Icon from '@iconify/svelte'
  import { loadEarlierMessages, chatState } from '@/stores/chatStore.svelte.js'

  let { messages = [], streamingMessage = null, onRetry = null, conversation = null, onFollowUp = null } = $props()

  let scrollContainer = $state()
  let isNearBottom = $state(true)
  let isLoadingEarlier = $state(false)

  function retryTargetFor(index) {
    const message = allMessages[index]
    if (message.retryOfMessageId) return message.retryOfMessageId
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (allMessages[cursor].role === 'user') return allMessages[cursor].id
    }
    return null
  }

  const allMessages = $derived(
    streamingMessage ? [...messages, { ...streamingMessage, id: '__streaming__' }] : messages
  )

  function handleScroll() {
    if (!scrollContainer) return
    const distanceFromBottom =
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
    isNearBottom = distanceFromBottom < 120
  }

  async function handleLoadEarlier() {
    if (isLoadingEarlier) return
    isLoadingEarlier = true
    try {
      await loadEarlierMessages()
    } finally {
      isLoadingEarlier = false
    }
  }

  $effect(() => {
    // Track dependency so this effect reruns whenever content grows.
    const _length = allMessages.length
    const _lastContent = allMessages.at(-1)?.content
    if (scrollContainer && isNearBottom) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
  })
</script>

<div
  bind:this={scrollContainer}
  onscroll={handleScroll}
  class="flex h-full w-full flex-col gap-5 overflow-y-auto px-4 py-4"
>
  {#if chatState.hasEarlierMessages}
    <div class="flex justify-center py-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
        onclick={handleLoadEarlier}
        disabled={isLoadingEarlier}
      >
        <Icon icon="heroicons:arrow-up" width="14" height="14" />
        {isLoadingEarlier ? 'Loading…' : 'Load earlier messages'}
      </button>
    </div>
  {/if}
  {#each allMessages as message, index (message.id)}
    <ChatMessage
      {message}
      isStreaming={message.id === '__streaming__'}
      retryTargetId={message.role === 'assistant' ? retryTargetFor(index) : null}
      {onRetry}
      {conversation}
      {onFollowUp}
    />
  {/each}
</div>

