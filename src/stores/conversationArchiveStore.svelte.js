import { conversationRepository } from '@/lib/db/conversationRepository.js'
import { getSourceById } from '@/lib/db/conversationRepository.js'
import {
  exportConversationAsJson,
  exportConversationAsMarkdown,
  conversationExportFilename,
} from '@/lib/exportImport/conversationExportService.js'
import { downloadBlob } from '@/lib/exportImport/exportService.js'

let conversationList = $state([])
let selectedConversation = $state(null)
let selectedConversationId = $state(null)
let selectedMessages = $state([])
let selectedSources = $state([])

function sourceDomain(source) {
  try {
    return new URL(source?.url || '').hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function withDisplayMetadata(conversation, messages, sources) {
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const lastMessage = messages[messages.length - 1]
  const firstSource = messages
    .flatMap((message) => message.attachmentRefs || [])
    .map((id) => sourceById.get(id))
    .find(Boolean)
  return {
    ...conversation,
    lastMessagePreview: String(lastMessage?.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    sourceDomain: sourceDomain(firstSource),
  }
}

async function loadConversationDetails(conversation) {
  const messages = await conversationRepository.listMessagesByConversation(conversation.id)
  const sourceIds = [...new Set(messages.flatMap((message) => message.attachmentRefs || []))]
  const sources = (await Promise.all(sourceIds.map((id) => getSourceById(id)))).filter(Boolean)
  return { messages, sources, conversation: withDisplayMetadata(conversation, messages, sources) }
}

export async function loadConversationArchive() {
  const conversations = await conversationRepository.listConversations({ includeArchived: true })
  const details = await Promise.all(conversations.map(loadConversationDetails))
  conversationList = details.map((detail) => detail.conversation)

  if (selectedConversationId) {
    const selected = details.find((detail) => detail.conversation.id === selectedConversationId)
    if (selected) applySelection(selected)
    else clearConversationSelection()
  } else if (details[0]) {
    applySelection(details[0])
  }
  return conversationList
}

function applySelection(detail) {
  selectedConversation = detail.conversation
  selectedConversationId = detail.conversation.id
  selectedMessages = detail.messages
  selectedSources = detail.sources
}

export async function selectConversation(conversation) {
  applySelection(await loadConversationDetails(conversation))
  return selectedConversation
}

export function clearConversationSelection() {
  selectedConversation = null
  selectedConversationId = null
  selectedMessages = []
  selectedSources = []
}

export async function renameArchivedConversation(id, title) {
  const conversation = await conversationRepository.updateConversationMetadata(id, { title: String(title || '').trim() || 'New conversation' })
  await loadConversationArchive()
  return conversation
}

export async function setArchivedConversationState(id, archived) {
  const conversation = await conversationRepository.archiveConversation(id, archived)
  await loadConversationArchive()
  return conversation
}

export async function deleteArchivedConversation(id) {
  const conversation = await conversationRepository.softDeleteConversation(id)
  await loadConversationArchive()
  return conversation
}

export async function exportArchivedConversation(id, format) {
  const conversation = await conversationRepository.getConversation(id)
  const blob = format === 'markdown'
    ? await exportConversationAsMarkdown(id)
    : await exportConversationAsJson(id)
  const extension = format === 'markdown' ? 'md' : 'json'
  await downloadBlob(blob, conversationExportFilename(conversation?.title, extension), blob.type, `.${extension}`)
}

export async function resumeArchivedConversation(id) {
  await browser.runtime.sendMessage({ type: 'RESUME_CONVERSATION', conversationId: id })
}

export const conversationArchiveStore = {
  get conversationList() { return conversationList },
  get selectedConversation() { return selectedConversation },
  get selectedConversationId() { return selectedConversationId },
  get selectedMessages() { return selectedMessages },
  get selectedSources() { return selectedSources },
  loadConversationArchive,
  selectConversation,
  clearConversationSelection,
}
