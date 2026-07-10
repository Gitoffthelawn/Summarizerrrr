<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import StreamingMarkdownV2 from '@/components/displays/ui/StreamingMarkdownV2.svelte'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import ChatDeepDive from './ChatDeepDive.svelte'

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

  function copyContent() {
    navigator.clipboard?.writeText(message.content || '')
    onCopy?.(message)
  }
</script>

<div
  class="flex w-full flex-col gap-1 {isUser ? 'items-end' : 'items-start'}"
  data-message-status={message.status}
>
  {#if isUser}
    <div
      class="max-w-[85%] rounded-2xl rounded-br-md border border-border bg-surface-2 px-3.5 py-2 text-sm whitespace-pre-wrap wrap-anywhere text-text-primary"
    >
      {message.content}
    </div>
  {:else}
    <div
      class="prose main-sidepanel wrap-anywhere prose-h2:mt-4 w-full max-w-none text-text-primary"
    >
      <StreamingMarkdownV2
        sourceMarkdown={message.content}
        enableCursor={isStreaming && settings.enableStreaming}
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
      <div class="flex items-center gap-1 text-muted">
        <button
          type="button"
          class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
          aria-label="Copy response"
          onclick={copyContent}
        >
          <Icon icon="heroicons:document-duplicate-20-solid" width="16" height="16" />
        </button>
        {#if onRetry && retryTargetId && (isAborted || isError)}
          <button
            type="button"
            class="rounded-md p-1 transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
            aria-label="Retry this message"
            onclick={() => onRetry(retryTargetId)}
          >
            <Icon icon="heroicons:arrow-path" width="16" height="16" />
          </button>
        {/if}
      </div>
      {#if message.status === 'complete'}
        <ChatDeepDive {conversation} {message} {onFollowUp} />
      {/if}
    {/if}
  {/if}
</div>
