<script>
  let { children, ...props } = $props()

  let tableContainer = $state()
  let table = $state()
  let stickyScrollbar = $state()
  let tableScrollWidth = $state(0)
  let hasHorizontalOverflow = $state(false)

  function updateScrollMetrics() {
    if (!tableContainer || !table) return

    tableScrollWidth = table.scrollWidth
    hasHorizontalOverflow = tableScrollWidth > tableContainer.clientWidth + 1

    if (stickyScrollbar) {
      stickyScrollbar.scrollLeft = tableContainer.scrollLeft
    }
  }

  function syncFromTable() {
    if (
      stickyScrollbar &&
      stickyScrollbar.scrollLeft !== tableContainer.scrollLeft
    ) {
      stickyScrollbar.scrollLeft = tableContainer.scrollLeft
    }
  }

  function syncFromStickyScrollbar() {
    if (
      tableContainer &&
      tableContainer.scrollLeft !== stickyScrollbar.scrollLeft
    ) {
      tableContainer.scrollLeft = stickyScrollbar.scrollLeft
    }
  }

  $effect(() => {
    if (!tableContainer || !table) return

    const resizeObserver = new ResizeObserver(updateScrollMetrics)
    resizeObserver.observe(tableContainer)
    resizeObserver.observe(table)
    updateScrollMetrics()

    return () => resizeObserver.disconnect()
  })
</script>

<div class="table-shell">
  <div
    class="table-container"
    bind:this={tableContainer}
    onscroll={syncFromTable}
  >
    <table bind:this={table} {...props}>
      {@render children?.()}
    </table>
  </div>

  {#if hasHorizontalOverflow}
    <div
      class="sticky-scrollbar"
      bind:this={stickyScrollbar}
      onscroll={syncFromStickyScrollbar}
    >
      <div
        class="sticky-scrollbar-content"
        style:width={tableScrollWidth + 'px'}
      ></div>
    </div>
  {/if}
</div>

<style>
  .table-shell {
    position: relative;
    width: 100%;
    max-width: 100%;
    margin-bottom: 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5em;
  }

  .table-container {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    -webkit-overflow-scrolling: touch;
    padding-top: 0.125em;
    scrollbar-width: none;
  }

  .table-container::-webkit-scrollbar {
    display: none;
  }

  .sticky-scrollbar {
    position: sticky;
    bottom: 0;
    z-index: 1;
    width: 100%;
    height: 10px;
    overflow-x: scroll;
    overflow-y: hidden;
    background: var(--color-surface-2);
    scrollbar-width: thin;
    scrollbar-color: var(--color-text-secondary) var(--color-surface-2);
    scrollbar-gutter: stable;
  }

  /* Keep the horizontal scrollbar visible instead of toggling it on hover. */
  .sticky-scrollbar::-webkit-scrollbar {
    height: 8px;
    background: var(--color-surface-2);
  }

  .sticky-scrollbar::-webkit-scrollbar-track {
    background: var(--color-surface-2);
    border-radius: 999px;
  }

  .sticky-scrollbar::-webkit-scrollbar-thumb {
    background: var(--color-text-secondary);
    border: 2px solid var(--color-surface-2);
    border-radius: 999px;
  }

  .sticky-scrollbar-content {
    height: 1px;
  }

  table {
    border-collapse: collapse;
    /*
     * Let the browser preserve the intrinsic width of the columns. A fixed
     * 100% width squeezes every column into narrow side panels, which makes
     * nowrap headers overlap and body text break in the middle of words.
     */
    width: auto;
    min-width: 100%;
    table-layout: auto;
    margin: 0;
    /* Remove border from table itself as container has it */
    border: none;
  }
</style>
