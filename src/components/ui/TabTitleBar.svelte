<script>
  // @ts-nocheck
  import { onMount } from 'svelte'
  import { tabTitle } from '@/stores/tabTitleStore.svelte.js'
  import {
    summaryState,
    globalStoreUpdate,
    isAnyLoading,
    stopStreaming,
    resetState,
  } from '@/stores/summaryStore.svelte.js'
  import {
    getTabsWithSummaryInfo,
    navigateToTab,
    getCurrentTabId,
    clearTabState,
  } from '@/services/tabCacheService.js'
  import SidepanelTabBar from './SidepanelTabBar.svelte'

  let cachedTabs = $state([])
  let currentTabId = $state(null)

  $effect(() => {
    const _trigger = [
      summaryState.summary,
      summaryState.courseSummary,
      summaryState.selectedTextSummary,
      summaryState.customActionResult,
      summaryState.lastSummaryTypeDisplayed,
      isAnyLoading(),
      summaryState.summaryError,
      summaryState.customActionError,
      summaryState.courseSummaryError,
      globalStoreUpdate.version,
    ]
    loadTabsInfo()
  })

  onMount(() => {
    initializeCurrentTab()

    const handleTabRemoved = (tabId) => {
      cachedTabs = cachedTabs.filter((tab) => tab.id !== tabId)
    }
    const handleTabActivated = async ({ tabId }) => {
      currentTabId = tabId
      await loadTabsInfo(false)
    }

    browser.tabs.onRemoved.addListener(handleTabRemoved)
    browser.tabs.onActivated.addListener(handleTabActivated)
    return () => {
      browser.tabs.onRemoved.removeListener(handleTabRemoved)
      browser.tabs.onActivated.removeListener(handleTabActivated)
    }
  })

  async function initializeCurrentTab() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) currentTabId = tab.id
    } catch (error) {
      console.error('[TabTitleBar] Failed to get current tab:', error)
    }
    await loadTabsInfo(false)
  }

  async function loadTabsInfo(updateCurrentTab = true) {
    cachedTabs = (await getTabsWithSummaryInfo()).map((tab) => ({
      ...tab,
      removable: true,
    }))
    if (updateCurrentTab) currentTabId = getCurrentTabId() || currentTabId
  }

  async function selectTab(tabId) {
    currentTabId = tabId
    await navigateToTab(tabId)
    await loadTabsInfo(false)
  }

  async function removeTab(tabId) {
    if (tabId === currentTabId) {
      if (isAnyLoading()) stopStreaming()
      resetState()
    }
    clearTabState(tabId)
    await loadTabsInfo(false)
  }

  async function navigateByOffset(offset) {
    if (cachedTabs.length <= 1) return
    const currentIndex = cachedTabs.findIndex((tab) => tab.id === currentTabId)
    const baseIndex = currentIndex < 0 ? 0 : currentIndex
    const nextIndex =
      (baseIndex + offset + cachedTabs.length) % cachedTabs.length
    await selectTab(cachedTabs[nextIndex].id)
  }

  let displayTabs = $derived(
    cachedTabs.length > 0
      ? cachedTabs
      : currentTabId
        ? [
            {
              id: currentTabId,
              title: $tabTitle,
              isLoading: false,
              hasError: false,
              removable: false,
            },
          ]
        : [],
  )
</script>

<SidepanelTabBar
  tabs={displayTabs}
  activeTabId={currentTabId}
  onSelectTab={selectTab}
  onRemoveTab={removeTab}
  onPrevious={() => navigateByOffset(-1)}
  onNext={() => navigateByOffset(1)}
/>
