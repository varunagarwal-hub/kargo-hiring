export type CvKind = 'pdf' | 'docx'

export function cvKind(fileName: string, mime: string): CvKind | null {
  const n = fileName.toLowerCase()
  if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf'
  if (n.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  return null
}

/**
 * Clean up text from designed PDF templates. Many store the name header twice
 * (all-caps and normal case) with no space between the copies, and glue it onto
 * the previous line: "fundraising.ANITA DESAIAnita Desai". Split those joins so
 * names and words can be found and redacted reliably.
 */
export function normalizeCvText(raw: string): string {
  return raw
    .replace(/ /g, ' ')
    .replace(/([A-Z]{2})([A-Z][a-z]{2})/g, '$1 $2') // DESAIAnita -> DESAI Anita
    .replace(/([a-z]{2})([A-Z]{2})/g, '$1 $2') // DesaiANITA -> Desai ANITA
    .replace(/([a-z])([A-Z]{3,})/g, '$1 $2') // LinkedInSUMMARY -> LinkedIn SUMMARY (iOS untouched)
    .replace(/([a-z]{2}[.;:])([A-Z])/g, '$1 $2') // fundraising.ANITA -> fundraising. ANITA
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extract plain text. Images (including any photo) are ignored, so they never reach the AI. */
export async function extractText(buf: Buffer, kind: CvKind): Promise<string> {
  let text: string
  if (kind === 'pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(new Uint8Array(buf))
    const r = await pdfText(doc, { mergePages: true })
    text = Array.isArray(r.text) ? r.text.join('\n') : r.text
  } else {
    const mammoth = await import('mammoth')
    text = (await mammoth.extractRawText({ buffer: buf })).value
  }
  text = normalizeCvText(text)
  if (text.length < 200) {
    throw new Error('Could not extract enough text from this CV (is it a scanned image?). Upload a text-based PDF or DOCX.')
  }
  return text
}
