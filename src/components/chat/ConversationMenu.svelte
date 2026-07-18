<script>
  // @ts-nocheck
  import { DropdownMenu } from 'bits-ui'
  import Icon from '@iconify/svelte'
  import { listRecentConversations } from '@/stores/chatStore.svelte.js'

  let {
    activeConversationId = null,
    onRename = null,
    onArchive = null,
    onOpenConversation = null,
    onShowLegacySummary = null,
    onOpenHistory = null,
    onOpenSettings = null,
  } = $props()

  const RECENT_LIMIT = 5
  const HISTORY_LIMIT = 50

  let recentConversations = $state([])
  let historyConversations = $state([])
  let view = $state('menu') // 'menu' | 'history'

  async function loadRecent(open) {
    if (!open) {
      view = 'menu'
      return
    }
    try {
      recentConversations = await listRecentConversations({ limit: RECENT_LIMIT })
    } catch (error) {
      console.error('[ConversationMenu] Failed to load conversations:', error)
      recentConversations = []
    }
  }

  async function showHistory(event) {
    event.preventDefault()
    try {
      historyConversations = await listRecentConversations({ limit: HISTORY_LIMIT })
    } catch (error) {
      console.error('[ConversationMenu] Failed to load conversation history:', error)
      historyConversations = []
    }
    view = 'history'
  }

  function backToMenu(event) {
    event.preventDefault()
    view = 'menu'
  }
</script>

<DropdownMenu.Root onOpenChange={loadRecent}>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <button
        class="p-1.5 hover:text-text-primary relative text-text-secondary"
        aria-label="Conversation menu"
        {...props}
      >
        <Icon icon="tabler:dots-vertical" width="20" height="20" />
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="bg-surface-1 dark:bg-surface-2 border border-border rounded-md shadow-lg z-50 w-80"
      sideOffset={5}
      align="end"
    >
      {#if view === 'history'}
        <div class="flex items-center gap-1 px-2 pt-1.5 pb-1">
          <button
            class="p-1 text-text-secondary hover:text-text-primary"
            aria-label="Back"
            onclick={backToMenu}
          >
            <Icon icon="tabler:arrow-left" width="18" height="18" />
          </button>
          <span class="text-[0.7rem] uppercase tracking-wide text-text-secondary">History</span>
        </div>
        <div class="history-scroll max-h-80 overflow-y-auto">
          {#each historyConversations as conversation (conversation.id)}
            <DropdownMenu.Item
              class="px-4 py-2 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex flex-col gap-0 text-sm {conversation.id ===
              activeConversationId
                ? 'text-primary'
                : ''}"
              onSelect={() => onOpenConversation?.(conversation.id)}
            >
              <span class="truncate block">{conversation.title || 'Untitled conversation'}</span>
            </DropdownMenu.Item>
          {/each}
        </div>
      {:else}
        {#if recentConversations.length}
          <div class="px-4 pt-1.5 pb-1 text-[0.7rem] uppercase tracking-wide text-text-secondary">
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
              <span class="truncate block">{conversation.title || 'Untitled conversation'}</span>
            </DropdownMenu.Item>
          {/each}
          <DropdownMenu.Item
            class="px-4 py-2 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm text-text-secondary"
            closeOnSelect={false}
            onSelect={showHistory}
          >
            <span>More</span>
            <Icon icon="tabler:chevron-right" width="16" height="16" class="ml-auto" />
          </DropdownMenu.Item>
        {/if}

        {#if activeConversationId}
          <DropdownMenu.Item
            class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
            onSelect={() => onRename?.()}
          >
            <Icon icon="tabler:pencil" width="20" height="20" />
            <span>Rename</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
            onSelect={() => onArchive?.()}
          >
            <Icon icon="heroicons:archive-box" width="20" height="20" />
            <span>Archive</span>
          </DropdownMenu.Item>
        {/if}

        <div class="border-t border-border my-1"></div>

        <DropdownMenu.Item
          class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
          onSelect={() => onOpenHistory?.()}
        >
          <Icon icon="solar:history-linear" width="20" height="20" />
          <span>History</span>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm"
          onSelect={() => onOpenSettings?.()}
        >
          <Icon icon="heroicons:cog-6-tooth" width="20" height="20" />
          <span>Settings</span>
        </DropdownMenu.Item>

        <div class="border-t border-border my-1"></div>
        <DropdownMenu.Item
          class="px-4 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-surface-3 flex items-center gap-2 text-sm text-text-secondary"
          onSelect={() => onShowLegacySummary?.()}
        >
          <Icon icon="heroicons:computer-desktop" width="20" height="20" />
          <span>Legacy summary view</span>
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .history-scroll {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  .history-scroll:hover {
    scrollbar-color: var(--color-border) transparent;
  }

  .history-scroll::-webkit-scrollbar {
    width: 4px;
    background: transparent;
  }

  .history-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .history-scroll::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
  }

  .history-scroll:hover::-webkit-scrollbar-thumb {
    background: var(--color-border);
  }
</style>
