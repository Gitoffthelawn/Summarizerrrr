// @ts-nocheck
/**
 * The one description of "what kind of page is this tab" that the background
 * sends to the side panel.
 *
 * Three call sites built this object with their own copies of the same three
 * regexes: the `requestCurrentTabInfo` message, the `summarize-current-page`
 * keyboard command, and the tab-change listener. Splitting the message router
 * out of `index.js` would have moved one copy across a module boundary and left
 * the other two behind, so they share this instead.
 */

const YOUTUBE_REGEX = /youtube\.com\/watch/i
const UDEMY_REGEX = /udemy\.com\/course\/.*\/learn\//i
const COURSERA_REGEX = /coursera\.org\/learn\//i

/**
 * @param {{id: number, url: string, title: string}} tab
 * @param {'currentTabInfo'|'summarizeCurrentPage'|'tabUpdated'} action
 *   The message action the side panel dispatches on.
 */
export function describeTab(tab, action) {
  return {
    action,
    tabId: tab.id,
    tabUrl: tab.url,
    tabTitle: tab.title,
    isYouTube: YOUTUBE_REGEX.test(tab.url),
    isUdemy: UDEMY_REGEX.test(tab.url),
    isCoursera: COURSERA_REGEX.test(tab.url),
  }
}
