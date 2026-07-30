/**
 * Turns a provider model ID into a compact, human-readable label.
 * The provider icon already supplies provider context in model pickers, so a
 * namespace such as `anthropic/` is intentionally omitted.
 */
export function formatModelDisplayName(modelId) {
  if (typeof modelId !== 'string' || !modelId.trim()) return '—'

  let decodedModelId = modelId.trim()
  try {
    decodedModelId = decodeURIComponent(decodedModelId)
  } catch {
    // Keep malformed or literal percent sequences readable instead of failing
    // to render the model picker.
  }

  const modelName = decodedModelId.split('/').filter(Boolean).pop() || decodedModelId
  const readableName = modelName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

  return readableName
    ? readableName.charAt(0).toUpperCase() + readableName.slice(1)
    : '—'
}
