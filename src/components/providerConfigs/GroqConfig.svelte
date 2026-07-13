<script>
  // @ts-nocheck
  import ApiKeyInput from '../inputs/ApiKeyInput.svelte'
  import ProviderModelSelect from './ProviderModelSelect.svelte'
  import { settings, updateSettings } from '../../stores/settingsStore.svelte'
  import { t } from 'svelte-i18n'

  function saveGroqApiKey(key) {
    updateSettings({ groqApiKey: key })
  }

  function handleModelChange(value) {
    updateSettings({ selectedGroqModel: value })
  }
</script>

<ApiKeyInput
  apiKey={settings.groqApiKey}
  label={$t('settings.groq_config.api_key_label')}
  linkHref="https://console.groq.com/keys"
  linkText={$t('settings.groq_config.get_a_key')}
  onSave={saveGroqApiKey}
/>
<ProviderModelSelect
  providerId="groq"
  apiKey={settings.groqApiKey}
  bind:selectedModel={settings.selectedGroqModel}
  label={$t('settings.groq_config.model_label')}
  placeholder={$t('settings.groq_config.model_placeholder')}
  inputId="groq-model-input"
  ariaLabel="Search Groq model"
  onModelChange={handleModelChange}
/>
