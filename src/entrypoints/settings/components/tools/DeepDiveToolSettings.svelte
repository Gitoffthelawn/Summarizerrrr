<script>
  // @ts-nocheck
  import { t } from 'svelte-i18n'
  import { settings, updateSettings } from '@/stores/settingsStore.svelte.js'
  import { updateToolSettings as updateToolSettingsStore } from '@/stores/settingsStore.svelte.js'
  import { TASK_REASONING_CHOICES } from '@/lib/api/reasoningConfig.js'
  import Icon from '@iconify/svelte'
  import ButtonSet from '@/components/buttons/ButtonSet.svelte'
  import ToolIcon96 from '@/entrypoints/settings/components/ui/ToolIcon96.svelte'
  import ToolEnableToggle from '@/entrypoints/settings/components/inputs/ToolEnableToggle.svelte'
  import FeatureModelPicker from '@/entrypoints/settings/components/inputs/FeatureModelPicker.svelte'

  // ✅ Computed value cho tool settings
  let toolSettings = $derived.by(() => settings.tools?.deepDive ?? {})

  /**
   * Helper function để update tool settings với patch object
   */
  function updateToolSettings(patch) {
    updateSettings({
      tools: {
        ...settings.tools,
        deepDive: {
          ...settings.tools.deepDive,
          ...patch,
        },
      },
    })
  }

  // Force useGeminiBasic = false so toolProviderService always resolves
  // the custom provider path. Initialize customProvider/customModel if absent.
  $effect(() => {
    const dd = settings.tools?.deepDive
    if (!dd) return
    if (dd.useGeminiBasic) {
      const updates = { useGeminiBasic: false }
      if (!dd.customProvider) {
        updates.customProvider = settings.selectedProvider || 'gemini'
        updates.customModel = 'gemma-4-26b-a4b-it'
      }
      updateToolSettings(updates)
    }
  })

  /**
   * Toggle auto generate mode
   */
  function toggleAutoGenerate(value) {
    updateToolSettings({ autoGenerate: value })
  }
</script>

<div class="flex flex-col gap-6 py-5">
  <!-- Tool Header/Introduction -->
  <div class="flex gap-4">
    <div class="size-24 bg-background shrink-0 overflow-hidden relative">
      <ToolIcon96 animated={toolSettings.enabled} />
      <Icon
        icon="heroicons:sparkles-solid"
        class="size-8 center-abs text-muted dark:text-text-primary dark:drop-shadow-md dark:drop-shadow-primary shrink-0"
      />
    </div>

    <div class="text-left">
      <div class="font-bold text-text-primary text-xs">
        {$t('settings.tools.deepdive.title')}
      </div>
      <div class="text-xs mt-2 pb-3 text-text-secondary text-pretty">
        {$t('settings.tools.deepdive.description')}
      </div>
      <!-- Enable Tool Toggle -->
      <ToolEnableToggle
        id="deepdive-enabled"
        bind:checked={toolSettings.enabled}
        onCheckedChange={(value) => updateToolSettings({ enabled: value })}
        icon="heroicons:cpu-chip-20-solid"
        enabledText={$t('settings.tools.deepdive.enabled')}
        disabledText={$t('settings.tools.deepdive.disabled')}
      />
    </div>
  </div>

  {#if toolSettings.enabled}
    <!-- Custom Provider Configuration -->
    <div class="flex flex-col gap-4">
      <FeatureModelPicker
        bind:provider={toolSettings.customProvider}
        bind:model={toolSettings.customModel}
        onchange={(p, m) => updateToolSettings({ customProvider: p, customModel: m })}
      />

      <!-- ✅ INFO: API keys editable and update global settings -->
      <div class="text-xs text-muted flex gap-1 -mt-2">
        <Icon
          class=" shrink-0"
          icon="heroicons:information-circle"
          width="16"
          height="16"
        />
        <span>
          {$t('settings.tools.deepdive.api_keys_info_restructured', { default: 'API Keys are managed globally. Go to the' })}
          <a href="#/providers" class="text-primary hover:underline font-medium">
            {$t('settings.tools.deepdive.api_keys_link_text', { default: 'Providers & API Keys' })}
          </a>
          {$t('settings.tools.deepdive.api_keys_info_restructured_end', { default: 'tab to configure credentials.' })}
        </span>
      </div>
    </div>

    <!-- Auto Generate Mode -->
    <div>
      <label class=" text-text-primary"
        >{$t('settings.tools.deepdive.generation_mode_label')}</label
      >
      <p class="mt-2 text-muted">
        {$t('settings.tools.deepdive.generation_mode_description')}
      </p>
      <div class="grid mt-3 grid-cols-2 gap-2">
        <ButtonSet
          title={$t('settings.tools.deepdive.manual_mode')}
          class="setting-btn {!toolSettings.autoGenerate ? 'active' : ''}"
          onclick={() => toggleAutoGenerate(false)}
          Description={$t('settings.tools.deepdive.manual_mode_description')}
        >
          <Icon icon="heroicons:hand-raised" width="16" height="16" />
        </ButtonSet>
        <ButtonSet
          title={$t('settings.tools.deepdive.auto_mode')}
          class="setting-btn {toolSettings.autoGenerate ? 'active' : ''}"
          onclick={() => toggleAutoGenerate(true)}
          Description={$t('settings.tools.deepdive.auto_mode_description')}
        >
          <Icon icon="heroicons:bolt" width="16" height="16" />
        </ButtonSet>
      </div>
    </div>

    <!-- Deep Dive Reasoning Section -->
    <div>
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class=" text-text-primary"
        >{$t('settings.tools.deepdive.reasoning_title', { default: 'Reasoning' })}</label
      >
      <p class="mt-2 text-muted">
        {$t('settings.tools.deepdive.reasoning_description', { default: 'Control how much reasoning the model uses for Deep Dive questions.' })}
      </p>
      <div class="grid mt-3 grid-cols-3 gap-1">
        {#each TASK_REASONING_CHOICES as option (option.value)}
          <ButtonSet
            title={$t(`settings.tools.deepdive.reasoning_${option.value}`, { default: option.label })}
            Description={$t(`settings.tools.deepdive.reasoning_${option.value}_desc`, { default: option.description })}
            class="setting-btn {toolSettings.reasoningLevel === option.value ? 'active' : ''}"
            onclick={() => updateToolSettingsStore('deepDive', { reasoningLevel: option.value })}
          ></ButtonSet>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .setting-btn {
    transition: all 0.2s ease;
  }

  .setting-btn.active {
    background-color: var(--color-surface-2);
    border-color: var(--color-border);
  }
</style>
