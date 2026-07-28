<script>
  // @ts-nocheck
  import GenericSummaryDisplayFP from '@/entrypoints/content/components/displays/GenericSummaryDisplayFP.svelte'

  let {
    summary = '',
    isLoading = false,
    summarization,
    loadingText = 'Processing YouTube summary...',
  } = $props()
</script>

<!-- Video Summary -->
{#if summary || isLoading}
  <GenericSummaryDisplayFP
    {summary}
    {isLoading}
    {loadingText}
    targetId="fp-youtube-summary-display"
    {summarization}
  />
{/if}
