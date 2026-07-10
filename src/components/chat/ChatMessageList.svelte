<script>
  // @ts-nocheck
  import ChatMessage from './ChatMessage.svelte'

  let { messages = [], streamingMessage = null, onRetry = null, conversation = null, onFollowUp = null } = $props()

  let scrollContainer = $state()
  let isNearBottom = $state(true)

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
