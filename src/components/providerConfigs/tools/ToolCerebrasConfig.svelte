<script>
  // @ts-nocheck
  import ApiKeyInput from '../../inputs/ApiKeyInput.svelte'
  import ProviderModelSelect from '../ProviderModelSelect.svelte'
  import { updateSettings } from '../../../stores/settingsStore.svelte'
  import { t } from 'svelte-i18n'

  let {
    apiKey = $bindable(),
    selectedModel = $bindable(),
    onModelChange = () => {},
  } = $props()

  /**
   * Handles saving the Cerebras API key to GLOBAL settings
   * @param {string} key The API key value from the input.
   */
  function saveCerebrasApiKey(key) {
    updateSettings({ cerebrasApiKey: key })
  }

  /**
   * Handles model change - calls tool-specific callback and saves to global settings
   * @param {string} value The model value from the input.
   */
  function handleModelChange(value) {
    onModelChange(value)
    updateSettings({ selectedCerebrasModel: value })
  }
</script>

<ApiKeyInput
  bind:apiKey
  label={$t('settings.cerebras_config.api_key_label')}
  linkHref="https://cloud.cerebras.ai/"
  linkText={$t('settings.cerebras_config.get_a_key')}
  onSave={saveCerebrasApiKey}
/>
<ProviderModelSelect
  providerId="cerebras"
  {apiKey}
  bind:selectedModel
  label={$t('settings.cerebras_config.model_label')}
  placeholder={$t('settings.cerebras_config.model_placeholder')}
  inputId="cerebras-tool-model"
  ariaLabel="Search Cerebras model"
  onModelChange={handleModelChange}
/>
