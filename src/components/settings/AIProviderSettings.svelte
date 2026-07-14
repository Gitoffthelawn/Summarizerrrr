<svelte:options runes={true} />

<script>
  // @ts-nocheck
  import { t } from 'svelte-i18n'
  import Icon from '@iconify/svelte'
  import ButtonSet from '../buttons/ButtonSet.svelte'
  import TextScramble from '../../lib/ui/textScramble.js'
  import GeminiBasicConfig from '../providerConfigs/GeminiBasicConfig.svelte'
  import ProviderKeyConfig from './ProviderKeyConfig.svelte'
  import { PROVIDER_LIST } from '@/lib/providers/providerRegistry.js'
  import { Label, Switch } from 'bits-ui'
  import {
    settings,
    updateSettings,
  } from '../../stores/settingsStore.svelte.js'

  function handleUpdateSetting(key, value) {
    updateSettings({ [key]: value })
  }

  // Đồng bộ logic: khi toggle switch, cập nhật cả isAdvancedMode và isSummaryAdvancedMode
  function handleAdvancedModeToggle(value) {
    handleUpdateSetting('isAdvancedMode', value)
    handleUpdateSetting('isSummaryAdvancedMode', value)
  }

  let expandedProviderId = $state(null)

  function toggleProvider(id) {
    expandedProviderId = expandedProviderId === id ? null : id
  }

  let textElement
  let textScramble

  $effect(() => {
    if (!textScramble && textElement) {
        textScramble = new TextScramble(textElement)
    }
    if (textScramble) {
        textScramble.setText(
            settings.isAdvancedMode
                ? $t('settings.ai_model.mode.advanced')
                : $t('settings.ai_model.mode.basic'),
        )
    }
  })
</script>

<!-- AI Provider Section -->
<div class="setting-block flex gap-5 pb-6 pt-5 flex-col">
  <div class="flex items-center h-6 justify-between px-5">
    <label for="advanced-mode-toggle" class="block font-bold text-text-primary"
      >Model AI</label
    >
    <div class="flex items-center">
      <Label.Root
        class="cursor-pointer pr-2 py-2 w-20 text-right font-bold select-none transition-colors duration-1000 {settings.isAdvancedMode
          ? 'text-primary'
          : 'text-text-primary'}"
        for="provider-toggle"
      >
        <span bind:this={textElement}>
          {settings.isAdvancedMode
            ? $t('settings.ai_model.mode.advanced')
            : $t('settings.ai_model.mode.basic')}
        </span>
      </Label.Root>
      <Switch.Root
        id="provider-toggle"
        name="Advanced Mode"
        checked={settings.isAdvancedMode}
        onCheckedChange={handleAdvancedModeToggle}
        class="focus-visible:ring-primary border border-blackwhite/5 text-text-secondary flex justify-center items-center focus-visible:ring-offset-background bg-blackwhite/5 hover:bg-blackwhite/10 transition-colors rounded-full focus-visible:outline-hidden size-7.5 shrink-0 cursor-pointer focus-visible:ring-1 focus-visible:ring-offset-1 disabled:cursor-not-allowed data-[state=checked]:text-white disabled:opacity50"
      >
        <Switch.Thumb
          class="bg-primary rounded-full pointer-events-none block shrink-0 size-7.5 transition-all duration-300 data-[state=checked]:scale-100 data-[state=unchecked]:scale-60 data-[state=checked]:opacity-100 data-[state=unchecked]:opacity-0"
        />
        <Icon
          icon="heroicons:wrench-16-solid"
          width="20"
          height="20"
          class="origin-[75%_25%] animate-wiggle absolute z-10"
        />
      </Switch.Root>
    </div>
  </div>

  <div class="setting-secsion flex flex-col gap-6 px-5">
    {#if settings.isAdvancedMode}
      <!-- Advanced Mode Content -->
      <div class="flex flex-col gap-4">
        <label class="block font-bold text-text-primary"
          >{$t('settings.provider_key_config.api_keys_section_title', { default: 'API Keys & Endpoints' })}</label
        >

        <div class="flex flex-col">
          {#each PROVIDER_LIST as entry (entry.id)}
            <ProviderKeyConfig
              {entry}
              isExpanded={expandedProviderId === entry.id}
              onToggle={() => toggleProvider(entry.id)}
            />
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="block text-text-secondary"
          >{$t('settings.general.responseMode')}</label
        >
        <div class="grid grid-cols-2 w-full gap-1">
          <ButtonSet
            title={$t('settings.general.response_mode.streaming')}
            class="setting-btn {settings.enableStreaming ? 'active' : ''}"
            onclick={() => handleUpdateSetting('enableStreaming', true)}
            Description={$t('settings.general.response_mode.streaming_desc')}
          >
            <Icon icon="heroicons:bolt-20-solid" width="20" height="20" />
          </ButtonSet>
          <ButtonSet
            title={$t('settings.general.response_mode.non_streaming')}
            class="setting-btn {!settings.enableStreaming ? 'active' : ''}"
            onclick={() => handleUpdateSetting('enableStreaming', false)}
            Description={$t(
              'settings.general.response_mode.non_streaming_desc',
            )}
          >
            <Icon
              icon="heroicons:device-phone-mobile-20-solid"
              width="20"
              height="20"
            />
          </ButtonSet>
        </div>
      </div>


    {:else}
      <!-- Basic Mode Content -->
      <div class="setting-block flex gap-5 pb-2 flex-col">
        <GeminiBasicConfig
          bind:geminiApiKey={settings.geminiApiKey}
          bind:selectedGeminiModel={settings.selectedGeminiModel}
        />
      </div>
    {/if}

    <a
      href="https://www.youtube.com/watch?v=Is2mJuF2HPY"
      target="_blank"
      class="text-xs flex gap-1 items-center mt-auto self-center text-text-secondary hover:text-primary underline underline-offset-2 transition-colors"
    >
      {$t('apiKeyPrompt.setupGuide')}<Icon
        width={12}
        icon="heroicons:arrow-up-right-16-solid"
      />
    </a>
  </div>
</div>
