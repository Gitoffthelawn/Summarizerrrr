import { exportConversationBundle } from '@/lib/db/conversationRepository.js'

function escapeMarkdown(value) {
  return String(value || '').replace(/[\\`*_{}\[\]<>]/g, '\\$&')
}

function sourceLabel(source) {
  return source?.title || source?.url || 'Captured source'
}

export function conversationBundleToMarkdown(bundle) {
  const sourcesById = new Map(bundle.sources.map((source) => [source.id, source]))
  const lines = [
    `# ${bundle.conversation.title || 'Conversation'}`,
    '',
    `- Exported: ${new Date().toISOString()}`,
    `- Created: ${bundle.conversation.createdAt}`,
    `- Updated: ${bundle.conversation.updatedAt}`,
    `- Archived: ${bundle.conversation.archived ? 'yes' : 'no'}`,
    '',
    '## Source provenance',
    '',
  ]

  if (!bundle.sources.length) lines.push('_No captured sources._', '')
  for (const source of bundle.sources) {
    lines.push(
      `- [${escapeMarkdown(sourceLabel(source))}](${source.url}) — captured ${source.capturedAt}`,
      `  - Type: ${source.sourceType}; source key: \`${source.sourceKey}\``,
    )
  }

  lines.push('', '## Transcript', '')
  for (const message of bundle.messages) {
    lines.push(`### ${message.role === 'assistant' ? 'Assistant' : 'You'} — ${message.createdAt}`, '')
    if (message.skillInvocation) {
      lines.push(`_Skill: ${escapeMarkdown(message.skillInvocation.skillId)} (v${message.skillInvocation.skillVersion})_`, '')
    }
    const sources = (message.attachmentRefs || []).map((id) => sourcesById.get(id)).filter(Boolean)
    if (sources.length) {
      lines.push(`_Sources: ${sources.map((source) => `[${escapeMarkdown(sourceLabel(source))}](${source.url})`).join(', ')}_`, '')
    }
    lines.push(message.content || '_No content._', '')
  }
  return `${lines.join('\n')}\n`
}

export async function exportConversationAsMarkdown(conversationId) {
  const bundle = await exportConversationBundle(conversationId)
  return new Blob([conversationBundleToMarkdown(bundle)], { type: 'text/markdown;charset=utf-8' })
}

export async function exportConversationAsJson(conversationId) {
  const bundle = await exportConversationBundle(conversationId)
  return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' })
}

export function conversationExportFilename(title, extension) {
  const stem = String(title || 'conversation')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'conversation'
  return `${stem}-${new Date().toISOString().slice(0, 10)}.${extension}`
}
