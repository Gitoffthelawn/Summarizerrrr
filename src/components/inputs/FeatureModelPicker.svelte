<!-- @ts-nocheck -->
<script>
  import { settings } from '@/stores/settingsStore.svelte.js'
  import {
    PROVIDER_LIST,
    getProvider,
    getApiKey,
    getDefaultModel,
    isProviderConfigured
  } from '@/lib/providers/providerRegistry.js'
  import { FALLBACK_PROVIDER_MODELS } from '@/lib/api/providerModelService.js'
  import ProviderModelSelect from '../providerConfigs/ProviderModelSelect.svelte'
  import ReusableCombobox from './ReusableCombobox.svelte'
  import ReusableSelect from './ReusableSelect.svelte'
  import { t } from 'svelte-i18n'
  import Icon from '@iconify/svelte'

  let {
    provider = $bindable(),
    model = $bindable(),
    onchange = () => {},
    disabled = false
  } = $props()

  // Added providers that are also configured (have a key / endpoint set)
  const addedProviders = $derived(
    (settings.addedProviders || ['gemini']).map(id => getProvider(id)).filter(Boolean)
  )
  const configuredAddedProviders = $derived(
    addedProviders.filter(p => isProviderConfigured(p.id, settings))
  )

  // Auto-collapse: hide provider dropdown when ≤1 added provider is configured
  const showProviderDropdown = $derived(configuredAddedProviders.length >= 2)

  // The effective provider when collapsed (single or zero configured)
  const effectiveProvider = $derived(
    showProviderDropdown ? provider : (configuredAddedProviders[0]?.id ?? 'gemini')
  )

  // When collapsed, sync the bound provider/model if it drifts from
  // the sole configured provider (e.g. user removed a second provider key).
  $effect(() => {
    if (!showProviderDropdown && provider !== effectiveProvider) {
      provider = effectiveProvider
      model = getDefaultModel(effectiveProvider) || ''
      onchange(provider, model)
    }
  })

  // Build the list of providers to show in the dropdown — only added providers.
  const providerOptions = $derived.by(() => {
    const list = [...addedProviders]
    // If current provider is not in added list, include it so the user sees their selection
    if (provider && !list.some(p => p.id === provider)) {
      const current = getProvider(provider)
      if (current) {
        list.push(current)
      }
    }
    return list.map(p => {
      const isConfig = isProviderConfigured(p.id, settings)
      const labelSuffix = isConfig ? '' : ` (${$t('settings.feature_model_picker.unconfigured_suffix', { default: 'unconfigured' })})`
      return {
        value: p.id,
        label: `${p.label}${labelSuffix}`
      }
    })
  })

  // Handle provider selection change
  function handleProviderChange(newProviderId) {
    if (newProviderId === provider) return
    provider = newProviderId
    model = getDefaultModel(newProviderId) || ''
    onchange(provider, model)
  }

  // Get current provider registry entry (uses effectiveProvider for collapsed state)
  const currentProviderEntry = $derived(getProvider(effectiveProvider))

  // Warning check if the provider is unconfigured
  const isCurrentUnconfigured = $derived(
    effectiveProvider && !isProviderConfigured(effectiveProvider, settings)
  )

  // For static provider combobox options
  const staticItems = $derived.by(() => {
    if (!currentProviderEntry || currentProviderEntry.modelSource !== 'static') return []
    const fallbackList = FALLBACK_PROVIDER_MODELS[effectiveProvider] || []
    return fallbackList.map(m => ({ value: m, label: m }))
  })

  // Trigger onchange when model updates (if changed via sub-components)
  function handleModelChange(newModel) {
    if (!newModel) return
    onchange(provider, newModel)
  }
</script>

<div class="flex flex-col gap-3">
  <!-- Provider Select — only shown when ≥2 providers are configured -->
  {#if showProviderDropdown}
    <div class="flex flex-col gap-1.5">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="text-xs text-text-secondary">
        {$t('settings.feature_model_picker.provider_label', { default: 'Model Provider' })}
      </label>
      <div class="relative">
        <ReusableSelect
          items={providerOptions}
          bindValue={provider}
          {disabled}
          ariaLabel="Select Provider"
          onValueChangeCallback={handleProviderChange}
        />
      </div>

      {#if isCurrentUnconfigured}
        <div class="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500 mt-1">
          <Icon icon="heroicons:exclamation-triangle-16-solid" class="size-4 shrink-0" />
          <span>
            {$t('settings.feature_model_picker.unconfigured_warning', { default: 'This provider is not configured.' })}
            <a href="#/providers" class="text-primary hover:underline font-medium">
              {$t('settings.feature_model_picker.configure_link', { default: 'Configure API Key' })}
            </a>
          </span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Model Select / Input based on modelSource -->
  {#if currentProviderEntry}
    {#if currentProviderEntry.modelSource === 'discovery'}
      <ProviderModelSelect
        providerId={currentProviderEntry.discoveryId}
        apiKey={getApiKey(currentProviderEntry.id, settings)}
        bind:selectedModel={model}
        label={$t('settings.feature_model_picker.model_label', { default: 'Model Name' })}
        inputId="feature-model-select"
        placeholder={$t('settings.feature_model_picker.model_placeholder', { default: 'Search or select model' })}
        ariaLabel="Select Model"
        allowCustomValue={true}
        onModelChange={handleModelChange}
      />
    {:else}
      <div class="flex flex-col gap-1.5 relative z-40">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="text-xs text-text-secondary font-medium">
          {$t('settings.feature_model_picker.model_label', { default: 'Model Name' })}
        </label>

        {#if currentProviderEntry.modelSource === 'static'}
          <ReusableCombobox
            items={staticItems}
            bind:bindValue={model}
            placeholder={$t('settings.feature_model_picker.model_placeholder', { default: 'Search or select model' })}
            id="feature-model-input"
            ariaLabel="Search model"
            allowCustomValue={true}
            onValueChangeCallback={handleModelChange}
          />
        {:else if currentProviderEntry.modelSource === 'freeText'}
          <input
            type="text"
            id="feature-model-input"
            class="font-mono text-xs w-full px-3 py-2 bg-muted/5 dark:bg-muted/5 border border-border hover:border-blackwhite/15 focus:border-blackwhite/30 dark:border-blackwhite/10 dark:focus:border-blackwhite/20 focus:outline-none focus:ring-0 transition-colors duration-150"
            placeholder={currentProviderEntry.defaultModel || $t('settings.feature_model_picker.free_text_placeholder', { default: 'Enter model ID' })}
            bind:value={model}
            onchange={(e) => handleModelChange(e.currentTarget.value)}
          />
        {/if}
      </div>
    {/if}
  {/if}
</div>
