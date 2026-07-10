<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import ChatSkillChip from './ChatSkillChip.svelte'
  import ChatSourceChip from './ChatSourceChip.svelte'
  import SkillPicker from './SkillPicker.svelte'
  import TabMentionMenu from './TabMentionMenu.svelte'
  import ChatComposerInput from './ChatComposerInput.svelte'
  import {
    chatState,
    canSendChat,
    sendChatMessage,
    stopGeneration,
    selectChatSkill,
    consumeLeadingSkillCommand,
    addTabAttachment,
    removeTabAttachment,
  } from '@/stores/chatStore.svelte.js'
  import { skillService } from '@/lib/chat/skills/skillService.js'
  import { settings } from '@/stores/settingsStore.svelte.js'

  let { autofocus = false } = $props()

  let textareaEl = $state()
  let skills = $state([])
  let mentionOpen = $state(false)
  let mentionQuery = $state('')
  let composerError = $state('')

  $effect(() => {
    settings.chatUserSkills
    skills = skillService.listSkills(settings)
  })

  export function focus() {
    textareaEl?.focus()
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    if (chatState.isSending) {
      stopGeneration()
      return
    }
    if (!canSendChat()) return
    sendChatMessage()
  }

  function clearSkill() {
    chatState.selectedSkill = null
  }

  function handleComposerInput(event) {
    chatState.composerText = event.currentTarget.value
    consumeLeadingSkillCommand(chatState.composerText)
    const match = chatState.composerText.match(/(?:^|\s)@([^\s@]*)$/)
    mentionOpen = Boolean(match)
    mentionQuery = match?.[1] || ''
  }

  async function handleTabSelect(tab) {
    try {
      await addTabAttachment(tab)
      chatState.composerText = chatState.composerText.replace(/(?:^|\s)@[^\s@]*$/, (value) => value.startsWith(' ') ? ' ' : '')
      composerError = ''
      textareaEl?.focus()
    } catch (error) { composerError = error.message }
  }

  function handleSkillSelect(skill) {
    selectChatSkill(skill)
    textareaEl?.focus()
  }

  $effect(() => {
    if (autofocus) textareaEl?.focus()
  })
</script>

<div class="flex w-full flex-col gap-2 border-t border-border bg-surface-1 px-3 pt-2 pb-3">
  {#if chatState.selectedSkill || chatState.pendingAttachments.length}
    <div class="flex flex-wrap items-center gap-1.5">
      <ChatSkillChip skill={chatState.selectedSkill} onClear={clearSkill} />
      {#each chatState.pendingAttachments as attachment (attachment.tabId)}
        <ChatSourceChip label={attachment.title || attachment.hostname || 'Attached tab'} onRemove={() => removeTabAttachment(attachment.tabId)} />
      {/each}
    </div>
  {/if}

  <div class="relative">
  <TabMentionMenu open={mentionOpen} query={mentionQuery} onSelect={handleTabSelect} onClose={() => (mentionOpen = false)} />
  <div class="relative">
    <ChatComposerInput
      bind:this={textareaEl}
      value={chatState.composerText}
      oninput={handleComposerInput}
      onkeydown={handleKeydown}
      disabled={chatState.isSending}
      placeholder="Ask about this page..."
    />

    <div class="absolute bottom-1.5 left-1.5 z-20">
      <SkillPicker {skills} onSelect={handleSkillSelect} />
    </div>

    <button
      type="button"
      class="absolute bottom-1.5 right-1.5 z-20 flex size-10 items-center justify-center rounded-full transition-all duration-300 {chatState.isSending
        ? 'bg-error text-whiteblack hover:bg-error/90'
        : canSendChat()
          ? 'dark:bg-white !bg-black !text-white ring-black hover:ring-2 dark:ring-white'
          : '!scale-75 !bg-muted/30 text-muted cursor-not-allowed'}"
      disabled={!chatState.isSending && !canSendChat()}
      aria-label={chatState.isSending ? 'Stop generating' : 'Send message'}
      onclick={handleSend}
    >
      {#if chatState.isSending}
        <Icon icon="heroicons:stop-solid" width="18" height="18" />
      {:else}
        <Icon icon="heroicons:arrow-long-right" width="20" height="20" />
      {/if}
    </button>
  </div>
  {#if composerError}<p class="mt-1 text-xs text-error">{composerError}</p>{/if}
  </div>
</div>
