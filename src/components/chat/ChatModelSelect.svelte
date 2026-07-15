<script>
  // @ts-nocheck
  import { DropdownMenu } from 'bits-ui'
  import Icon from '@iconify/svelte'
  import { browser } from 'wxt/browser'
  import { chatState, setChatModel, getEffectiveChatModel } from '@/stores/chatStore.svelte.js'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import { resolveProviderEntry, isProviderConfigured } from '@/lib/providers/providerRegistry.js'
  import { formatModelDisplayName } from '@/lib/chat/modelDisplayName.js'
  import { _ } from 'svelte-i18n'

  let {
    disabled = false,
  } = $props()

  const isDisabled = $derived(disabled || chatState.isSending)

  // Effective chat model currently active (either conversation, override, or fallback default)
  const effectiveModel = $derived(getEffectiveChatModel())

  const effectiveEntry = $derived(
    effectiveModel.provider ? resolveProviderEntry(effectiveModel.provider, settings) : null
  )

  const isEffectiveUnconfigured = $derived(
    effectiveModel.provider && !isProviderConfigured(effectiveModel.provider, settings)
  )

  const isEffectiveWarning = $derived(!effectiveEntry || isEffectiveUnconfigured)

  // Trigger label and icon
  const triggerLabel = $derived(truncateModelName(formatModelDisplayName(effectiveModel.model)))
  const triggerIcon = $derived(
    isEffectiveWarning
      ? 'heroicons:exclamation-triangle-16-solid'
      : effectiveEntry?.iconifyIcon || 'heroicons:cpu-chip-20-solid'
  )

  // Formatter for model trigger
  function truncateModelName(name) {
    if (name.length > 15) {
      return name.substring(0, 12) + '...'
    }
    return name
  }

  // Model comparison helper
  function isSameModel(a, b) {
    return a && b && a.provider === b.provider && a.model === b.model
  }

  // Resolve metadata for any list item
  function resolveItemDetails(item) {
    const entry = resolveProviderEntry(item.provider, settings)
    const isUnconfigured = item.provider && !isProviderConfigured(item.provider, settings)
    const isWarning = !entry || isUnconfigured

    const label = formatModelDisplayName(item.model)
    const icon = isWarning
      ? 'heroicons:exclamation-triangle-16-solid'
      : entry?.iconifyIcon || 'heroicons:cpu-chip-20-solid'

    return { label, icon, isWarning }
  }

  // Menu items list derivation
  const menuItems = $derived.by(() => {
    const items = []

    // A. Default model (derived from settings.chat block)
    const defProv = settings.chat?.provider || 'gemini'
    const defMod = settings.chat?.model || ''
    const defEntry = resolveProviderEntry(defProv, settings)
    const defaultModelId = defMod || defEntry?.defaultModel || ''

    const defaultItem = {
      provider: defProv,
      model: defaultModelId
    }
    items.push(defaultItem)

    // B. Quick models
    const quickList = settings.chat?.quickModels || []
    for (const qm of quickList) {
      if (!isSameModel(qm, defaultItem)) {
        items.push({
          provider: qm.provider,
          model: qm.model
        })
      }
    }

    // C. Conversation's current pair if not in A or B
    const isCurrentInList = isSameModel(effectiveModel, defaultItem) || quickList.some(qm => isSameModel(effectiveModel, qm))
    if (!isCurrentInList && effectiveModel.provider && effectiveModel.model) {
      items.push({
        provider: effectiveModel.provider,
        model: effectiveModel.model
      })
    }

    return items
  })

  function handleSelect(item) {
    if (isDisabled) return
    setChatModel({ provider: item.provider, model: item.model })
  }

  function openSettings() {
    browser.tabs.create({ url: browser.runtime.getURL('settings.html') + '?tab=chat' })
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger disabled={isDisabled}>
    {#snippet child({ props })}
      <button
        class="model-trigger"
        class:model-trigger-disabled={isDisabled}
        class:model-trigger-warning={isEffectiveWarning}
        aria-label="{$_('chat.model_select.aria_label', { default: `Chat model: {model}`, values: { model: effectiveModel.model || 'Auto' } })}"
        {...props}
      >
        <Icon icon={triggerIcon} width="14" height="14" class="model-trigger-icon" />
        <span class="model-trigger-label">{triggerLabel}</span>
        {#if !isDisabled}
          <Icon icon="heroicons:chevron-up-down-16-solid" width="12" height="12" class="model-trigger-caret" />
        {/if}
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="model-menu"
      sideOffset={6}
      align="start"
      side="top"
    >
      {#each menuItems as item (item.provider + ':' + item.model)}
        {@const details = resolveItemDetails(item)}
        {@const isActive = isSameModel(effectiveModel, item)}
        <DropdownMenu.Item
          class="model-option {isActive ? 'model-option-active' : ''} {details.isWarning ? 'model-option-warning' : ''}"
          onSelect={() => handleSelect(item)}
        >
          <div class="model-option-content">
            <Icon icon={details.icon} width="14" height="14" class="model-option-icon" />
            <span class="model-option-label truncate">{details.label}</span>
            {#if isActive}
              <Icon icon="heroicons:check" width="14" height="14" class="model-check-icon" />
            {/if}
          </div>
        </DropdownMenu.Item>
      {/each}

      <DropdownMenu.Separator class="model-separator" />

      <DropdownMenu.Item
        class="model-option model-manage-option"
        onSelect={openSettings}
      >
        <div class="model-option-content">
          <Icon icon="heroicons:cog-6-tooth" width="14" height="14" class="model-option-icon" />
          <span class="model-option-label">{$_('chat.model_select.manage_models', { default: 'Manage models...' })}</span>
        </div>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .model-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 9999px;
    font-size: 0.75rem;
    line-height: 1;
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .model-trigger:hover:not(.model-trigger-disabled) {
    color: var(--color-text-primary);
    border-color: var(--color-muted);
    background: color-mix(in srgb, var(--color-surface-2) 92%, var(--color-blackwhite) 8%);
  }

  .model-trigger:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .model-trigger-disabled {
    opacity: 0.5;
    cursor: default;
    pointer-events: none;
  }

  .model-trigger-warning {
    border-color: var(--color-warning);
    color: var(--color-warning);
  }

  .model-trigger-icon {
    flex-shrink: 0;
  }

  .model-trigger-label {
    user-select: none;
  }

  .model-trigger-caret {
    opacity: 0.6;
  }

  :global(.model-menu) {
    background: var(--color-surface-1);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 50;
    min-width: 220px;
    max-width: 320px;
    padding: 4px;
    animation: model-menu-in 120ms ease-out;
  }

  :global(.dark .model-menu) {
    background: var(--color-surface-2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  :global(.model-option) {
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 100ms ease;
  }

  :global(.model-option:hover),
  :global(.model-option[data-highlighted]) {
    background: var(--color-surface-2);
  }

  :global(.dark .model-option:hover),
  :global(.dark .model-option[data-highlighted]) {
    background: var(--color-surface-2);
  }

  :global(.model-option-active) {
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-2));
  }

  .model-option-content {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 8px;
  }

  .model-option-icon {
    flex-shrink: 0;
    color: var(--color-muted);
  }

  :global(.model-option-active .model-option-icon) {
    color: var(--color-primary);
  }

  .model-option-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-primary);
    flex-grow: 1;
    text-align: left;
  }

  :global(.model-option-active .model-option-label) {
    color: var(--color-primary);
  }

  :global(.model-option-warning) {
    color: var(--color-warning);
  }

  :global(.model-option-warning .model-option-label) {
    color: var(--color-warning);
  }

  :global(.model-option-warning .model-option-icon) {
    color: var(--color-warning);
  }

  .model-check-icon {
    flex-shrink: 0;
    color: var(--color-primary);
  }

  :global(.model-separator) {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  @keyframes model-menu-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
