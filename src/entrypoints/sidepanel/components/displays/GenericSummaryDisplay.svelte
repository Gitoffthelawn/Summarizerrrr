<script>
  // @ts-nocheck
  import SummaryWrapper from '@/entrypoints/sidepanel/components/displays/SummaryWrapper.svelte'
  import SummaryContent from '@/entrypoints/sidepanel/components/displays/SummaryContent.svelte'

  let {
    summary,
    isLoading,
    loadingText,
    targetId,
    showTOC = false,
    noDataContent = null,
  } = $props()
</script>

<SummaryWrapper {isLoading} data={summary} {loadingText}>
  <SummaryContent {summary} {isLoading} {targetId} {showTOC} />
  <svelte:fragment slot="no-data">
    {#if noDataContent}
      {@render noDataContent()}
    {/if}
  </svelte:fragment>
</SummaryWrapper>
