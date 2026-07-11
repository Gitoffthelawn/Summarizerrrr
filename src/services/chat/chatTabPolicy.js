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

export function mergeChatTabsWithBrowserTabs({
  runtimeTabs,
  browserTabs,
  activeBrowserTabId,
}) {
  const runtimeById = new Map(runtimeTabs.map((tab) => [tab.id, tab]))
  const result = []

  for (const browserTab of browserTabs) {
    const runtime = runtimeById.get(browserTab.id)
    if (!runtime && browserTab.id !== activeBrowserTabId) continue
    result.push({
      id: browserTab.id,
      title: browserTab.title || 'Untitled',
      isLoading: runtime?.isLoading ?? false,
      hasError: runtime?.hasError ?? false,
      removable: runtime?.removable ?? false,
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

export function shouldResetChatOnNavigation({
  enabled,
  autoResetOnNavigation,
  previousUrl,
  nextUrl,
}) {
  return Boolean(
    enabled &&
      autoResetOnNavigation &&
      previousUrl &&
      nextUrl &&
      previousUrl !== nextUrl,
  )
}
