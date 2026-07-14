<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import StreamingMarkdownV2 from '@/components/displays/ui/StreamingMarkdownV2.svelte'
  import ChatUserMarkdown from './ChatUserMarkdown.svelte'
  import ChatMessageEditor from './ChatMessageEditor.svelte'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import {
    switchBranch,
    regenerateChatMessage,
    editChatMessage,
    continueChatMessage,
    deleteChatMessage,
  } from '@/stores/chatStore.svelte.js'
  import { conversationRepository } from '@/lib/db/conversationRepository.js'
  import ChatDeepDive from './ChatDeepDive.svelte'
  import ChatSourceDrawer from './ChatSourceDrawer.svelte'

  let {
    message,
    isStreaming = false,
    retryTargetId = null,
    onRetry = null,
    onCopy = null,
    conversation = null,
    onFollowUp = null,
  } = $props()

  const isUser = $derived(message.role === 'user')
  const isAborted = $derived(message.status === 'aborted')
  const isError = $derived(message.status === 'error')
  const isInterrupted = $derived(message.status === 'interrupted')
  const canContinue = $derived(isAborted || isInterrupted)

  let siblings = $state([])
  let isEditing = $state(false)
  let editText = $state('')
  let sourcesOpen = $state(false)

  const hasGroundingRefs = $derived(!isUser && Array.isArray(message.groundingRefs) && message.groundingRefs.length > 0)

  $effect(() => {
    if (message.id && message.id !== '__streaming__' && message.conversationId) {
      conversationRepository.getSiblings(message.conversationId, message.parentKey || '__root__')
        .then((res) => {
          siblings = res
        })
        .catch((err) => {
          console.error('[ChatMessage] Failed to load siblings:', err)
        })
    } else {
      siblings = []
    }
  })

  const siblingIndex = $derived(siblings.findIndex((s) => s.id === message.id))
  const hasSiblings = $derived(siblings.length > 1)

  function copyContent() {
    navigator.clipboard?.writeText(message.content || '')
    onCopy?.(message)
  }

  function startEditing() {
    editText = message.content || ''
    isEditing = true
  }

  function cancelEditing() {
    isEditing = false
    editText = ''
  }

  function submitEdit() {
    if (!editText.trim()) return
    isEditing = false
    editChatMessage(message.id, editText)
    editText = ''
  }

  function handleEditKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitEdit()
    } else if (event.key === 'Escape') {
      cancelEditing()
    }
  }

  const modelLabel = $derived.by(() => {
    if (isUser || !message.modelId) return null
    return message.modelId
  })

  const usageLabel = $derived.by(() => {
    if (isUser || !message.usage) return null
    const u = message.usage
    const promptTokens = u.promptTokens ?? u.inputTokens
    const completionTokens = u.completionTokens ?? u.outputTokens
    const cachedTokens = u.cachedInputTokens
    const parts = []
    if (promptTokens != null) {
      parts.push(
        cachedTokens != null && cachedTokens > 0
          ? `${promptTokens} in (${cachedTokens} cached)`
          : `${promptTokens} in`
      )
    }
    if (completionTokens != null) parts.push(`${completionTokens} out`)
    return parts.length > 0 ? parts.join(' · ') : null
  })
</script>

<div
  class="flex w-full flex-col gap-1 {isUser ? 'items-end' : 'items-start'}"
  data-message-status={message.status}
>
  {#if isUser}
    {#if isEditing}
      <div class="w-full max-w-[85%]">
        <ChatMessageEditor
          value={editText}
          onsave={(text) => {
            editChatMessage(message.id, text)
            isEditing = false
          }}
          oncancel={cancelEditing}
        />
      </div>
    {:else}
      <div
        class="max-w-[85%] rounded-2xl rounded-br-md border border-border bg-surface-2 px-3.5 py-2 text-sm wrap-anywhere text-text-primary"
      >
        <ChatUserMarkdown source={message.content} />
      </div>
    {/if}
    {#if !isStreaming && !isEditing}
      <div class="mt-0.5 flex items-center justify-end gap-1">
        {#if hasSiblings}
          <div class="flex items-center gap-1 select-none text-xs text-text-secondary">
            <button
              type="button"
              class="rounded p-0.5 hover:bg-blackwhite-5 hover:text-text-primary transition-colors"
              onclick={() => switchBranch(siblings[(siblingIndex - 1 + siblings.length) % siblings.length].id)}
              aria-label="Previous branch"
            >
              <Icon icon="heroicons:chevron-left" width="14" height="14" />
            </button>
            <span>{siblingIndex + 1}/{siblings.length}</span>
            <button
              type="button"
              class="rounded p-0.5 hover:bg-blackwhite-5 hover:text-text-primary transition-colors"
              onclick={() => switchBranch(siblings[(siblingIndex + 1) % siblings.length].id)}
              aria-label="Next branch"
            >
              <Icon icon="heroicons:chevron-right" width="14" height="14" />
            </button>
          </div>
        {/if}
        <button
          type="button"
          class="rounded-md p-1 text-text-secondary transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
          aria-label="Edit message"
          onclick={startEditing}
        >
          <Icon icon="heroicons:pencil-square" width="14" height="14" />
        </button>
        <button
          type="button"
          class="rounded-md p-1 text-text-secondary transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
          aria-label="Copy message"
          onclick={copyContent}
        >
          <Icon icon="heroicons:document-duplicate-20-solid" width="14" height="14" />
        </button>
      </div>
    {/if}
  {:else}
    <div
      class="prose main-sidepanel wrap-anywhere prose-h2:mt-4 w-full max-w-none text-text-primary"
      style="content-visibility: auto; contain-intrinsic-size: auto 200px;"
    >
      <StreamingMarkdownV2
        sourceMarkdown={message.content}
        enableCursor={isStreaming}
        enableHighlight={true}
        summaryLang={settings.summaryLang}
        isLoading={isStreaming}
        class="custom-markdown-style"
      />
    </div>

    {#if isAborted}
      <div class="flex items-center gap-1 text-xs text-text-secondary">
        <Icon icon="heroicons:stop-solid" width="12" height="12" />
        <span>Stopped</span>
      </div>
    {:else if isError}
      <div class="flex items-center gap-1 text-xs text-error">
        <Icon icon="heroicons:exclamation-circle" width="12" height="12" />
        <span>{message.error?.message || 'Something went wrong.'}</span>
      </div>
    {/if}

    {#if !isStreaming}
      <div class="flex items-center gap-2 text-muted">
        {#if hasSiblings}
          <div class="flex items-center gap-1 select-none text-xs text-text-secondary">
            <button
              type="button"
              class="rounded p-0.5 hover:bg-blackwhite-5 hover:text-text-primary transition-colors"
              onclick={() => switchBranch(siblings[(siblingIndex - 1 + siblings.length) % siblings.length].id)}
              aria-label="Previous branch"
            >
              <Icon icon="heroicons:chevron-left" width="14" height="14" />
            </button>
            <span>{siblingIndex + 1}/{siblings.length}</span>
            <button
              type="button"
              class="rounded p-0.5 hover:bg-blackwhite-5 hover:text-text-primary transition-colors"
              onclick={() => switchBranch(siblings[(siblingIndex + 1) % siblings.length].id)}
              aria-label="Next branch"
            >
              <Icon icon="heroicons:chevron-right" width="14" height="14" />
            </button>
          </div>
        {/if}

        <button
          type="button"
          class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
          aria-label="Copy response"
          onclick={copyContent}
        >
          <Icon icon="heroicons:document-duplicate-20-solid" width="16" height="16" />
        </button>

        {#if message.status === 'complete'}
          <button
            type="button"
            class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
            aria-label="Regenerate response"
            onclick={() => regenerateChatMessage(message.id)}
          >
            <Icon icon="heroicons:arrow-path" width="16" height="16" />
          </button>
        {:else if canContinue}
          <button
            type="button"
            class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
            aria-label="Continue response"
            onclick={() => continueChatMessage(message.id)}
          >
            <Icon icon="heroicons:play" width="16" height="16" />
          </button>
        {/if}

        {#if onRetry && retryTargetId && isError}
          <button
            type="button"
            class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
            aria-label="Retry this message"
            onclick={() => onRetry(retryTargetId)}
          >
            <Icon icon="heroicons:arrow-path" width="16" height="16" />
          </button>
        {/if}

        <button
          type="button"
          class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary text-text-secondary hover:text-error"
          aria-label="Delete message"
          onclick={() => deleteChatMessage(message.id)}
        >
          <Icon icon="heroicons:trash" width="16" height="16" />
        </button>
      </div>

      {#if modelLabel || usageLabel}
        <div class="flex items-center gap-2 text-[11px] text-text-secondary/60">
          {#if modelLabel}
            <span class="flex items-center gap-1">
              <Icon icon="heroicons:cpu-chip" width="12" height="12" />
              {modelLabel}
            </span>
          {/if}
          {#if usageLabel}
            <span class="flex items-center gap-1">
              <Icon icon="heroicons:chart-bar" width="12" height="12" />
              {usageLabel}
            </span>
          {/if}
        </div>
      {/if}

      {#if hasGroundingRefs}
        <button
          type="button"
          class="mt-0.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-text-secondary/70 hover:bg-blackwhite-5 hover:text-text-primary transition-colors"
          onclick={() => (sourcesOpen = !sourcesOpen)}
          aria-label="{sourcesOpen ? 'Hide' : 'Show'} sources"
        >
          <Icon icon="heroicons:link" width="12" height="12" />
          <span>{message.groundingRefs.length} {message.groundingRefs.length === 1 ? 'source' : 'sources'}</span>
          <Icon icon={sourcesOpen ? 'heroicons:chevron-up' : 'heroicons:chevron-down'} width="12" height="12" />
        </button>
        <ChatSourceDrawer groundingRefs={message.groundingRefs} open={sourcesOpen} />
      {/if}

      {#if message.status === 'complete'}
        <ChatDeepDive {conversation} {message} {onFollowUp} />
      {/if}
    {/if}
  {/if}
</div>
