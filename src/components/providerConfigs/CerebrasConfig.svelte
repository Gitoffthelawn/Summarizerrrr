<script>
  // @ts-nocheck
  import ApiKeyInput from '../inputs/ApiKeyInput.svelte'
  import ProviderModelSelect from './ProviderModelSelect.svelte'
  import {
    settings,
    updateSettings,
  } from '../../stores/settingsStore.svelte.js'
  import { t } from 'svelte-i18n'

  function saveCerebrasApiKey(key) {
    updateSettings({ cerebrasApiKey: key })
  }

  function handleModelChange(value) {
    updateSettings({ selectedCerebrasModel: value })
  }
</script>

<ApiKeyInput
  apiKey={settings.cerebrasApiKey}
  label={$t('settings.cerebras_config.api_key_label')}
  linkHref="https://cloud.cerebras.ai/"
  linkText={$t('settings.cerebras_config.get_a_key')}
  onSave={saveCerebrasApiKey}
/>
<ProviderModelSelect
  providerId="cerebras"
  apiKey={settings.cerebrasApiKey}
  bind:selectedModel={settings.selectedCerebrasModel}
  label={$t('settings.cerebras_config.model_label')}
  placeholder={$t('settings.cerebras_config.model_placeholder')}
  inputId="cerebras-model-input"
  ariaLabel="Search Cerebras model"
  onModelChange={handleModelChange}
/>
