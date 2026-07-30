<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import { Popover } from 'bits-ui'
  import { _ } from 'svelte-i18n'
  import { formatModelDisplayName } from '@/lib/chat/modelDisplayName.js'
  import { formatDate } from '@/lib/utils/utils.js'

  let { modelId = null, usage = null, createdAt = null } = $props()

  // `message.usage` uses the provider-facing field names, which differ between
  // SDK versions — normalize once here rather than at every call site.
  const norm = $derived.by(() => {
    if (!usage) return null
    return {
      input: usage.promptTokens ?? usage.inputTokens ?? null,
      output: usage.completionTokens ?? usage.outputTokens ?? null,
      cached: usage.cachedInputTokens ?? null,
    }
  })

  const hasAnything = $derived(Boolean(modelId || norm || createdAt))

  const createdLabel = $derived(createdAt ? formatDate(createdAt) : null)

  function fmt(n) {
    return n == null ? null : n.toLocaleString()
  }

  // Hover/click behaviour comes from bits-ui itself (`openOnHover` on the
  // trigger): it owns the grace area between the icon and the panel, and
  // converts a hover-open into a click-open so touch and keyboard still work.
</script>

{#if hasAnything}
  <Popover.Root>
    <Popover.Trigger openOnHover openDelay={120} closeDelay={200}>
      {#snippet child({ props })}
        <button
          type="button"
          class="rounded-md p-1 text-text-secondary transition-colors hover:bg-blackwhite-5 hover:text-text-primary"
          aria-label={$_('chat.message_meta.aria_label', {
            default: 'Message details',
          })}
          {...props}
        >
          <Icon icon="heroicons:information-circle" width="14" height="14" />
        </button>
      {/snippet}
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        class="z-50 min-w-[200px] p-0 bg-surface-1 border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12)] animate-[meta-popover-in_120ms_ease-out] dark:bg-surface-2 dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        sideOffset={6}
        align="start"
        side="top"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div class="py-2 px-3 flex flex-col gap-1">
          {#if modelId}
            <div
              class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
            >
              <span class="text-muted whitespace-nowrap"
                >{$_('chat.context_donut.model', { default: 'Model' })}</span
              >
              <span
                class="text-text-primary text-right overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                title={modelId}>{formatModelDisplayName(modelId)}</span
              >
            </div>
          {/if}

          {#if norm?.input != null}
            <div
              class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
            >
              <span class="text-muted whitespace-nowrap"
                >{$_('chat.context_donut.input', { default: 'Input' })}</span
              >
              <span
                class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                >{fmt(norm.input)}</span
              >
            </div>
          {/if}

          {#if norm?.output != null}
            <div
              class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
            >
              <span class="text-muted whitespace-nowrap"
                >{$_('chat.context_donut.output', { default: 'Output' })}</span
              >
              <span
                class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                >{fmt(norm.output)}</span
              >
            </div>
          {/if}

          {#if norm?.cached != null && norm.cached > 0}
            <div
              class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
            >
              <span class="text-muted whitespace-nowrap"
                >{$_('chat.context_donut.cache', { default: 'Cache' })}</span
              >
              <span
                class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                >{fmt(norm.cached)}</span
              >
            </div>
          {/if}

          {#if createdLabel}
            <div
              class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
            >
              <span class="text-muted whitespace-nowrap"
                >{$_('chat.message_meta.created', { default: 'Time' })}</span
              >
              <span
                class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                >{createdLabel}</span
              >
            </div>
          {/if}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{/if}

<style>
  @keyframes meta-popover-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
