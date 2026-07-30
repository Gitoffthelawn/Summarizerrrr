// @ts-nocheck
/**
 * Firefox optional-permission messages: broadcasting a change to everyone who
 * cares, and answering "do we have permission for this URL?".
 */
import { browser } from 'wxt/browser'

/**
 * @param {{getSidePanelPort: () => any}} deps
 *   A getter, not the port: `index.js` reassigns `sidePanelPort` on every
 *   connect/disconnect, so a captured value would go stale.
 */
export function createPermissionHandlers({ getSidePanelPort }) {
  return {
    PERMISSION_CHANGED: (message, sender, sendResponse) => {
      // Broadcast permission change to all tabs and sidepanel
      ;(async () => {
        try {
          console.log('[Background] Broadcasting permission change:', message)

          // Send to sidepanel if connected
          const sidePanelPort = getSidePanelPort()
          if (sidePanelPort) {
            sidePanelPort.postMessage({
              type: 'PERMISSION_CHANGED',
              permissionKey: message.permissionKey,
              value: message.value,
              timestamp: Date.now(),
            })
          }

          // Send to all tabs (for content scripts that might be listening)
          const tabs = await browser.tabs.query({})
          for (const tab of tabs) {
            try {
              await browser.tabs.sendMessage(tab.id, {
                type: 'PERMISSION_CHANGED',
                permissionKey: message.permissionKey,
                value: message.value,
                timestamp: Date.now(),
              })
            } catch (error) {
              // Ignore errors for tabs without content scripts
              // console.log(`Tab ${tab.id} không có content script`)
            }
          }

          sendResponse({ success: true, broadcasted: true })
        } catch (error) {
          console.error(
            '[Background] Error broadcasting permission change:',
            error
          )
          sendResponse({ success: false, error: error.message })
        }
      })()
      return true
    },

    CHECK_FIREFOX_PERMISSION: (message, sender, sendResponse) => {
      // Chỉ xử lý cho Firefox
      if (import.meta.env.BROWSER === 'firefox') {
        ;(async () => {
          try {
            // Import permission service functions
            const { checkPermission } = await import(
              '@/services/firefoxPermissionService.js'
            )
            const hasPermission = await checkPermission(message.url)
            sendResponse({
              success: true,
              hasPermission,
              url: message.url,
            })
          } catch (error) {
            console.error(
              '[Background] Error checking Firefox permissions:',
              error
            )
            sendResponse({
              success: false,
              error: error.message,
              url: message.url,
            })
          }
        })()
      } else {
        // Cho browser khác, luôn trả về true
        sendResponse({
          success: true,
          hasPermission: true,
          url: message.url,
        })
      }
      return true
    },
  }
}
