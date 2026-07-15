<script>
  // @ts-nocheck
  import Icon from '@iconify/svelte'
  import ChatFavicon from './ChatFavicon.svelte'
  import { formatK } from '@/lib/utils/formatTokens.js'
  import {
    labelForSourceKind,
    iconForSourceKind,
    activeSourceLabelForUrl,
  } from '@/services/chat/sourceResolution.js'
  import { slideScaleFade } from '@/lib/ui/slideScaleFade.js'

  let {
    /** @type {string|null} */
    currentUrl = null,
    /** @type {string|null} */
    currentTitle = null,
    /** @type {string|null} */
    currentFavIconUrl = null,
    /** @type {string|null} */
    activeSourceKind = null,
    /** @type {boolean} */
    activeSourceDismissed = false,
    /** @type {Array} */
    pendingAttachments = [],
    /** @type {Record<string,number>|null} Per-source token map from Phase 3 diagnostics. */
    sourceTokens = null,
    /** @type {Function} */
    onDismissActiveSource = () => {},
    /** @type {Function} */
    onRestoreActiveSource = () => {},
    /** @type {Function} */
    onRemoveAttachment = () => {},
  } = $props()

  let expanded = $state(false)

  // Build a unified sources list from active page + pending attachments
  const sources = $derived.by(() => {
    const list = []

    // Active page (if present and not dismissed)
    if (activeSourceKind && !activeSourceDismissed) {
      list.push({
        key: 'active-page',
        title: currentTitle || activeSourceLabelForUrl(currentUrl || ''),
        favIconUrl: currentFavIconUrl,
        kind: activeSourceKind,
        tokens: sourceTokens?.['active-page'] ?? null,
        estimating: false,
        isActivePage: true,
        onRemove: onDismissActiveSource,
      })
    }

    // Pending attachments
    for (const att of pendingAttachments) {
      list.push({
        key: `${att.tabId}-${att.sourceKind || 'auto'}`,
        title: att.title || att.hostname || 'Attached tab',
        favIconUrl: att.favIconUrl ?? null,
        kind: att.sourceKind,
        tokens: att.estimatedTokens,
        estimating: att.estimating ?? false,
        isActivePage: false,
        onRemove: () => onRemoveAttachment(att.tabId, att.sourceKind),
      })
    }

    return list
  })

  const knownTokens = $derived(sources.reduce((sum, s) => sum + (s.tokens || 0), 0))
  const addedCount = $derived(sources.filter((s) => !s.isActivePage).length)

  // UI-1 → UI-2 flips only when tokens are actually known, or more than the
  // active page is in context. It never flips by *measuring* anything.
  const mode = $derived(knownTokens > 0 || addedCount > 0 ? 'summary' : 'title')

  // First 3 sources for the favicon stack
  const stackSources = $derived(sources.slice(0, 3))

  function toggleExpand() {
    expanded = !expanded
  }

  function handleExpandKeydown(event) {
    if (event.key === 'Escape') {
      expanded = false
      event.stopPropagation()
    }
  }

  function handleClickOutside(event) {
    // Close expanded panel on outside click
    expanded = false
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if sources.length > 0 || (currentUrl && activeSourceDismissed)}
  <div class="relative" onkeydown={handleExpandKeydown}>
    <!-- Expanded panel (above the bar) -->
    {#if expanded && mode === 'summary'}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="fixed inset-0 z-10"
        onclick={handleClickOutside}
        role="presentation"
      ></div>
      <div
        id="context-bar-panel"
        class="relative z-20 mb-px flex flex-col gap-0.5 rounded-t-lg border border-b-0 border-border bg-surface-2 px-2 py-1.5"
        transition:slideScaleFade={{ slideFrom: 'bottom', slideDistance: '0.5rem', startScale: 0.98, startOpacity: 0, duration: 200 }}
      >
        {#each sources as source (source.key)}
          <div class="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface-1">
            <ChatFavicon
              favIconUrl={source.favIconUrl}
              fallbackIcon={iconForSourceKind(source.kind)}
              size={14}
            />
            <span class="min-w-0 flex-1 truncate text-text-secondary" title={source.title}>
              {source.title}
            </span>
            {#if source.kind}
              <span class="shrink-0 text-[10px] text-text-tertiary">{labelForSourceKind(source.kind)}</span>
            {/if}
            <span class="shrink-0 tabular-nums text-text-tertiary">
              {#if source.estimating}
                <Icon icon="solar:loader-2-bold" width="12" height="12" class="animate-spin" />
              {:else if source.tokens != null}
                ~{formatK(source.tokens)}
              {:else}
                —
              {/if}
            </span>
            <button
              type="button"
              class="shrink-0 rounded-full p-0.5 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
              aria-label="Remove {source.title}"
              onclick={(e) => { e.stopPropagation(); source.onRemove() }}
            >
              <Icon icon="tabler:x" width="12" height="12" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Context bar -->
    {#if mode === 'title' && sources.length > 0}
      <!-- UI-1: Title mode — just favicon + title, not clickable -->
      <div
        class="-mb-1.5 flex items-center gap-1.5 rounded-t-lg border border-b-0 border-border bg-surface-2 px-3 py-1.5 text-xs text-text-secondary"
        data-testid="context-bar-title"
      >
        <ChatFavicon
          favIconUrl={currentFavIconUrl}
          fallbackIcon={iconForSourceKind(activeSourceKind)}
          size={14}
        />
        <span class="min-w-0 truncate">
          {currentTitle || activeSourceLabelForUrl(currentUrl || '')}
        </span>
      </div>
    {:else if mode === 'summary'}
      <!-- UI-2: Summary mode — favicon stack + count + tokens, clickable -->
      <button
        type="button"
        class="-mb-1.5 flex w-full items-center gap-1.5 rounded-t-lg border border-b-0 border-border bg-surface-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-1"
        aria-expanded={expanded}
        aria-controls="context-bar-panel"
        onclick={toggleExpand}
        data-testid="context-bar-summary"
      >
        <!-- Favicon stack -->
        <div class="flex shrink-0 items-center">
          {#each stackSources as source, i (source.key)}
            <div
              class="rounded-full ring-2 ring-surface-2"
              style:margin-left={i > 0 ? '-4px' : '0'}
              style:z-index={stackSources.length - i}
              style:position="relative"
            >
              <ChatFavicon
                favIconUrl={source.favIconUrl}
                fallbackIcon={iconForSourceKind(source.kind)}
                size={14}
              />
            </div>
          {/each}
        </div>

        {#if addedCount > 0}
          <span class="shrink-0 text-text-tertiary" data-testid="context-bar-tab-count">
            + {addedCount} tab{addedCount !== 1 ? 's' : ''}
          </span>
        {/if}

        <span class="flex-1"></span>

        {#if knownTokens > 0}
          <span class="shrink-0 tabular-nums text-text-tertiary" data-testid="context-bar-tokens">
            ~{formatK(knownTokens)} tokens
          </span>
        {/if}

        <Icon
          icon="heroicons:chevron-up"
          width="12"
          height="12"
          class="shrink-0 text-text-tertiary transition-transform {expanded ? '' : 'rotate-180'}"
        />
      </button>
    {/if}

    <!-- Restore button (when active source is dismissed) -->
    {#if currentUrl && activeSourceDismissed}
      <div class="-mb-1.5 flex items-center px-3 py-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-tertiary transition-colors hover:border-text-tertiary hover:text-text-secondary"
          onclick={onRestoreActiveSource}
          title="Add this page as context"
        >
          <Icon icon="heroicons:plus" width="14" height="14" />
          {activeSourceLabelForUrl(currentUrl || '')}
        </button>
      </div>
    {/if}
  </div>
{/if}
