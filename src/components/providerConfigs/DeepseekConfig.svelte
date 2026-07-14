<script>
  // @ts-nocheck
  import { settings, updateSettings } from '../../stores/settingsStore.svelte'
  import ApiKeyInput from '../inputs/ApiKeyInput.svelte'
  import ProviderModelSelect from './ProviderModelSelect.svelte'
  import { t } from 'svelte-i18n'

  let { selectedDeepseekModel = $bindable() } = $props()

  /**
   * Handles saving the Deepseek API key.
   * @param {string} key The API key value from the input.
   */
  function handleApiKeySave(key) {
    updateSettings({ deepseekApiKey: key })
  }

  function handleModelChange(value) {
    updateSettings({ selectedDeepseekModel: value })
  }
</script>

<ApiKeyInput
  label={$t('settings.deepseek_config.api_key_label')}
  id="deepseekApiKey"
  apiKey={settings.deepseekApiKey}
  onSave={handleApiKeySave}
  placeholder={$t('settings.deepseek_config.api_key_placeholder')}
  linkHref="https://platform.deepseek.com/api_keys"
  linkText={$t('settings.groq_config.get_a_key')}
/>
<div class="flex flex-col gap-2 relative z-50">
  <div class="flex flex-col gap-2">
    <ProviderModelSelect
      providerId="deepseek"
      apiKey={settings.deepseekApiKey}
      bind:selectedModel={selectedDeepseekModel}
      label={$t('settings.deepseek_config.model_name_label')}
      placeholder={$t('settings.deepseek_config.model_placeholder')}
      inputId="deepseek-model-input"
      ariaLabel="Search Deepseek model"
      modelInfoHref="https://api-docs.deepseek.com/quick_start/pricing"
      modelInfoText={$t('settings.deepseek_config.view_models')}
      onModelChange={handleModelChange}
    />
  </div>
</div>
