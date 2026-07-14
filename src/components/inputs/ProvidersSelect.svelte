<script>
  import ReusableSelect from '../inputs/ReusableSelect.svelte'
  import {
    settings,
    updateSettings,
  } from '../../stores/settingsStore.svelte.js' // Import updateSettings

  import { PROVIDER_LIST } from '../../lib/providers/providerRegistry.js'

  const providers = PROVIDER_LIST.map((p) => ({ value: p.id, label: p.label }))

  let { value = $bindable() } = $props()

  function handleChange(newValue) {
    value = newValue
    settings.selectedProvider = newValue
    updateSettings({ selectedProvider: newValue }) // Lưu cài đặt vào storage

    const event = new CustomEvent('change', { detail: newValue })
    dispatchEvent(event)
  }
</script>

<ReusableSelect
  items={providers}
  bindValue={settings.selectedProvider}
  defaultLabel="Google Gemini"
  ariaLabel="Select a provider"
  className="provider"
  onValueChangeCallback={handleChange}
/>
