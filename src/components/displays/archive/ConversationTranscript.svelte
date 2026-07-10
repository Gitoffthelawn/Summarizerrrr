<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import StreamingMarkdownV2 from '@/components/displays/ui/StreamingMarkdownV2.svelte'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import {
    renameArchivedConversation,
    setArchivedConversationState,
    deleteArchivedConversation,
    exportArchivedConversation,
    resumeArchivedConversation,
  } from '@/stores/conversationArchiveStore.svelte.js'

  let { conversation, messages = [], sources = [], onRefresh = null } = $props()
  let title = $state('')
  let editing = $state(false)
  const sourcesById = $derived(new Map(sources.map((source) => [source.id, source])))

  $effect(() => { title = conversation?.title || '' })
  async function update(action) { await action(); await onRefresh?.() }
  async function saveTitle() { await update(() => renameArchivedConversation(conversation.id, title)); editing = false }
</script>

{#if conversation}
  <article class="prose wrap-anywhere main-sidepanel z-10 mx-auto flex w-full max-w-[52rem] flex-col gap-6 px-6 pt-8 pb-24 dark:prose-invert">
    <header class="not-prose flex flex-col gap-3 border-b border-border pb-4">
      <div class="flex items-start justify-between gap-3">
        {#if editing}
          <input class="flex-1 bg-transparent text-xl font-semibold outline-none" bind:value={title} onkeydown={(event) => event.key === 'Enter' && saveTitle()} onblur={saveTitle} />
        {:else}
          <button class="text-left text-xl font-semibold hover:text-primary" onclick={() => (editing = true)}>{conversation.title}</button>
        {/if}
        <div class="flex gap-1 text-text-secondary">
          <button class="p-1 hover:text-text-primary" title="Resume in side panel" onclick={() => update(() => resumeArchivedConversation(conversation.id))}><Icon icon="heroicons:play-solid" width="18" height="18" /></button>
          <button class="p-1 hover:text-text-primary" title={conversation.archived ? 'Unarchive' : 'Archive'} onclick={() => update(() => setArchivedConversationState(conversation.id, !conversation.archived))}><Icon icon="heroicons:archive-box" width="18" height="18" /></button>
          <button class="p-1 hover:text-text-primary" title="Export Markdown" onclick={() => exportArchivedConversation(conversation.id, 'markdown')}><Icon icon="heroicons:document-text" width="18" height="18" /></button>
          <button class="p-1 hover:text-text-primary" title="Export JSON" onclick={() => exportArchivedConversation(conversation.id, 'json')}><Icon icon="heroicons:code-bracket" width="18" height="18" /></button>
          <button class="p-1 hover:text-error" title="Delete conversation" onclick={() => update(() => deleteArchivedConversation(conversation.id))}><Icon icon="heroicons:trash" width="18" height="18" /></button>
        </div>
      </div>
      <p class="text-xs text-text-secondary">Updated {new Date(conversation.updatedAt).toLocaleString()} · {conversation.archived ? 'Archived' : 'Active'}</p>
    </header>

    {#each messages as message (message.id)}
      <section class="not-prose flex flex-col gap-2 {message.role === 'user' ? 'items-end' : 'items-start'}">
        {#if message.skillInvocation}<span class="rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary">Skill: {message.skillInvocation.skillId}</span>{/if}
        {#if message.attachmentRefs?.length}
          <div class="flex flex-wrap gap-1">{#each message.attachmentRefs as sourceId}<a class="rounded-full border border-border bg-surface-2 px-2 py-1 text-xs text-text-secondary" href={sourcesById.get(sourceId)?.url} target="_blank" rel="noreferrer">{sourcesById.get(sourceId)?.title || 'Captured source'}</a>{/each}</div>
        {/if}
        {#if message.role === 'user'}
          <div class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary/10 px-3.5 py-2 text-sm">{message.content}</div>
        {:else}
          <div class="w-full text-sm"><StreamingMarkdownV2 sourceMarkdown={message.content} enableCursor={false} enableHighlight={true} summaryLang={settings.summaryLang} isLoading={false} /></div>
        {/if}
      </section>
    {:else}
      <p class="not-prose text-text-secondary">This conversation has no messages.</p>
    {/each}
  </article>
{/if}
