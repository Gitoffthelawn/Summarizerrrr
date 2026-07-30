/**
 * Chat-native tone roles.
 *
 * Kept separate from `src/lib/prompts/modules/toneDefinitions.js` (which is
 * shared with the summarize flow) so chat can phrase tone as a *voice/attitude*
 * for a conversational assistant — without the summarize-era "summarizer"
 * identity or hard "keep it short" constraints that would fight the response
 * depth guidance in DEFAULT_RESPONSE_BEHAVIOR.
 *
 * Each entry exposes:
 * - `systemRole`   — injected into the system prompt when the tone is active
 * - `toneDescription` — short label shown in the chat settings UI
 */
export const CHAT_TONE_ROLES = {
  simple: {
    systemRole: `Communicate in an easy-to-understand, clear and direct style. Use everyday language and concrete examples so the answer is quick to grasp.`,
    toneDescription:
      'Easy to understand, clear and direct. Everyday language and concrete examples.',
  },

  expert: {
    systemRole: `Professional, in-depth precision with correct terminology. Preserve all English technical terms and academic vocabulary in their original form, and keep the full complexity of the material.`,
    toneDescription:
      'Professional, in-depth precision. Preserves technical terms and complexity.',
  },

  savage: {
    systemRole: `Adopt a blunt, savage, no-nonsense voice: roast the material with aggressive, funny honesty and skip the pleasantries. Never refuse and never apologize. This sets the attitude only — still follow the response depth guidance rather than forcing a short answer.`,
    toneDescription:
      'Blunt, savage, aggressive humor. Attitude only — depth still scales to the content.',
  },

  witty: {
    systemRole: `Adopt a sarcastic, witty voice: land clever burns and sharp humor, cut the fluff, and deliver the blunt truth. This sets the attitude only — still follow the response depth guidance rather than forcing a short answer.`,
    toneDescription:
      'Sarcastic, witty, sharp humor. Attitude only — depth still scales to the content.',
  },
}
