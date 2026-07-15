<script>
  // @ts-nocheck
  import { DropdownMenu } from 'bits-ui'
  import Icon from '@iconify/svelte'

  let {
    value = 'provider-default',
    options = [],
    disabled = false,
    onchange = null,
  } = $props()

  let currentChoice = $derived(
    options.find((o) => o.value === value) || options[0]
  )
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger disabled={disabled || options.length <= 1}>
    {#snippet child({ props })}
      <button
        class="reasoning-trigger"
        class:reasoning-trigger-disabled={disabled || options.length <= 1}
        aria-label="Reasoning effort: {currentChoice?.label || 'Auto'}"
        {...props}
      >
        <Icon icon="heroicons:sparkles" width="14" height="14" />
        <span class="reasoning-trigger-label">{currentChoice?.label || 'Auto'}</span>
        {#if options.length > 1 && !disabled}
          <Icon icon="heroicons:chevron-up-down-16-solid" width="12" height="12" class="reasoning-trigger-caret" />
        {/if}
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="reasoning-menu"
      sideOffset={6}
      align="start"
      side="top"
    >
      {#each options as option (option.value)}
        <DropdownMenu.Item
          class="reasoning-option {option.value === value ? 'reasoning-option-active' : ''}"
          onSelect={() => onchange?.(option.value)}
        >
          <span class="reasoning-option-label">{option.label}</span>
          <span class="reasoning-option-desc">{option.description}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .reasoning-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 9999px;
    font-size: 0.75rem;
    line-height: 1;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 150ms ease;
    white-space: nowrap;
  }

  .reasoning-trigger:hover:not(.reasoning-trigger-disabled) {
    color: var(--text-primary);
    border-color: var(--text-tertiary);
    background: var(--surface-2);
  }

  .reasoning-trigger:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .reasoning-trigger-disabled {
    opacity: 0.5;
    cursor: default;
    pointer-events: none;
  }

  .reasoning-trigger-label {
    user-select: none;
  }

  :global(.reasoning-menu) {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 50;
    min-width: 180px;
    padding: 4px;
    animation: reasoning-menu-in 120ms ease-out;
  }

  :global(.dark .reasoning-menu) {
    background: var(--surface-2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  :global(.reasoning-option) {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 100ms ease;
  }

  :global(.reasoning-option:hover),
  :global(.reasoning-option[data-highlighted]) {
    background: var(--surface-2);
  }

  :global(.dark .reasoning-option:hover),
  :global(.dark .reasoning-option[data-highlighted]) {
    background: var(--surface-3);
  }

  :global(.reasoning-option-active) {
    background: var(--primary-subtle, var(--surface-2));
  }

  :global(.reasoning-option-label) {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  :global(.reasoning-option-desc) {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  :global(.reasoning-option-active .reasoning-option-label) {
    color: var(--primary);
  }

  @keyframes reasoning-menu-in {
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
