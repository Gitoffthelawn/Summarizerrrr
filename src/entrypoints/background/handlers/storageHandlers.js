// @ts-nocheck
/**
 * IndexedDB writes routed through the background so every surface shares one
 * database connection.
 */
import {
  addHistory,
  addSummary,
  updateHistoryArchivedStatus,
} from '@/lib/db/indexedDBService.js'

export function createStorageHandlers() {
  return {
    SAVE_TO_HISTORY: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          // Validate payload
          if (!message.payload || !message.payload.historyData) {
            throw new Error('Invalid payload: missing historyData')
          }

          const result = await addHistory(message.payload.historyData)
          sendResponse({ success: true, id: String(result) })
        } catch (error) {
          const errorMessage =
            error?.message ||
            error?.toString() ||
            'Unknown error occurred while saving to history'
          console.error('[Background] SAVE_TO_HISTORY error:', error)
          sendResponse({ success: false, error: errorMessage })
        }
      })()
      return true
    },

    SAVE_TO_ARCHIVE: (message, sender, sendResponse) => {
      ;(async () => {
        try {
          const newArchiveId = await addSummary(message.payload.archiveEntry)
          if (message.payload.historySourceId) {
            await updateHistoryArchivedStatus(
              message.payload.historySourceId,
              true
            )
          }
          sendResponse({ success: true, newArchiveId: String(newArchiveId) })
        } catch (error) {
          sendResponse({ success: false, error: error.message })
        }
      })()
      return true
    },
  }
}
