<script>
  // @ts-nocheck
  import { Popover, Tooltip, mergeProps } from 'bits-ui'
  import { formatK } from '@/lib/utils/formatTokens.js'
  import { _ } from 'svelte-i18n'

  let {
    /** Real usage of the last sent turn (from the provider), or null before first send. */
    usage = null,
    /** Sum of estimated tokens for @tab chips not yet sent. */
    pendingEstimate = 0,
  } = $props()

  // Total tokens consumed in this turn: input (promptTokens) + output (completionTokens).
  // Both count against the model's context window simultaneously.
  const totalUsed = $derived((usage?.used || 0) + (usage?.output || 0))

  const percent = $derived(
    usage && usage.window > 0
      ? Math.min(100, Math.max(0, Math.round((totalUsed / usage.window) * 100)))
      : 0,
  )

  const level = $derived(
    percent >= 95 ? 'error' : percent >= 80 ? 'warning' : 'normal',
  )

  const fillColor = $derived(
    level === 'error'
      ? 'var(--color-error)'
      : level === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-primary)',
  )

  // Slanted energy-bar geometry: a parallelogram divided into 5 diagonal cells.
  // Slant leans left ("\"): bottom edge is shifted right of the top edge.
  const W = 100
  const H = 6
  const SLANT = 6
  const SEGMENTS = 5
  // Skew angle that makes a plain rect's edges parallel to the parallelogram sides.
  const SKEW_DEG = (Math.atan(SLANT / H) * 180) / Math.PI

  // Parallelogram outline: bottom-left → top-left → top-right → bottom-right.
  const shape = `M${SLANT},${H} L0,0 L${W - SLANT},0 L${W},${H} Z`

  // Fill width follows percent. Skewed rect (see SKEW_DEG) gives it a slanted
  // leading edge parallel to the notches; clip keeps it inside the shape.
  const fillWidth = $derived((percent / 100) * (W - SLANT))

  // 4 interior dividers (fractions 1/5..4/5), each parallel to the slanted edge.
  const dividers = $derived(
    Array.from({ length: SEGMENTS - 1 }, (_v, i) => {
      const f = (i + 1) / SEGMENTS
      const bx = SLANT + f * (W - SLANT)
      const tx = f * (W - SLANT)
      return { bx, tx }
    }),
  )

  const ariaLabel = $derived(
    usage
      ? `${$_('chat.context_donut.aria_usage', { default: 'Context window usage:' })} ${percent}%`
      : $_('chat.context_donut.aria_unknown', {
          default: 'Context usage not known yet',
        }),
  )
</script>

<Tooltip.Provider>
  <Popover.Root>
    <Tooltip.Root delayDuration={300} disableHoverableContent>
      <Tooltip.Trigger>
        {#snippet child({ props: tipProps })}
          <Popover.Trigger>
            {#snippet child({ props: popProps })}
              <button
                class="inline-flex items-center justify-center p-0.5 border-none bg-transparent cursor-pointer transition-opacity duration-150 ease-in-out hover:opacity-85 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                aria-label={ariaLabel}
                {...mergeProps(tipProps, popProps)}
              >
                <svg
                  width={W}
                  height={H}
                  viewBox="0 0 {W} {H}"
                  class="block overflow-visible"
                >
                  <defs>
                    <clipPath id="gauge-clip">
                      <path d={shape} />
                    </clipPath>
                  </defs>

                  <!-- Track -->
                  <path d={shape} fill="var(--color-surface-1)" />

                  <!-- Continuous fill: skewed rect (slanted leading edge), clipped -->
                  <g clip-path="url(#gauge-clip)">
                    <rect
                      x="0"
                      y="0"
                      width={fillWidth}
                      height={H}
                      fill={fillColor}
                      transform="skewX({SKEW_DEG})"
                      style="transition: width 300ms ease, fill 300ms ease;"
                    />
                  </g>

                  <!-- Segment dividers (visual markers only) -->
                  {#each dividers as d}
                    <line
                      x1={d.bx}
                      y1={H}
                      x2={d.tx}
                      y2="0"
                      stroke="var(--color-surface-2)"
                      stroke-width="1.5"
                    />
                  {/each}

                  <!-- Border: outline drawn last so it stays crisp -->
                  <path
                    d={shape}
                    fill="none"
                    stroke="var(--color-border)"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
              </button>
            {/snippet}
          </Popover.Trigger>
        {/snippet}
      </Tooltip.Trigger>

      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          class="z-50 text-[10px] px-2 py-0.5 bg-surface-2 border border-border rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-text-primary tabular-nums"
        >
          {percent}%
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>

    <Popover.Portal>
      <Popover.Content
        class="z-50 min-w-[200px] p-0 bg-surface-1 border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12)] animate-[donut-popover-in_120ms_ease-out] dark:bg-surface-2 dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        sideOffset={6}
        align="end"
        side="top"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div class="py-2 px-3 flex flex-col gap-1">
          <!-- Model -->
          <div
            class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
          >
            <span class="text-muted whitespace-nowrap"
              >{$_('chat.context_donut.model', { default: 'Model' })}</span
            >
            <span
              class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
            >
              {#if usage?.modelId}
                {usage.modelId}
              {:else}
                <span class="text-muted">—</span>
              {/if}
            </span>
          </div>

          {#if usage}
            <!-- Context window: used / window -->
            <div
              class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
            >
              <span class="text-muted whitespace-nowrap"
                >{$_('chat.context_donut.context_window', {
                  default: 'Context window',
                })}</span
              >
              <span
                class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                >{formatK(totalUsed)} / {formatK(usage.window)}</span
              >
            </div>

            <!-- Input -->
            {#if usage.input != null}
              <div
                class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
              >
                <span class="text-muted whitespace-nowrap"
                  >{$_('chat.context_donut.input', { default: 'Input' })}</span
                >
                <span
                  class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                  >{formatK(usage.input)}</span
                >
              </div>
            {/if}

            <!-- Output -->
            {#if usage.output != null}
              <div
                class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
              >
                <span class="text-muted whitespace-nowrap"
                  >{$_('chat.context_donut.output', {
                    default: 'Output',
                  })}</span
                >
                <span
                  class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                  >{formatK(usage.output)}</span
                >
              </div>
            {/if}

            <!-- Cache (only when reported) -->
            {#if usage.cached != null}
              <div
                class="flex items-center justify-between gap-3 text-[0.6875rem] leading-[1.4]"
              >
                <span class="text-muted whitespace-nowrap"
                  >{$_('chat.context_donut.cache', { default: 'Cache' })}</span
                >
                <span
                  class="text-text-primary text-right tabular-nums overflow-hidden text-ellipsis whitespace-nowrap max-w-40"
                  >{formatK(usage.cached)}</span
                >
              </div>
            {/if}
          {/if}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</Tooltip.Provider>

<style>
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
