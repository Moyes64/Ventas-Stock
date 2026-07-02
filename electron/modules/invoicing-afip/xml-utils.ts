/**
 * Minimal XML value extractor for AFIP SOAP responses.
 * Uses only built-in Node.js — no xml2js, no xmlbuilder, no external deps.
 */

/**
 * Extracts the text content of the first occurrence of <tagName>...</tagName>.
 * Handles simple tags (no namespace stripping needed for inner content).
 */
export function extractTag(xml: string, tagName: string): string | undefined {
  // Match both <tag> and <ns:tag> and <tag attr="...">
  const re = new RegExp(`<(?:[^:>]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[^:>]+:)?${tagName}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : undefined
}

/**
 * Extracts all text contents of <tagName>...</tagName> occurrences.
 */
export function extractAllTags(xml: string, tagName: string): string[] {
  const re = new RegExp(`<(?:[^:>]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[^:>]+:)?${tagName}>`, 'gi')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim())
  }
  return results
}
