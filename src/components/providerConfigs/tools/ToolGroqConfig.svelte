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
   * Handles saving the Groq API key to GLOBAL settings
   * @param {string} key The API key value from the input.
   */
  function saveGroqApiKey(key) {
    updateSettings({ groqApiKey: key })
  }

  /**
   * Handles model change - calls tool-specific callback and saves to global settings
   * @param {string} value The model value from the input.
   */
  function handleModelChange(value) {
    onModelChange(value)
    updateSettings({ selectedGroqModel: value })
  }
</script>

<ApiKeyInput
  bind:apiKey
  label={$t('settings.groq_config.api_key_label')}
  linkHref="https://console.groq.com/keys"
  linkText={$t('settings.groq_config.get_a_key')}
  onSave={saveGroqApiKey}
/>
<ProviderModelSelect
  providerId="groq"
  {apiKey}
  bind:selectedModel
  label={$t('settings.groq_config.model_label')}
  placeholder={$t('settings.groq_config.model_placeholder')}
  inputId="groq-tool-model"
  ariaLabel="Search Groq model"
  onModelChange={handleModelChange}
/>
