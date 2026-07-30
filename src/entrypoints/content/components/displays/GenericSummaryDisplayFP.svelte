<script>
  // @ts-nocheck
  import SummaryWrapperFP from '@/entrypoints/content/components/displays/SummaryWrapperFP.svelte'
  import SummaryContent from '@/entrypoints/content/components/displays/SummaryContentFP.svelte'
  import FloatingPanelFooter from '@/entrypoints/content/components/displays/FloatingPanelFooter.svelte'

  let {
    summary,
    isLoading,
    loadingText = 'Generating summary...',
    targetId = 'fp-generic-summary',
    showTOC = true,
    noDataContent = null,
    summarization,
  } = $props()
</script>

<SummaryWrapperFP {isLoading} data={summary} {loadingText}>
  <SummaryContent {summary} {isLoading} {targetId} {showTOC} />
  {#if !isLoading && summary}
    <FloatingPanelFooter
      localSummaryState={summarization.localSummaryState()}
      onSave={summarization.manualSaveToArchive}
      summaryContent={summary}
      summaryTitle={summarization.localSummaryState().pageTitle || 'Summary'}
      {targetId}
    />
  {/if}
</SummaryWrapperFP>
