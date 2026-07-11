<script>
  // @ts-nocheck
  import { onMount } from 'svelte'
  import { tabTitle } from '@/stores/tabTitleStore.svelte.js'
  import { settings } from '@/stores/settingsStore.svelte.js'
  import {
    chatState,
    chatTabsState,
    getChatTabRuntimeDescriptors,
    handleChatBrowserTabRemoved,
    handleChatTabNavigation,
    removeChatTabSession,
    setChatTabFeatureEnabled,
    syncChatForActiveTab,
  } from '@/stores/chatStore.svelte.js'
  import {
    getAdjacentChatTabId,
    mergeChatTabsWithBrowserTabs,
  } from '@/services/chat/chatTabPolicy.js'
  import SidepanelTabBar from '@/components/ui/SidepanelTabBar.svelte'

  let tabs = $state([])
  let loadSequence = 0
  let lastBrowserTabs = []

  let enabled = $derived(settings.tools?.perTabCache?.enabled ?? true)
  let autoScrollBehavior = $derived(
    settings.tools?.perTabCache?.autoScrollBehavior ?? 'smooth',
  )
  let activeTabId = $derived(chatTabsState.activeBrowserTabId)

  $effect(() => {
    const _trigger = [
      chatTabsState.version,
      chatState.activeConversationId,
      chatState.messages.length,
      chatState.composerText,
      chatState.selectedSkill,
      chatState.pendingAttachments.length,
      chatState.isSending,
      chatState.streamingMessage,
      chatState.error,
      enabled,
    ]
    recomputeTabs()
  })

  $effect(() => {
    const featureEnabled = enabled
    const browserTabId = chatTabsState.activeBrowserTabId
    setChatTabFeatureEnabled(featureEnabled, browserTabId).catch((error) =>
      console.error('[ChatTabTitleBar] Failed to change tab mode:', error),
    )
  })

  onMount(() => {
    initialize()

    const handleActivated = async ({ tabId }) => {
      try {
        const tab = await browser.tabs.get(tabId)
        await syncChatForActiveTab(tabId, { url: tab?.url || null })
      } catch (error) {
        console.error('[ChatTabTitleBar] Failed to activate chat tab:', error)
      }
      await refreshTabsInfo()
    }

    const handleUpdated = (tabId, changeInfo) => {
      if (changeInfo.url) handleChatTabNavigation(tabId, changeInfo.url)
      if (changeInfo.url || changeInfo.title) refreshTabsInfo()
    }

    const handleRemoved = (tabId) => {
      handleChatBrowserTabRemoved(tabId)
      tabs = tabs.filter((tab) => tab.id !== tabId)
      refreshTabsInfo()
    }

    browser.tabs.onActivated.addListener(handleActivated)
    browser.tabs.onUpdated.addListener(handleUpdated)
    browser.tabs.onRemoved.addListener(handleRemoved)
    return () => {
      browser.tabs.onActivated.removeListener(handleActivated)
      browser.tabs.onUpdated.removeListener(handleUpdated)
      browser.tabs.onRemoved.removeListener(handleRemoved)
    }
  })

  async function initialize() {
    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (activeTab?.id) {
        await syncChatForActiveTab(activeTab.id, { url: activeTab.url || null })
      }
    } catch (error) {
      console.error('[ChatTabTitleBar] Failed to initialize:', error)
    }
    await refreshTabsInfo()
  }

  // Re-fetches the browser tab list. Only call this from real browser-tab
  // events (activated/updated/removed, initial mount) — it's a cross-process
  // call and must not run on every composer keystroke.
  async function refreshTabsInfo() {
    const sequence = ++loadSequence
    try {
      const browserTabs = await browser.tabs.query({ currentWindow: true })
      if (sequence !== loadSequence) return
      lastBrowserTabs = browserTabs
      recomputeTabs()
    } catch (error) {
      console.error('[ChatTabTitleBar] Failed to load tabs:', error)
    }
  }

  // Re-derives the tab bar from the last-fetched browser tab list. Safe to
  // call on every chat-session change (draft text, streaming state, etc.)
  // since it does no browser API calls.
  function recomputeTabs() {
    tabs = mergeChatTabsWithBrowserTabs({
      runtimeTabs: getChatTabRuntimeDescriptors(),
      browserTabs: lastBrowserTabs,
      activeBrowserTabId: chatTabsState.activeBrowserTabId,
    })
  }

  async function selectTab(tabId) {
    if (!tabId || tabId === activeTabId) return
    try {
      await browser.tabs.update(tabId, { active: true })
    } catch (error) {
      console.error('[ChatTabTitleBar] Failed to navigate to tab:', error)
    }
  }

  function removeTab(tabId) {
    removeChatTabSession(tabId)
    refreshTabsInfo()
  }

  function navigateByOffset(offset) {
    const targetId = getAdjacentChatTabId(tabs, activeTabId, offset)
    if (targetId != null) selectTab(targetId)
  }
</script>

<SidepanelTabBar
  {tabs}
  {activeTabId}
  currentTitle={$tabTitle}
  {enabled}
  {autoScrollBehavior}
  onSelectTab={selectTab}
  onRemoveTab={removeTab}
  onPrevious={() => navigateByOffset(-1)}
  onNext={() => navigateByOffset(1)}
/>
