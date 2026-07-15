<script>
  // @ts-nocheck
  import { Popover, Tooltip as BitsTooltip } from 'bits-ui'
  import Tooltip from '@/components/ui/Tooltip.svelte'
  import { formatK } from '@/lib/utils/formatTokens.js'
  import { resolveProviderEntry } from '@/lib/providers/providerRegistry.js'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import { _ } from 'svelte-i18n'

  let {
    /** Real usage of the last sent turn (from the provider), or null before first send. */
    usage = null,
    /** Sum of estimated tokens for @tab chips not yet sent. */
    pendingEstimate = 0,
  } = $props()

  const SOURCE_LABELS = {
    'discovered': 'exact',
    'openrouter-catalog': 'catalog',
    'known-model': 'curated',
    'default-fallback': 'estimated',
  }

  // Fill against the input budget (window minus the reserved output), which is
  // what actually constrains the input. Fall back to `window` if unavailable.
  const capacity = $derived(usage?.inputBudget > 0 ? usage.inputBudget : usage?.window)

  const percent = $derived(
    usage && capacity > 0
      ? Math.min(100, Math.max(0, Math.round((usage.used / capacity) * 100)))
      : 0
  )

  const level = $derived(
    percent >= 95 ? 'error' : percent >= 80 ? 'warning' : 'normal'
  )

  const sourceLabel = $derived(SOURCE_LABELS[usage?.source] || usage?.source || '')

  // Resolve the provider entry for the model label in the popover.
  const providerEntry = $derived(
    usage?.providerId ? resolveProviderEntry(usage.providerId, settings) : null
  )

  const providerWarning = $derived(
    usage?.providerId && !providerEntry
  )

  // SVG donut geometry
  const SIZE = 18
  const STROKE = 2.5
  const RADIUS = (SIZE - STROKE) / 2
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  const strokeOffset = $derived(CIRCUMFERENCE * (1 - percent / 100))

  const strokeColor = $derived(
    level === 'error'
      ? 'var(--color-error)'
      : level === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-primary)'
  )

  const ariaLabel = $derived(
    usage
      ? `${$_('chat.context_donut.aria_usage', { default: 'Context window usage:' })} ${percent}%`
      : $_('chat.context_donut.aria_unknown', { default: 'Context usage not known yet' })
  )
</script>

<BitsTooltip.Provider>
<Popover.Root>
  <Tooltip content="{percent}%" side="top">
    {#snippet children({ builder })}
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            class="donut-trigger"
            aria-label={ariaLabel}
            {...builder}
            {...props}
          >
            <svg
              width={SIZE}
              height={SIZE}
              viewBox="0 0 {SIZE} {SIZE}"
              class="donut-svg"
            >
              <!-- Track -->
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--color-blackwhite-10)"
                stroke-width={STROKE}
              />
              <!-- Progress -->
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={strokeColor}
                stroke-width={STROKE}
                stroke-dasharray={CIRCUMFERENCE}
                stroke-dashoffset={strokeOffset}
                stroke-linecap="round"
                class="donut-progress"
              />
            </svg>
          </button>
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Tooltip>

  <Popover.Portal>
    <Popover.Content
      class="donut-popover"
      sideOffset={6}
      align="end"
      side="top"
    >
      <div class="donut-popover-inner">
        <!-- Model -->
        <div class="donut-row">
          <span class="donut-label">{$_('chat.context_donut.model', { default: 'Model' })}</span>
          <span class="donut-value">
            {#if providerWarning}
              <span class="donut-warning">{$_('chat.context_donut.unknown_provider', { default: 'Unknown provider' })}</span>
            {:else if usage?.modelId}
              {providerEntry?.label ? `${providerEntry.label} · ` : ''}{usage.modelId}
            {:else}
              <span class="donut-muted">—</span>
            {/if}
          </span>
        </div>

        {#if usage}
          <!-- Context window: used / window -->
          <div class="donut-row">
            <span class="donut-label">{$_('chat.context_donut.context_window', { default: 'Context window' })}</span>
            <span class="donut-value tabular-nums">{formatK(usage.used)} / {formatK(usage.window)}</span>
          </div>

          <!-- Input budget: used / capacity -->
          <div class="donut-row">
            <span class="donut-label">{$_('chat.context_donut.input_budget', { default: 'Input budget' })}</span>
            <span class="donut-value tabular-nums">{formatK(usage.used)} / {formatK(capacity)}</span>
          </div>

          <!-- Input -->
          {#if usage.input != null}
            <div class="donut-row">
              <span class="donut-label">{$_('chat.context_donut.input', { default: 'Input' })}</span>
              <span class="donut-value tabular-nums">{formatK(usage.input)}</span>
            </div>
          {/if}

          <!-- Output -->
          {#if usage.output != null}
            <div class="donut-row">
              <span class="donut-label">{$_('chat.context_donut.output', { default: 'Output' })}</span>
              <span class="donut-value tabular-nums">{formatK(usage.output)}</span>
            </div>
          {/if}

          <!-- Cache (only when reported) -->
          {#if usage.cached != null}
            <div class="donut-row">
              <span class="donut-label">{$_('chat.context_donut.cache', { default: 'Cache' })}</span>
              <span class="donut-value tabular-nums">{formatK(usage.cached)}</span>
            </div>
          {/if}

          <!-- Source badge -->
          {#if sourceLabel}
            <div class="donut-row donut-row-source">
              <span class="donut-label">{$_('chat.context_donut.source', { default: 'Source' })}</span>
              <span
                class="donut-source-badge"
                class:donut-source-estimated={usage.source === 'default-fallback'}
              >{sourceLabel}</span>
            </div>
          {/if}
        {/if}
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
</BitsTooltip.Provider>

<style>
  .donut-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-2);
    cursor: pointer;
    border-radius: 9999px;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .donut-trigger:hover {
    border-color: var(--color-muted);
    background: color-mix(in srgb, var(--color-surface-2) 92%, var(--color-blackwhite) 8%);
  }

  .donut-trigger:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .donut-svg {
    display: block;
    transform: rotate(-90deg);
  }

  .donut-progress {
    transition: stroke-dashoffset 300ms ease, stroke 300ms ease;
  }

  :global(.donut-popover) {
    background: var(--color-surface-1);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 50;
    min-width: 200px;
    padding: 0;
    animation: donut-popover-in 120ms ease-out;
  }

  :global(.dark .donut-popover) {
    background: var(--color-surface-2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .donut-popover-inner {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .donut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.6875rem;
    line-height: 1.4;
  }

  .donut-label {
    color: var(--color-muted);
    white-space: nowrap;
  }

  .donut-value {
    color: var(--color-text-primary);
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .donut-muted {
    color: var(--color-muted);
  }

  .donut-warning {
    color: var(--color-warning);
    font-style: italic;
  }

  .donut-source-badge {
    font-size: 0.625rem;
    padding: 1px 4px;
    border-radius: 2px;
    color: var(--color-muted);
  }

  .donut-source-estimated {
    background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  }

  .donut-row-source {
    margin-top: 2px;
    padding-top: 4px;
    border-top: 1px solid var(--color-border);
  }

  @keyframes donut-popover-in {
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
