<svelte:options runes={true} />

<script>
  // @ts-nocheck
  import ButtonSet from '../buttons/ButtonSet.svelte'
  import { settings, updateSettings, updateFeatureSettings } from '../../stores/settingsStore.svelte.js'
  import { CHAT_TONE_ROLES } from '@/lib/chat/chatToneRoles.js'
  import FeatureModelPicker from '../inputs/FeatureModelPicker.svelte'
  import { t } from 'svelte-i18n'

  // Chat's tone is independent from Settings > Summary and uses its own
  // chat-native tone roles (CHAT_TONE_ROLES) rather than the summarize-flow
  // toneDefinitions. Response language is the exception: chat always follows
  // the Summary language so users only have to set it in one place.
  const TONE_OPTIONS = [
    { value: '', label: 'none', description: 'No tone instruction.' },
    ...Object.entries(CHAT_TONE_ROLES).map(([value, def]) => ({
      value,
      label: value,
      description: def.toneDescription,
    })),
  ]



  function currentPersona() {
    return settings.chatGlobalPersona || {}
  }

  function patchPersona(patch) {
    const next = {
      content: currentPersona().content || '',
      language: currentPersona().language || null,
      tone: currentPersona().tone || null,
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
      Controls the assistant persona used in the chat panel. Tone is
      independent from Summary settings; response language always follows
      Summary's Language output.
    </p>

    <!-- Chat Model Picker -->
    <div class="flex flex-col gap-2">
      {#if settings.isAdvancedMode}
        <FeatureModelPicker
          bind:provider={settings.chat.provider}
          bind:model={settings.chat.model}
          onchange={(p, m) => updateFeatureSettings('chat', { provider: p, model: m })}
        />
      {:else}
        <div class="flex flex-col gap-1.5">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="text-xs text-text-secondary">{$t('settings.feature_model_picker.model_label', { default: 'Model Name' })}</label>
          <div class="text-xs font-mono text-text-secondary bg-muted/5 dark:bg-muted/5 border border-border px-3 py-2">
            {$t('settings.summary.uses_gemini_basic', { default: 'Uses Gemini Basic' })}
          </div>
        </div>
      {/if}
    </div>

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
        placeholder="e.g. Distinguish source facts from general knowledge. Prefer bullet points."
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
  </div>
</div>
