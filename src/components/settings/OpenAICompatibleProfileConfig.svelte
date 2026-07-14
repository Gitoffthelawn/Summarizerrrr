<svelte:options runes={true} />

<script>
  // @ts-nocheck
  import { t } from 'svelte-i18n'
  import Icon from '@iconify/svelte'
  import ApiKeyInputMulti from '../inputs/ApiKeyInputMulti.svelte'
  import {
    settings,
    updateOpenAICompatibleProfile,
  } from '@/stores/settingsStore.svelte.js'
  import { findProfileById, validateBaseUrl } from '@/lib/providers/openAICompatibleProfiles.js'

  let { profileId, onRemove = () => {} } = $props()

  // Find the profile in settings
  const profile = $derived(
    findProfileById(settings.openaiCompatibleProfiles || [], profileId)
  )

  // Local draft values
  let nameDraft = $state('')
  let baseUrlDraft = $state('')
  let apiKeyDraft = $state('')
  let defaultModelDraft = $state('')

  // Sync draft from settings when profileId changes or settings change
  $effect(() => {
    if (profile) {
      nameDraft = profile.name || ''
      baseUrlDraft = profile.baseUrl || ''
      apiKeyDraft = profile.apiKey || ''
      defaultModelDraft = profile.defaultModel || ''
    }
  })

  // Validation states
  const isNameInvalid = $derived(nameDraft.trim().length === 0)
  const isBaseUrlInvalid = $derived(!validateBaseUrl(baseUrlDraft))
  const isDefaultModelInvalid = $derived(defaultModelDraft.trim().length === 0)

  // Save actions
  function saveName() {
    if (!isNameInvalid && nameDraft.trim() !== profile?.name) {
      updateOpenAICompatibleProfile(profileId, { name: nameDraft })
    }
  }

  function saveBaseUrl() {
    if (!isBaseUrlInvalid && baseUrlDraft.trim() !== profile?.baseUrl) {
      updateOpenAICompatibleProfile(profileId, { baseUrl: baseUrlDraft })
    }
  }

  function saveApiKey(key) {
    if (key.trim().length > 0 && key.trim() !== profile?.apiKey) {
      updateOpenAICompatibleProfile(profileId, { apiKey: key })
    }
  }

  function saveDefaultModel() {
    if (!isDefaultModelInvalid && defaultModelDraft.trim() !== profile?.defaultModel) {
      updateOpenAICompatibleProfile(profileId, { defaultModel: defaultModelDraft })
    }
  }
</script>

<div class="px-4 pb-4 flex flex-col gap-3 border border-border bg-muted/5 mt-3">
  <!-- Profile Name Input -->
  <div class="flex flex-col gap-1.5 mt-3">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-xs text-text-secondary font-medium">
      {$t('settings.openai_profile_config.name_label', { default: 'Profile Name' })}
    </label>
    <input
      type="text"
      id={`${profileId}-name`}
      class="text-xs w-full px-3 py-2 bg-muted/5 dark:bg-muted/5 border border-border hover:border-blackwhite/15 focus:border-blackwhite/30 dark:border-blackwhite/10 dark:focus:border-blackwhite/20 focus:outline-none focus:ring-0 transition-colors duration-150"
      bind:value={nameDraft}
      onblur={saveName}
      placeholder="e.g. Together AI"
    />
  </div>

  <!-- Base URL Input -->
  <div class="flex flex-col gap-1.5">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-xs text-text-secondary font-medium">
      {$t('settings.openai_profile_config.base_url_label', { default: 'Base URL' })}
    </label>
    <input
      type="text"
      id={`${profileId}-base-url`}
      class="font-mono text-xs w-full px-3 py-2 bg-muted/5 dark:bg-muted/5 border border-border hover:border-blackwhite/15 focus:border-blackwhite/30 dark:border-blackwhite/10 dark:focus:border-blackwhite/20 focus:outline-none focus:ring-0 transition-colors duration-150"
      bind:value={baseUrlDraft}
      onblur={saveBaseUrl}
      placeholder="https://api.example.com/v1"
    />
  </div>

  <!-- API Key Input -->
  <div>
    <ApiKeyInputMulti
      bind:apiKey={apiKeyDraft}
      label={$t('settings.openai_profile_config.api_key_label', { default: 'API Key' })}
      placeholder={$t('settings.provider_key_config.api_key_placeholder', { default: 'Enter API Key' })}
      id={`${profileId}-api-key`}
      onSave={saveApiKey}
      linkHref=""
      linkText=""
    />
  </div>

  <!-- Default Model Input -->
  <div class="flex flex-col gap-1.5">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="text-xs text-text-secondary font-medium">
      {$t('settings.openai_profile_config.default_model_label', { default: 'Default Model ID' })}
    </label>
    <input
      type="text"
      id={`${profileId}-default-model`}
      class="font-mono text-xs w-full px-3 py-2 bg-muted/5 dark:bg-muted/5 border border-border hover:border-blackwhite/15 focus:border-blackwhite/30 dark:border-blackwhite/10 dark:focus:border-blackwhite/20 focus:outline-none focus:ring-0 transition-colors duration-150"
      bind:value={defaultModelDraft}
      onblur={saveDefaultModel}
      placeholder="e.g. meta-llama/Llama-3-70b-chat"
    />
  </div>

  <!-- Remove Profile Button -->
  <div class="flex justify-end mt-2">
    <button
      type="button"
      class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border border-transparent hover:border-red-200 dark:hover:border-red-900 transition-all rounded-sm cursor-pointer"
      onclick={onRemove}
    >
      <Icon icon="heroicons:trash" width="14" height="14" />
      {$t('settings.openai_profile_config.delete_profile', { default: 'Delete Profile' })}
    </button>
  </div>
</div>
