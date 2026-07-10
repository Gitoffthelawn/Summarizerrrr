<script>
  // @ts-nocheck
  import { DropdownMenu } from 'bits-ui'
  import Icon from '@iconify/svelte'
  import { listRecentConversations } from '@/stores/chatStore.svelte.js'

  let {
    activeConversationId = null,
    onNewChat = null,
    onRename = null,
    onArchive = null,
    onOpenConversation = null,
    onShowLegacySummary = null,
  } = $props()

  let recentConversations = $state([])

  async function loadRecent(open) {
    if (!open) return
    try {
      recentConversations = await listRecentConversations({ limit: 8 })
    } catch (error) {
      console.error('[ConversationMenu] Failed to load conversations:', error)
      recentConversations = []
    }
  }
</script>

<DropdownMenu.Root onOpenChange={loadRecent}>
  <DropdownMenu.Trigger asChild>
    {#snippet children({ builder })}
      <button
        class="p-1.5 hover:text-text-primary relative text-text-secondary"
        aria-label="Conversation menu"
        {...builder}
      >
        <Icon icon="tabler:dots-vertical" width="18" height="18" />
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="bg-surface-1 dark:bg-surface-2 border border-border rounded-md shadow-lg z-50 min-w-52 max-h-96 overflow-y-auto"
      sideOffset={5}
      align="end"
    >
      <DropdownMenu.Item
        class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
        onSelect={() => onNewChat?.()}
      >
        <Icon icon="heroicons:plus" width="18" height="18" />
        <span>New chat</span>
      </DropdownMenu.Item>

      {#if activeConversationId}
        <DropdownMenu.Item
          class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
          onSelect={() => onRename?.()}
        >
          <Icon icon="tabler:pencil" width="18" height="18" />
          <span>Rename</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
          onSelect={() => onArchive?.()}
        >
          <Icon icon="heroicons:archive-box" width="18" height="18" />
          <span>Archive</span>
        </DropdownMenu.Item>
      {/if}

      {#if recentConversations.length}
        <div class="border-t border-border my-1"></div>
        <div class="px-4 pt-1.5 pb-1 text-[0.65rem] uppercase tracking-wide text-text-secondary">
          Recent conversations
        </div>
        {#each recentConversations as conversation (conversation.id)}
          <DropdownMenu.Item
            class="px-4 py-2 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex flex-col gap-0 text-sm {conversation.id ===
            activeConversationId
              ? 'text-primary'
              : ''}"
            onSelect={() => onOpenConversation?.(conversation.id)}
          >
            <span class="line-clamp-1">{conversation.title || 'Untitled conversation'}</span>
          </DropdownMenu.Item>
        {/each}
      {/if}

      <div class="border-t border-border my-1"></div>
      <DropdownMenu.Item
        class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm text-text-secondary"
        onSelect={() => onShowLegacySummary?.()}
      >
        <Icon icon="heroicons:computer-desktop" width="18" height="18" />
        <span>Legacy summary view</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
