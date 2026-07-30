<script>
  // Renders nothing and accepts anything. For component tests that need a child
  // out of the way (a composer pulling in the editor, a markdown pipeline).
  let { ...rest } = $props()
</script>

<div data-testid="empty-stub"></div>
