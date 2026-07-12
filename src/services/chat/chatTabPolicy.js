export function chatSessionHasActivity(session) {
  if (!session) return false
  return Boolean(
    session.conversation ||
      session.activeConversationId ||
      session.messages?.length ||
      session.composerText?.trim() ||
      session.selectedSkill ||
      session.pendingAttachments?.length ||
      session.isSending ||
      session.streamingMessage ||
      session.error ||
      session.contextWarnings?.length,
  )
}

export function toChatTabRuntimeDescriptor(id, session) {
  return {
    id,
    hasConversation: Boolean(
      session?.conversation ||
        session?.activeConversationId ||
        session?.messages?.length,
    ),
    isLoading: Boolean(session?.isSending || session?.streamingMessage),
    hasError: Boolean(session?.error),
    removable: chatSessionHasActivity(session),
  }
}

export function abortChatTabSession(session) {
  if (!session) return false
  session.abortController?.abort()
  return true
}

export function updateChatSessionUrl(session, nextUrl) {
  if (!session || !nextUrl) return false
  session.currentUrl = nextUrl
  return true
}

export function mergeChatTabsWithBrowserTabs({
  runtimeTabs,
  browserTabs,
  activeBrowserTabId,
}) {
  const browserById = new Map(browserTabs.map((tab) => [tab.id, tab]))
  const browserIndexById = new Map(
    browserTabs.map((tab, index) => [tab.id, index]),
  )
  const establishedTabs = runtimeTabs
    .filter((tab) => tab.hasConversation && browserById.has(tab.id))
    .sort(
      (left, right) =>
        browserIndexById.get(left.id) - browserIndexById.get(right.id),
    )
  const result = []
  for (const runtime of establishedTabs) {
    const browserTab = browserById.get(runtime.id)
    result.push({
      id: runtime.id,
      title: browserTab.title || 'Untitled',
      isLoading: runtime.isLoading,
      hasError: runtime.hasError,
      removable: runtime.removable,
    })
  }

  if (result.length === 0 && browserById.has(activeBrowserTabId)) {
    const activeBrowserTab = browserById.get(activeBrowserTabId)
    result.push({
      id: activeBrowserTabId,
      title: activeBrowserTab.title || 'Untitled',
      isLoading: false,
      hasError: false,
      removable: false,
    })
  }

  return result
}

export function getAdjacentChatTabId(tabs, activeTabId, offset) {
  if (tabs.length <= 1) return null
  const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
  const baseIndex = currentIndex < 0 ? 0 : currentIndex
  const nextIndex = (baseIndex + offset + tabs.length) % tabs.length
  return tabs[nextIndex]?.id ?? null
}
