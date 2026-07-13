<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import ChatSkillChip from './ChatSkillChip.svelte'
  import ChatSourceChip from './ChatSourceChip.svelte'
  import SkillPicker from './SkillPicker.svelte'
  import TabMentionMenu from './TabMentionMenu.svelte'
  import ChatComposerInput from './ChatComposerInput.svelte'
  import ChatRichTextInput from './ChatRichTextInput.svelte'
  import {
    chatState,
    chatTabsState,
    canSendChat,
    sendChatMessage,
    stopGeneration,
    selectChatSkill,
    addTabAttachment,
    removeTabAttachment,
    dismissActiveSource,
    restoreActiveSource,
  } from '@/stores/chatStore.svelte.js'
  import { skillService } from '@/lib/chat/skills/skillService.js'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import {
    resolveAutoSourceKind,
    labelForSourceKind,
    iconForSourceKind,
    activeSourceLabelForUrl,
  } from '@/services/chat/sourceResolution.js'

  let { autofocus = false } = $props()

  // The effective source kind for the current page. Precedence mirrors
  // chatService.prepareGroundedAttachments: skill sourceMode → auto.
  let activeSourceKind = $derived.by(() => {
    const url = chatState.currentUrl || ''
    if (!url) return null
    const skillMode = chatState.selectedSkill?.sourceMode
    if (skillMode && skillMode !== 'auto') return skillMode
    return resolveAutoSourceKind(url)
  })

  let richTextRef = $state(null)
  let textareaEl = $state(null)
  let mentionMenuRef = $state(null)
  let skillMenuRef = $state(null)
  let editorError = $state(false)

  let skills = $state([])
  let mentionOpen = $state(false)
  let mentionQuery = $state('')
  let mentionRange = $state(null)
  let skillOpen = $state(false)
  let skillQuery = $state('')
  let skillRange = $state(null)
  let composerError = $state('')

  /**
   * Resolve the kind/label/icon for an attachment chip.
   * Comment entries carry their own sourceKind; tab entries resolve via the URL.
   */
  function resolveAttachmentDisplay(attachment) {
    const kind = attachment.sourceKind || resolveAutoSourceKind(attachment.url || '')
    return {
      kind,
      kindLabel: labelForSourceKind(kind),
      icon: iconForSourceKind(kind),
    }
  }

  $effect(() => {
    settings.chatUserSkills
    skills = skillService.listSkills(settings)
  })

  export function focus() {
    if (!editorError && richTextRef) {
      richTextRef.focus()
    } else {
      textareaEl?.focus()
    }
  }

  function handleKeydown(event) {
    if (skillOpen && skillMenuRef?.handleKeyDown(event)) return
    if (mentionOpen && mentionMenuRef?.handleKeyDown(event)) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  function handleRichTextKeyDown(event) {
    if (skillOpen && skillMenuRef) {
      return skillMenuRef.handleKeyDown(event)
    }
    if (mentionOpen && mentionMenuRef) {
      return mentionMenuRef.handleKeyDown(event)
    }
    return false
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

  function handleComposerChange(markdown) {
    chatState.composerText = markdown
  }

  function handleComposerInput(event) {
    chatState.composerText = event.currentTarget.value
    const match = chatState.composerText.match(/(?:^|\s)@([^\s@]*)$/)
    mentionOpen = Boolean(match)
    mentionQuery = match?.[1] || ''
    const skillMatch = chatState.composerText.match(/(?:^|\s)\/([^\s/]*)$/)
    skillOpen = Boolean(skillMatch)
    skillQuery = skillMatch?.[1] || ''
    if (mentionOpen) skillOpen = false
    if (skillOpen) mentionOpen = false
  }

  function handleMentionChange({ open, query, range }) {
    mentionOpen = open
    mentionQuery = query
    mentionRange = range
  }

  function handleSkillChange({ open, query, range }) {
    skillOpen = open
    skillQuery = query
    skillRange = range
  }

  function handleInitError(err) {
    console.warn(
      '[ChatComposer] Fallback to textarea due to editor init error:',
      err,
    )
    editorError = true
  }

  async function handleTabSelect(tab) {
    try {
      await addTabAttachment(tab)
      if (!editorError && richTextRef) {
        richTextRef.deleteRange(mentionRange)
        richTextRef.focus()
      } else {
        chatState.composerText = chatState.composerText.replace(
          /(?:^|\s)@[^\s@]*$/,
          (value) => (value.startsWith(' ') ? ' ' : ''),
        )
        textareaEl?.focus()
      }
      composerError = ''
    } catch (error) {
      composerError = error.message
    }
  }

  function handleSkillSelect(skill) {
    selectChatSkill(skill)
    if (!editorError && richTextRef) {
      richTextRef.deleteRange(skillRange)
      richTextRef.focus()
    } else {
      chatState.composerText = chatState.composerText.replace(
        /(?:^|\s)\/[^\s/]*$/,
        (value) => (value.startsWith(' ') ? ' ' : ''),
      )
      textareaEl?.focus()
    }
  }

  $effect(() => {
    if (autofocus) {
      if (!editorError && richTextRef) richTextRef.focus()
      else textareaEl?.focus()
    }
  })
</script>

<div class="flex w-full flex-col gap-2 px-3 pt-2 pb-3">
  {#if chatState.selectedSkill || chatState.currentUrl || chatState.pendingAttachments.length}
    <div class="flex flex-wrap items-center gap-1.5">
      <ChatSkillChip skill={chatState.selectedSkill} onClear={clearSkill} />
      {#if activeSourceKind && !chatState.activeSourceDismissed}
        <ChatSourceChip
          label={activeSourceLabelForUrl(chatState.currentUrl || '')}
          icon={iconForSourceKind(activeSourceKind)}
          kindLabel={labelForSourceKind(activeSourceKind)}
          onRemove={dismissActiveSource}
        />
      {:else if chatState.currentUrl && chatState.activeSourceDismissed}
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-tertiary transition-colors hover:border-text-tertiary hover:text-text-secondary"
          onclick={restoreActiveSource}
          title="Add this page as context"
        >
          <Icon icon="heroicons:plus" width="14" height="14" />
          {activeSourceLabelForUrl(chatState.currentUrl || '')}
        </button>
      {/if}
      {#each chatState.pendingAttachments as attachment (`${attachment.tabId}-${attachment.sourceKind || 'auto'}`)}
        {@const display = resolveAttachmentDisplay(attachment)}
        <ChatSourceChip
          label={attachment.title || attachment.hostname || 'Attached tab'}
          icon={display.icon}
          kindLabel={display.kindLabel}
          estimatedTokens={attachment.estimatedTokens}
          estimating={attachment.estimating}
          onRemove={() => removeTabAttachment(attachment.tabId, attachment.sourceKind)}
        />
      {/each}
    </div>
  {/if}

  <div class="relative">
    <TabMentionMenu
      bind:this={mentionMenuRef}
      open={mentionOpen}
      query={mentionQuery}
      attachments={chatState.pendingAttachments}
      onSelect={handleTabSelect}
      onClose={() => (mentionOpen = false)}
    />
    <SkillPicker
      bind:this={skillMenuRef}
      open={skillOpen}
      query={skillQuery}
      {skills}
      onSelect={handleSkillSelect}
      onClose={() => (skillOpen = false)}
    />
    <div class="relative">
      {#if !editorError}
        {#key chatTabsState.activeSessionTabId}
          <ChatRichTextInput
            bind:this={richTextRef}
            value={chatState.composerText}
            onchange={handleComposerChange}
            onkeydown={handleRichTextKeyDown}
            onmentionchange={handleMentionChange}
            onskillchange={handleSkillChange}
            oniniterror={handleInitError}
            onsubmit={handleSend}
            disabled={chatState.isSending}
            placeholder="Ask about this page..."
          />
        {/key}
      {:else}
        <ChatComposerInput
          bind:this={textareaEl}
          value={chatState.composerText}
          oninput={handleComposerInput}
          onkeydown={handleKeydown}
          disabled={chatState.isSending}
          placeholder="Ask about this page..."
        />
      {/if}

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
    {#if composerError}<p class="mt-1 text-xs text-error">
        {composerError}
      </p>{/if}
  </div>
</div>
