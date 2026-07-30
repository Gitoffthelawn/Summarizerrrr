<script>
  // @ts-nocheck
  import ChatFavicon from '@/entrypoints/sidepanel/components/chat/ChatFavicon.svelte'

  let {
    favIconUrl = null,
    fallbackIcon = 'heroicons:document-text',
    size = 14,
  } = $props()
</script>

<ChatFavicon {favIconUrl} {fallbackIcon} {size} />
