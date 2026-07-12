<script>
  // @ts-nocheck
  import SvelteMarkdown from 'svelte-markdown'
  import TableRenderer from '@/components/displays/ui/TableRenderer.svelte'
  import ChatUserLink from './ChatUserLink.svelte'
  import ChatUserHtml from './ChatUserHtml.svelte'
  import ChatUserHeading from './ChatUserHeading.svelte'
  import ChatUserHr from './ChatUserHr.svelte'

  let { source = '' } = $props()

  let safeSource = $derived.by(() => {
    try {
      if (typeof source !== 'string') {
        return String(source || '')
      }
      return source
    } catch (e) {
      console.error('[ChatUserMarkdown] Error processing source:', e)
      return ''
    }
  })
</script>

<div class="prose prose-sm max-w-none text-text-primary wrap-anywhere">
  <SvelteMarkdown
    source={safeSource}
    renderers={{ table: TableRenderer, link: ChatUserLink, html: ChatUserHtml, heading: ChatUserHeading, hr: ChatUserHr }}
  />
</div>

<style>
  .prose :global(ul) {
    list-style-type: disc !important;
    padding-left: 1.25rem !important;
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }
  .prose :global(ol) {
    list-style-type: decimal !important;
    padding-left: 1.25rem !important;
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }
  .prose :global(li) {
    margin-top: 0.125rem;
    margin-bottom: 0.125rem;
  }
  .prose :global(blockquote) {
    border-left: 3px solid var(--color-border);
    padding-left: 0.75rem;
    color: var(--color-muted);
    margin: 0.5rem 0;
    font-style: normal;
  }
  .prose :global(code) {
    background-color: var(--color-blackwhite-5);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono);
  }
</style>
