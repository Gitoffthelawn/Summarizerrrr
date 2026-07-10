import { generateUUID } from '../utils/utils.js'
import {
  CONVERSATIONS_STORE_NAME,
  CONVERSATION_MESSAGES_STORE_NAME,
  CONVERSATION_SOURCES_STORE_NAME,
  getDatabase,
} from './indexedDBService.js'

const CHAT_STORES = [
  CONVERSATIONS_STORE_NAME,
  CONVERSATION_MESSAGES_STORE_NAME,
  CONVERSATION_SOURCES_STORE_NAME,
]
const CONVERSATION_BUNDLE_SCHEMA_VERSION = 1
export const CONVERSATION_BACKUP_SCHEMA_VERSION = 1
const VALID_MESSAGE_ROLES = new Set(['user', 'assistant'])

/** @param {IDBRequest} request */
function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

/** @param {IDBTransaction} transaction */
function transactionAsPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })
}

async function runTransaction(storeNames, mode, callback) {
  const database = await getDatabase()
  const transaction = database.transaction(storeNames, mode)
  const transactionComplete = transactionAsPromise(transaction)

  try {
    const result = await callback(transaction)
    await transactionComplete
    return result
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      // The transaction may already have completed or aborted.
    }
    await transactionComplete.catch(() => {})
    throw error
  }
}

/** @param {IDBObjectStore} messageStore @param {string} conversationId */
async function getNextSequence(messageStore, conversationId) {
  const messages = await requestAsPromise(
    messageStore.index('conversationId').getAll(conversationId)
  )
  return messages.reduce((max, message) => Math.max(max, message.sequence || 0), 0) + 1
}

function createConversationRecord(conversationData) {
  const now = new Date().toISOString()
  return {
    ...conversationData,
    id: conversationData.id || generateUUID(),
    title: conversationData.title || 'New conversation',
    createdAt: conversationData.createdAt || now,
    updatedAt: conversationData.updatedAt || now,
    archived: conversationData.archived || false,
    tags: conversationData.tags || [],
    personaSnapshot: conversationData.personaSnapshot || {
      content: '',
      language: 'en',
      tone: null,
      version: 1,
    },
    providerId: conversationData.providerId || 'gemini',
    modelId: conversationData.modelId || null,
    deleted: conversationData.deleted || false,
    deletedAt: conversationData.deletedAt || null,
  }
}

function createMessageRecord(conversationId, sequence, messageData) {
  return {
    ...messageData,
    id: messageData.id || generateUUID(),
    conversationId,
    sequence,
    createdAt: messageData.createdAt || new Date().toISOString(),
    status: messageData.status || 'complete',
    skillInvocation: messageData.skillInvocation || null,
    attachmentRefs: messageData.attachmentRefs || [],
    providerId: messageData.providerId || null,
    modelId: messageData.modelId || null,
    usage: messageData.usage || null,
    error: messageData.error || null,
  }
}

export async function createConversation(conversationData, firstUserMessage = null) {
  return runTransaction(
    [CONVERSATIONS_STORE_NAME, CONVERSATION_MESSAGES_STORE_NAME],
    'readwrite',
    async (transaction) => {
      const conversationStore = transaction.objectStore(CONVERSATIONS_STORE_NAME)
      const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
      const conversation = createConversationRecord(conversationData)

      if (await requestAsPromise(conversationStore.get(conversation.id))) {
        throw new Error(`Conversation ${conversation.id} already exists`)
      }
      await requestAsPromise(conversationStore.add(conversation))

      if (!firstUserMessage) return { conversation, firstMessage: null }
      if (firstUserMessage.role && firstUserMessage.role !== 'user') {
        throw new Error('The first conversation message must have the user role')
      }

      const firstMessage = createMessageRecord(
        conversation.id,
        await getNextSequence(messageStore, conversation.id),
        { ...firstUserMessage, role: 'user' }
      )
      await requestAsPromise(messageStore.add(firstMessage))
      return { conversation, firstMessage }
    }
  )
}

export async function getConversation(id) {
  return runTransaction([CONVERSATIONS_STORE_NAME], 'readonly', async (transaction) =>
    requestAsPromise(transaction.objectStore(CONVERSATIONS_STORE_NAME).get(id))
  )
}

export async function listConversations({ includeArchived = true, includeDeleted = false } = {}) {
  return runTransaction([CONVERSATIONS_STORE_NAME], 'readonly', async (transaction) => {
    const conversations = await requestAsPromise(
      transaction.objectStore(CONVERSATIONS_STORE_NAME).getAll()
    )
    return conversations
      .filter((conversation) => includeDeleted || !conversation.deleted)
      .filter((conversation) => includeArchived || !conversation.archived)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  })
}

export async function updateConversationMetadata(id, metadata) {
  return runTransaction([CONVERSATIONS_STORE_NAME], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(CONVERSATIONS_STORE_NAME)
    const conversation = await requestAsPromise(store.get(id))
    if (!conversation) throw new Error(`Conversation ${id} was not found`)
    const updatedConversation = {
      ...conversation,
      ...metadata,
      id: conversation.id,
      updatedAt: new Date().toISOString(),
    }
    await requestAsPromise(store.put(updatedConversation))
    return updatedConversation
  })
}

export function archiveConversation(id, archived = true) {
  return updateConversationMetadata(id, { archived })
}

export function softDeleteConversation(id) {
  return updateConversationMetadata(id, {
    deleted: true,
    deletedAt: new Date().toISOString(),
  })
}

export async function addMessage(conversationId, messageData) {
  return runTransaction(
    [CONVERSATIONS_STORE_NAME, CONVERSATION_MESSAGES_STORE_NAME],
    'readwrite',
    async (transaction) => {
      const conversationStore = transaction.objectStore(CONVERSATIONS_STORE_NAME)
      const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
      const conversation = await requestAsPromise(conversationStore.get(conversationId))
      if (!conversation || conversation.deleted) {
        throw new Error(`Conversation ${conversationId} was not found`)
      }

      const message = createMessageRecord(
        conversationId,
        await getNextSequence(messageStore, conversationId),
        messageData
      )
      await requestAsPromise(messageStore.add(message))

      conversation.updatedAt = new Date().toISOString()
      await requestAsPromise(conversationStore.put(conversation))
      return message
    }
  )
}

export async function finalizeAssistantMessage(conversationId, messageData) {
  const status = messageData.status || 'complete'
  const shouldPersist =
    status === 'complete' ||
    (status === 'aborted' && Boolean(messageData.content)) ||
    (status === 'error' && Boolean(messageData.error))

  if (!shouldPersist) return null
  if (messageData.role && messageData.role !== 'assistant') {
    throw new Error('finalizeAssistantMessage only accepts assistant messages')
  }

  return runTransaction(
    [CONVERSATIONS_STORE_NAME, CONVERSATION_MESSAGES_STORE_NAME],
    'readwrite',
    async (transaction) => {
      const conversationStore = transaction.objectStore(CONVERSATIONS_STORE_NAME)
      const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
      const conversation = await requestAsPromise(conversationStore.get(conversationId))
      if (!conversation || conversation.deleted) {
        throw new Error(`Conversation ${conversationId} was not found`)
      }

      const message = createMessageRecord(
        conversationId,
        await getNextSequence(messageStore, conversationId),
        { ...messageData, role: 'assistant', status }
      )
      await requestAsPromise(messageStore.add(message))

      if (status === 'complete') {
        conversation.updatedAt = new Date().toISOString()
        await requestAsPromise(conversationStore.put(conversation))
      }
      return message
    }
  )
}

export async function listMessagesByConversation(conversationId) {
  return runTransaction([CONVERSATION_MESSAGES_STORE_NAME], 'readonly', async (transaction) => {
    const messages = await requestAsPromise(
      transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME).index('conversationId').getAll(conversationId)
    )
    return messages.sort((left, right) => left.sequence - right.sequence)
  })
}

export async function deleteMessagesByConversation(conversationId) {
  return runTransaction([CONVERSATION_MESSAGES_STORE_NAME], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
    const messages = await requestAsPromise(store.index('conversationId').getAll(conversationId))
    await Promise.all(messages.map((message) => requestAsPromise(store.delete(message.id))))
    return messages.length
  })
}

export async function putSourceSnapshot(sourceData) {
  const sourceKey = sourceData.sourceKey || `${sourceData.normalizedUrl}:${sourceData.contentHash}`
  if (!sourceData.normalizedUrl || !sourceData.contentHash) {
    throw new Error('Source snapshots require normalizedUrl and contentHash')
  }

  return runTransaction([CONVERSATION_SOURCES_STORE_NAME], 'readwrite', async (transaction) => {
    const store = transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME)
    const existingSource = await requestAsPromise(store.index('sourceKey').get(sourceKey))
    if (existingSource) return existingSource

    const source = {
      ...sourceData,
      id: sourceData.id || generateUUID(),
      sourceKey,
      capturedAt: sourceData.capturedAt || new Date().toISOString(),
      tabIdHint: sourceData.tabIdHint ?? null,
    }
    await requestAsPromise(store.add(source))
    return source
  })
}

export async function getSourceById(id) {
  return runTransaction([CONVERSATION_SOURCES_STORE_NAME], 'readonly', async (transaction) =>
    requestAsPromise(transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME).get(id))
  )
}

export async function getSourceByKey(sourceKey) {
  return runTransaction([CONVERSATION_SOURCES_STORE_NAME], 'readonly', async (transaction) =>
    requestAsPromise(transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME).index('sourceKey').get(sourceKey))
  )
}

export async function getSourcesByIds(ids) {
  return runTransaction([CONVERSATION_SOURCES_STORE_NAME], 'readonly', async (transaction) => {
    const store = transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME)
    const sources = await Promise.all(ids.map((id) => requestAsPromise(store.get(id))))
    return sources.filter(Boolean)
  })
}

export async function deleteUnreferencedSources() {
  return runTransaction(
    [CONVERSATION_MESSAGES_STORE_NAME, CONVERSATION_SOURCES_STORE_NAME],
    'readwrite',
    async (transaction) => {
      const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
      const sourceStore = transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME)
      const messages = await requestAsPromise(messageStore.getAll())
      const referencedSourceIds = new Set(
        messages.flatMap((message) => message.attachmentRefs || [])
      )
      const sources = await requestAsPromise(sourceStore.getAll())
      const unreferencedSources = sources.filter((source) => !referencedSourceIds.has(source.id))
      await Promise.all(unreferencedSources.map((source) => requestAsPromise(sourceStore.delete(source.id))))
      return unreferencedSources.map((source) => source.id)
    }
  )
}

function validateConversationBundle(bundle) {
  if (!bundle?.conversation?.id || !Array.isArray(bundle.messages) || !Array.isArray(bundle.sources)) {
    throw new Error('Invalid conversation bundle')
  }
  if (bundle.schemaVersion && bundle.schemaVersion > CONVERSATION_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`Conversation bundle schema ${bundle.schemaVersion} is not supported`)
  }

  const sourceIds = new Set()
  const sourceKeys = new Set()
  for (const source of bundle.sources) {
    if (!source.id || !source.sourceKey || sourceIds.has(source.id) || sourceKeys.has(source.sourceKey)) {
      throw new Error('Conversation bundle has invalid source records')
    }
    sourceIds.add(source.id)
    sourceKeys.add(source.sourceKey)
  }
  const messageIds = new Set()
  const sequences = new Set()
  for (const message of bundle.messages) {
    if (
      !message.id ||
      messageIds.has(message.id) ||
      message.conversationId !== bundle.conversation.id ||
      !VALID_MESSAGE_ROLES.has(message.role) ||
      !Number.isInteger(message.sequence) ||
      message.sequence < 1
    ) {
      throw new Error('Conversation bundle has invalid message foreign keys')
    }
    messageIds.add(message.id)
    const sequenceKey = `${message.conversationId}:${message.sequence}`
    if (sequences.has(sequenceKey)) {
      throw new Error('Conversation bundle has duplicate message sequences')
    }
    sequences.add(sequenceKey)
    for (const sourceId of message.attachmentRefs || []) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(`Conversation bundle references missing source ${sourceId}`)
      }
    }
  }
}

export async function exportConversationBundle(conversationId) {
  const conversation = await getConversation(conversationId)
  if (!conversation) throw new Error(`Conversation ${conversationId} was not found`)
  const messages = await listMessagesByConversation(conversationId)
  const sourceIds = [...new Set(messages.flatMap((message) => message.attachmentRefs || []))]
  const sources = await getSourcesByIds(sourceIds)

  return {
    schemaVersion: CONVERSATION_BUNDLE_SCHEMA_VERSION,
    conversation,
    messages,
    sources,
  }
}

export async function importConversationBundle(bundle) {
  validateConversationBundle(bundle)

  return runTransaction(CHAT_STORES, 'readwrite', async (transaction) => {
    const conversationStore = transaction.objectStore(CONVERSATIONS_STORE_NAME)
    const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
    const sourceStore = transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME)
    const sourceIdMap = new Map()

    for (const source of bundle.sources) {
      const existingByKey = await requestAsPromise(sourceStore.index('sourceKey').get(source.sourceKey))
      if (existingByKey) {
        sourceIdMap.set(source.id, existingByKey.id)
        continue
      }

      const sourceId = (await requestAsPromise(sourceStore.get(source.id))) ? generateUUID() : source.id
      const importedSource = { ...source, id: sourceId }
      await requestAsPromise(sourceStore.add(importedSource))
      sourceIdMap.set(source.id, sourceId)
    }

    const conversationId = (await requestAsPromise(conversationStore.get(bundle.conversation.id)))
      ? generateUUID()
      : bundle.conversation.id
    const importedConversation = { ...bundle.conversation, id: conversationId }
    await requestAsPromise(conversationStore.add(importedConversation))

    const messageIdMap = new Map()
    for (const message of bundle.messages) {
      const messageId = (await requestAsPromise(messageStore.get(message.id))) ? generateUUID() : message.id
      const importedMessage = {
        ...message,
        id: messageId,
        conversationId,
        attachmentRefs: (message.attachmentRefs || []).map((sourceId) => sourceIdMap.get(sourceId)),
      }
      await requestAsPromise(messageStore.add(importedMessage))
      messageIdMap.set(message.id, messageId)
    }

    return {
      conversationId,
      messageIdMap: Object.fromEntries(messageIdMap),
      sourceIdMap: Object.fromEntries(sourceIdMap),
    }
  })
}

export function validateConversationBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid conversation backup')
  }
  if (backup.schemaVersion && backup.schemaVersion > CONVERSATION_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Conversation backup schema ${backup.schemaVersion} is not supported`)
  }
  const conversations = backup?.conversations || []
  const messages = backup?.conversationMessages || []
  const sources = backup?.conversationSources || []
  if (!Array.isArray(conversations) || !Array.isArray(messages) || !Array.isArray(sources)) {
    throw new Error('Conversation backup chat fields must be arrays')
  }
  const conversationIds = new Set(conversations.map((conversation) => conversation?.id))
  const sourceIds = new Set(sources.map((source) => source?.id))
  const sourceKeys = new Set()
  const messageIds = new Set()
  const sequences = new Set()

  if (conversationIds.size !== conversations.length || conversations.some((conversation) => !conversation?.id)) {
    throw new Error('Conversation backup has duplicate or missing conversation IDs')
  }
  for (const source of sources) {
    if (!source?.id || !source.sourceKey || sourceIds.size !== sources.length || sourceKeys.has(source.sourceKey)) {
      throw new Error('Conversation backup has invalid source records')
    }
    sourceKeys.add(source.sourceKey)
  }

  for (const message of messages) {
    if (
      !message?.id ||
      messageIds.has(message.id) ||
      !VALID_MESSAGE_ROLES.has(message.role) ||
      !Number.isInteger(message.sequence) ||
      message.sequence < 1 ||
      !conversationIds.has(message.conversationId)
    ) {
      throw new Error(`Conversation backup references missing conversation ${message.conversationId}`)
    }
    messageIds.add(message.id)
    const sequenceKey = `${message.conversationId}:${message.sequence}`
    if (sequences.has(sequenceKey)) throw new Error('Conversation backup has duplicate message sequences')
    sequences.add(sequenceKey)
    for (const sourceId of message.attachmentRefs || []) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(`Conversation backup references missing source ${sourceId}`)
      }
    }
  }
}

export async function exportConversationBackup() {
  return runTransaction(CHAT_STORES, 'readonly', async (transaction) => ({
    schemaVersion: CONVERSATION_BACKUP_SCHEMA_VERSION,
    conversations: await requestAsPromise(transaction.objectStore(CONVERSATIONS_STORE_NAME).getAll()),
    conversationMessages: await requestAsPromise(transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME).getAll()),
    conversationSources: await requestAsPromise(transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME).getAll()),
  }))
}

export async function restoreConversationBackup(backup) {
  validateConversationBackup(backup)
  return runTransaction(CHAT_STORES, 'readwrite', async (transaction) => {
    const conversationStore = transaction.objectStore(CONVERSATIONS_STORE_NAME)
    const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
    const sourceStore = transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME)
    await Promise.all([
      requestAsPromise(conversationStore.clear()),
      requestAsPromise(messageStore.clear()),
      requestAsPromise(sourceStore.clear()),
    ])
    for (const source of backup.conversationSources || []) {
      await requestAsPromise(sourceStore.add(source))
    }
    for (const conversation of backup.conversations || []) {
      await requestAsPromise(conversationStore.add(conversation))
    }
    for (const message of backup.conversationMessages || []) {
      await requestAsPromise(messageStore.add(message))
    }
    return true
  })
}

export async function importConversationBackup(backup, { mode = 'merge' } = {}) {
  // Pre-chat backups intentionally omit all three arrays and remain valid.
  const normalizedBackup = {
    schemaVersion: backup?.schemaVersion || 1,
    conversations: backup?.conversations || [],
    conversationMessages: backup?.conversationMessages || [],
    conversationSources: backup?.conversationSources || [],
  }
  validateConversationBackup(normalizedBackup)
  if (mode === 'replace') return restoreConversationBackup(normalizedBackup)
  if (mode !== 'merge') throw new Error(`Unsupported conversation import mode: ${mode}`)

  return runTransaction(CHAT_STORES, 'readwrite', async (transaction) => {
    const conversationStore = transaction.objectStore(CONVERSATIONS_STORE_NAME)
    const messageStore = transaction.objectStore(CONVERSATION_MESSAGES_STORE_NAME)
    const sourceStore = transaction.objectStore(CONVERSATION_SOURCES_STORE_NAME)
    const sourceIdMap = new Map()
    const conversationIdMap = new Map()
    const messageIdMap = new Map()

    for (const source of normalizedBackup.conversationSources) {
      const existingByKey = await requestAsPromise(sourceStore.index('sourceKey').get(source.sourceKey))
      const sourceId = existingByKey
        ? existingByKey.id
        : (await requestAsPromise(sourceStore.get(source.id))) ? generateUUID() : source.id
      if (!existingByKey) await requestAsPromise(sourceStore.add({ ...source, id: sourceId }))
      sourceIdMap.set(source.id, sourceId)
    }

    for (const conversation of normalizedBackup.conversations) {
      const conversationId = (await requestAsPromise(conversationStore.get(conversation.id)))
        ? generateUUID()
        : conversation.id
      await requestAsPromise(conversationStore.add({ ...conversation, id: conversationId }))
      conversationIdMap.set(conversation.id, conversationId)
    }

    for (const message of normalizedBackup.conversationMessages) {
      const messageId = (await requestAsPromise(messageStore.get(message.id)))
        ? generateUUID()
        : message.id
      await requestAsPromise(messageStore.add({
        ...message,
        id: messageId,
        conversationId: conversationIdMap.get(message.conversationId),
        attachmentRefs: (message.attachmentRefs || []).map((sourceId) => sourceIdMap.get(sourceId)),
      }))
      messageIdMap.set(message.id, messageId)
    }

    return {
      conversationIdMap: Object.fromEntries(conversationIdMap),
      messageIdMap: Object.fromEntries(messageIdMap),
      sourceIdMap: Object.fromEntries(sourceIdMap),
    }
  })
}

export async function clearConversationData() {
  return runTransaction(CHAT_STORES, 'readwrite', async (transaction) => {
    await Promise.all(CHAT_STORES.map((storeName) => requestAsPromise(transaction.objectStore(storeName).clear())))
    return true
  })
}

export const conversationRepository = {
  createConversation,
  getConversation,
  listConversations,
  updateConversationMetadata,
  archiveConversation,
  softDeleteConversation,
  addMessage,
  finalizeAssistantMessage,
  listMessagesByConversation,
  deleteMessagesByConversation,
  putSourceSnapshot,
  getSourceById,
  getSourceByKey,
  getSourcesByIds,
  deleteUnreferencedSources,
  exportConversationBundle,
  importConversationBundle,
  exportConversationBackup,
  importConversationBackup,
  clearConversationData,
}
