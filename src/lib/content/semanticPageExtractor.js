import Defuddle from 'defuddle'

const STRUCTURAL_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'pre',
  'blockquote',
  'tr',
  'dt',
  'dd',
  'figcaption',
].join(',')

function normalizeInlineText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function hasStructuralAncestor(element, root) {
  let ancestor = element.parentElement
  while (ancestor && ancestor !== root) {
    if (ancestor.matches?.(STRUCTURAL_SELECTOR)) return true
    ancestor = ancestor.parentElement
  }
  return false
}

function formatStructuralElement(element) {
  const tag = element.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tag)) {
    return `${'#'.repeat(Number(tag[1]))} ${normalizeInlineText(element.textContent)}`
  }

  if (tag === 'pre') {
    const text = String(element.textContent || '').trim()
    return text ? `\`\`\`\n${text}\n\`\`\`` : ''
  }

  if (tag === 'blockquote') {
    return normalizeInlineText(element.textContent)
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  }

  if (tag === 'li') {
    const text = normalizeInlineText(element.textContent)
    if (!text) return ''
    if (element.parentElement?.tagName.toLowerCase() === 'ol') {
      const siblings = [...element.parentElement.children].filter(
        (child) => child.tagName.toLowerCase() === 'li'
      )
      return `${siblings.indexOf(element) + 1}. ${text}`
    }
    return `- ${text}`
  }

  if (tag === 'tr') {
    const cells = [...element.querySelectorAll(':scope > th, :scope > td')]
      .map((cell) => normalizeInlineText(cell.textContent))
      .filter(Boolean)
    return cells.join(' | ')
  }

  return normalizeInlineText(element.textContent)
}

/**
 * Converts Defuddle's cleaned HTML into compact, model-friendly structured
 * text without pulling the full Markdown bundle into the extension.
 */
export function cleanedHtmlToStructuredText(document, html) {
  const container = document.createElement('div')
  container.innerHTML = String(html || '')

  const blocks = [...container.querySelectorAll(STRUCTURAL_SELECTOR)]
    .filter((element) => !hasStructuralAncestor(element, container))
    .map(formatStructuralElement)
    .filter(Boolean)

  if (blocks.length) return blocks.join('\n\n')
  return normalizeInlineText(container.textContent)
}

/**
 * Extracts the main page content using the same core engine as Obsidian Web
 * Clipper. Defuddle owns the DOM scoring/removal; this adapter only shapes its
 * cleaned HTML for the summarization context.
 */
export function extractSemanticPageContent(document) {
  const parser = new Defuddle(document, {
    url: document.URL,
    removeImages: true,
    useAsync: false,
  })
  const result = parser.parse()
  const body = cleanedHtmlToStructuredText(document, result.content)
  const title = normalizeInlineText(result.title || document.title)
  const content = title && !body.startsWith(`# ${title}`)
    ? `# ${title}\n\n${body}`.trim()
    : body

  return {
    content,
    method: 'defuddle',
    wordCount: result.wordCount || 0,
  }
}
