<svelte:options runes={true} />

<script>
  // @ts-nocheck
  import ButtonSet from '../buttons/ButtonSet.svelte'
  import { settings, updateSettings } from '../../stores/settingsStore.svelte.js'
  import { toneDefinitions } from '@/lib/prompts/modules/toneDefinitions.js'

  // Chat's tone/length are independent from Settings > Summary. Reusing
  // toneDefinitions here only keeps the wording identical when a tone is
  // shared by name (e.g. "witty") — the two settings are not kept in sync.
  // Response language is the exception: chat always follows the Summary
  // language so users only have to set it in one place.
  const TONE_OPTIONS = [
    { value: '', label: 'none', description: 'No tone instruction.' },
    ...Object.entries(toneDefinitions).map(([value, def]) => ({
      value,
      label: value,
      description: def.toneDescription,
    })),
  ]

  const LENGTH_OPTIONS = [
    { value: '', label: 'none', description: 'No length instruction.' },
    { value: 'short', label: 'short', description: 'Brief replies.' },
    { value: 'medium', label: 'medium', description: 'Moderately detailed replies.' },
    { value: 'long', label: 'long', description: 'Thorough, detailed replies.' },
  ]

  function currentPersona() {
    return settings.chatGlobalPersona || {}
  }

  function patchPersona(patch) {
    const next = {
      content: currentPersona().content || '',
      language: currentPersona().language || null,
      tone: currentPersona().tone || null,
      length: currentPersona().length || null,
      version: (currentPersona().version || 1) + 1,
      ...patch,
    }
    updateSettings({ chatGlobalPersona: next })
  }

  let contentDraft = $state(currentPersona().content || '')
  let saveTimer = null

  function handleContentInput() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => patchPersona({ content: contentDraft.trim() }), 400)
  }
</script>

<!-- Chat Section -->
<div class="setting-block flex flex-col gap-5 pb-6 pt-5">
  <div class="flex items-center h-6 justify-between px-5">
    <label class="block font-bold text-text-primary">Chat</label>
  </div>

  <div class="setting-secsion flex flex-col gap-6 px-5">
    <p class="text-text-secondary">
      Controls the assistant persona used in the chat panel. Tone and reply length
      are independent from Summary settings; response language always follows
      Summary's Language output.
    </p>

    <!-- Custom instructions -->
    <div class="flex flex-col gap-2">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="block text-text-secondary" for="chat-persona-content">
        Custom instructions
      </label>
      <textarea
        id="chat-persona-content"
        bind:value={contentDraft}
        oninput={handleContentInput}
        rows="4"
        placeholder="e.g. Always cite the source you're quoting. Prefer bullet points."
        class="w-full resize-none px-3 py-2 text-text-primary bg-muted/5 dark:bg-muted/5 border border-border hover:border-blackwhite/15 focus:border-blackwhite/30 dark:border-blackwhite/10 dark:focus:border-blackwhite/20 focus:outline-none focus:ring-0 transition-colors duration-150"
      ></textarea>
      <p class="text-[0.65rem] text-text-secondary">
        Applied to every new chat. Existing conversations keep the persona they
        were started with.
      </p>
    </div>

    <!-- Response language -->
    <div class="flex flex-col gap-2">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="block text-text-secondary">Response language</label>
      <p class="text-[0.65rem] text-text-secondary">
        Chat always replies in the same language as
        <strong class="text-text-primary">Summary &gt; Language output</strong>
        (currently <strong class="text-text-primary">{settings.summaryLang}</strong>).
      </p>
    </div>

    <!-- Tone -->
    <div class="flex flex-col gap-2">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="block text-text-secondary">Tone</label>
      <div class="grid grid-cols-3 w-full gap-1">
        {#each TONE_OPTIONS as option (option.value)}
          <ButtonSet
            title={option.label}
            class="setting-btn {(currentPersona().tone || '') === option.value ? 'active' : ''}"
            onclick={() => patchPersona({ tone: option.value || null })}
            Description={option.description}
          ></ButtonSet>
        {/each}
      </div>
    </div>

    <!-- Reply length -->
    <div class="flex flex-col gap-2">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="block text-text-secondary">Reply length</label>
      <div class="grid grid-cols-4 w-full gap-1">
        {#each LENGTH_OPTIONS as option (option.value)}
          <ButtonSet
            title={option.label}
            class="setting-btn {(currentPersona().length || '') === option.value ? 'active' : ''}"
            onclick={() => patchPersona({ length: option.value || null })}
            Description={option.description}
          ></ButtonSet>
        {/each}
      </div>
    </div>
  </div>
</div>
