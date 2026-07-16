<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import ChatSkillChip from './ChatSkillChip.svelte'
  import ChatContextBar from './ChatContextBar.svelte'
  import ChatModelSelect from './ChatModelSelect.svelte'
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
    notifyChatDraftChanged,
  } from '@/stores/chatStore.svelte.js'
  import { skillService } from '@/lib/chat/skills/skillService.js'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import {
    resolveAutoSourceKind,
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

  // Whether ChatContextBar has anything to render — mirrors its internal
  // visibility condition so the attached-tab overlap only applies when shown.
  let hasContextBar = $derived(
    (activeSourceKind && !chatState.activeSourceDismissed) ||
      chatState.pendingAttachments.length > 0 ||
      (chatState.currentUrl && chatState.activeSourceDismissed)
  )

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
  {#if chatState.selectedSkill}
    <div class="flex flex-wrap items-center gap-1.5">
      <ChatSkillChip skill={chatState.selectedSkill} onClear={clearSkill} />
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

    <!-- Context bar: attached tab, inset on both sides, tucked under the chat box -->
    <div class="mx-3 {hasContextBar ? '-mb-1.5' : ''}">
      <ChatContextBar
        currentUrl={chatState.currentUrl}
        currentTitle={chatState.currentTitle}
        currentFavIconUrl={chatState.currentFavIconUrl}
        {activeSourceKind}
        activeSourceDismissed={chatState.activeSourceDismissed}
        pendingAttachments={chatState.pendingAttachments}
        onDismissActiveSource={dismissActiveSource}
        onRestoreActiveSource={restoreActiveSource}
        onRemoveAttachment={removeTabAttachment}
      />
    </div>

    <!-- Composer box: text input on top, controls row on the bottom -->
    <div
      class="relative z-10 flex flex-col gap-1 rounded-[1.625rem] border border-muted/30 bg-surface-2 px-4 py-2.5"
    >
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
            placeholder="Describe a task or ask a question"
          />
        {/key}
      {:else}
        <ChatComposerInput
          bind:this={textareaEl}
          value={chatState.composerText}
          oninput={handleComposerInput}
          onkeydown={handleKeydown}
          disabled={chatState.isSending}
          placeholder="Describe a task or ask a question"
        />
      {/if}

      <!-- Controls row: Model + effort (left) | Send (right) -->
      <div class="flex items-center justify-between gap-1.5">
        <ChatModelSelect />
        <button
          type="button"
          class="z-20 flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 {chatState.isSending
            ? 'bg-error text-whiteblack hover:bg-error/90'
            : canSendChat()
              ? 'dark:bg-white !bg-black !text-white ring-black hover:ring-2 dark:ring-white'
              : '!scale-90 !bg-muted/30 text-muted cursor-not-allowed'}"
          disabled={!chatState.isSending && !canSendChat()}
          aria-label={chatState.isSending ? 'Stop generating' : 'Send message'}
          onclick={handleSend}
        >
          {#if chatState.isSending}
            <Icon icon="heroicons:stop-solid" width="16" height="16" />
          {:else}
            <Icon icon="heroicons:arrow-long-right" width="18" height="18" />
          {/if}
        </button>
      </div>
    </div>

    {#if composerError}<p class="mt-1 text-xs text-error">
        {composerError}
      </p>{/if}
  </div>
</div>
