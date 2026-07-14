<script>
  // @ts-nocheck
  import { updateSettings } from '../../../stores/settingsStore.svelte'
  import ApiKeyInput from '../../inputs/ApiKeyInput.svelte'
  import ProviderModelSelect from '../ProviderModelSelect.svelte'
  import { t } from 'svelte-i18n'

  let {
    apiKey = $bindable(),
    selectedModel = $bindable(''),
    onModelChange = () => {},
  } = $props()

  /**
   * Handles saving the Deepseek API key to GLOBAL settings
   * @param {string} key The API key value from the input.
   */
  function handleApiKeySave(key) {
    updateSettings({ deepseekApiKey: key })
  }

  function handleModelChange(value) {
    onModelChange(value)
  }
</script>

<ApiKeyInput
  label={$t('settings.deepseek_config.api_key_label')}
  id="deepseekApiKey"
  bind:apiKey
  onSave={handleApiKeySave}
  placeholder={$t('settings.deepseek_config.api_key_placeholder')}
  linkHref="https://platform.deepseek.com/api_keys"
  linkText={$t('settings.groq_config.get_a_key')}
/>
<div class="flex flex-col gap-2 relative z-50">
  <div class="flex flex-col gap-2">
    <ProviderModelSelect
      providerId="deepseek"
      {apiKey}
      bind:selectedModel
      label={$t('settings.deepseek_config.model_name_label')}
      placeholder={$t('settings.deepseek_config.model_placeholder')}
      inputId="deepseek-tool-model"
      ariaLabel="Search Deepseek model"
      modelInfoHref="https://api-docs.deepseek.com/quick_start/pricing"
      modelInfoText={$t('settings.deepseek_config.view_models')}
      onModelChange={handleModelChange}
    />
  </div>
</div>
