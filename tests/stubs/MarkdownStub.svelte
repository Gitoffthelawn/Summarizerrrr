<script>
  // Stands in for StreamingMarkdownV2 in component tests: same prop surface,
  // none of the highlighting machinery.
  let { sourceMarkdown = '' } = $props()
</script>

<div data-testid="markdown-stub">{sourceMarkdown}</div>
