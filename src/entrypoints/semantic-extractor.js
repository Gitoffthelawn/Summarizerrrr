import { extractSemanticPageContent } from '@/lib/content/semanticPageExtractor.js'

export default defineUnlistedScript(() => {
  globalThis.__SUMMARIZERRRR_EXTRACT_SEMANTIC_CONTENT__ = () =>
    extractSemanticPageContent(document)
})
