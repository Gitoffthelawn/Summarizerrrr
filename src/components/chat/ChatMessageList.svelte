<script>
  // @ts-nocheck
  import { onMount, tick } from 'svelte'
  import ChatMessage from './ChatMessage.svelte'
  import Icon from '@iconify/svelte'
  import { loadEarlierMessages, chatState } from '@/stores/chatStore.svelte.js'

  let { messages = [], streamingMessage = null, onRetry = null, conversation = null, onFollowUp = null } = $props()

  let isNearBottom = $state(true)
  let isLoadingEarlier = $state(false)

  // Scroll is owned by the document/body (not a local overflow container), so
  // we read/write the document scroller and listen on `window`.
  function getScroller() {
    if (typeof document === 'undefined') return null
    return document.scrollingElement || document.documentElement
  }

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
    const el = getScroller()
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottom = distanceFromBottom < 120
  }

  async function handleLoadEarlier() {
    if (isLoadingEarlier) return
    isLoadingEarlier = true
    const el = getScroller()
    const prevHeight = el ? el.scrollHeight : 0
    const prevTop = el ? el.scrollTop : 0
    try {
      await loadEarlierMessages()
      await tick()
      // Preserve viewport position after prepending earlier messages.
      if (el) el.scrollTop = prevTop + (el.scrollHeight - prevHeight)
    } finally {
      isLoadingEarlier = false
    }
  }

  onMount(() => {
    handleScroll() // initialize isNearBottom
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  })

  $effect(() => {
    // Track dependency so this effect reruns whenever content grows.
    const _length = allMessages.length
    const _lastContent = allMessages.at(-1)?.content
    if (isNearBottom) {
      const el = getScroller()
      // Assign scrollTop directly (instant) so streaming doesn't animate
      // against `html { scroll-behavior: smooth }`.
      if (el) el.scrollTop = el.scrollHeight
    }
  })
</script>

<div
  class="flex w-full flex-col gap-5 px-4 py-4"
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

