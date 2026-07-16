<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import { t } from 'svelte-i18n'
  import { slideScaleFade } from '@/lib/ui/slideScaleFade.js'
  import {
    conversationArchiveStore,
    selectConversation,
    setArchivedConversationState,
    deleteArchivedConversation,
    resumeArchivedConversation,
  } from '@/stores/conversationArchiveStore.svelte.js'

  let { onRefresh = null } = $props()

  let deleteCandidateId = $state(null)
  let deleteTimeoutId = $state(null)
  let isConfirmingDelete = $state(false)

  async function run(action) {
    await action()
    await onRefresh?.()
  }

  function handleDeleteClick(id) {
    if (isConfirmingDelete && deleteCandidateId === id) {
      clearTimeout(deleteTimeoutId)
      run(() => deleteArchivedConversation(id))
      isConfirmingDelete = false
      deleteCandidateId = null
    } else {
      deleteCandidateId = id
      isConfirmingDelete = true
      deleteTimeoutId = setTimeout(() => {
        isConfirmingDelete = false
        deleteCandidateId = null
      }, 3000)
    }
  }
</script>

{#each conversationArchiveStore.conversationList as conversation (conversation.id)}
  <div class="relative group h-10">
    <button
      class="list-button w-full relative p-2.5 pr-8 text-left hover:bg-blackwhite/5 rounded-md {conversationArchiveStore.selectedConversationId ==
      conversation.id
        ? 'text-text-primary bg-neutral-100 hover:bg-white/60 dark:hover:bg-white/10 dark:bg-surface-2 active '
        : 'hover:bg-surface-1 dark:hover:bg-surface-2'}"
      onclick={() => selectConversation(conversation)}
      title={conversation.title}
    >
      <div
        class="line-clamp-1 transition-colors w-full mask-r-from-85% mask-r-to-100%"
      >
        {conversation.title}
      </div>
    </button>
    <div
      class="text-text-muted justify-center rounded-r-sm items-center bg-linear-to-l from-surface-1 dark:from-surface-2 from-80% to-surface-1/0 dark:to-surface-2/0 top-0 bottom-0 pl-4 pr-1 right-0 absolute hidden group-hover:flex"
    >
      <button
        onclick={() => run(() => resumeArchivedConversation(conversation.id))}
        class="p-1 hover:text-text-primary"
        title="Resume in side panel"
      >
        <Icon icon="heroicons:play-solid" width="20" height="20" />
      </button>
      <button
        onclick={() =>
          run(() =>
            setArchivedConversationState(
              conversation.id,
              !conversation.archived,
            ),
          )}
        class="p-1 hover:text-text-primary"
        title={conversation.archived
          ? $t('tags.remove_from_archive')
          : $t('tags.add_to_archive')}
      >
        <Icon
          icon={conversation.archived
            ? 'heroicons:archive-box-solid'
            : 'heroicons:archive-box'}
          width="20"
          height="20"
        />
      </button>
      <button
        onclick={() => handleDeleteClick(conversation.id)}
        class="relative rounded-3xl transition-colors duration-150 p-1 {isConfirmingDelete &&
        deleteCandidateId === conversation.id
          ? 'text-red-50'
          : 'hover:text-text-primary'}"
        title={$t('tags.delete')}
      >
        <Icon
          icon="heroicons:trash"
          width="20"
          height="20"
          class="relative z-10"
        />
        {#if isConfirmingDelete && deleteCandidateId === conversation.id}
          <span
            transition:slideScaleFade={{
              duration: 150,
              slideFrom: 'bottom',
              startScale: 0.4,
              slideDistance: '0rem',
            }}
            class="rounded-sm block bg-error absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-7"
          >
          </span>
        {/if}
      </button>
    </div>
  </div>
{:else}
  <div class="px-2 py-4 text-text-muted text-xs">No conversations yet.</div>
{/each}

<div class="">&nbsp;</div>

<style>
  .list-button::after {
    content: '';
    display: block;
    width: 0px;
    position: absolute;
    background: white;
    top: 50%;
    transform: translateY(-50%) translateX(-0.25rem);
    right: -0.5rem;
    left: -0.5rem;
    height: 1rem;
    border-radius: 0 4px 4px 0;
    transition: all 0.3s ease-in-out;
    box-shadow:
      0 0 2px #ffffff18,
      0 0 0 #ffffff18;
  }

  .list-button.active {
    &::after {
      transform: translateY(-50%) translateX(1px);
      width: 4px;
      box-shadow:
        4px 0 8px 2px #ffffff71,
        0 0 3px 1px #ffffff94;
    }
  }
</style>
