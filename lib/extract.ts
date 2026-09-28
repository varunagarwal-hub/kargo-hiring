export type CvKind = 'pdf' | 'docx'

export function cvKind(fileName: string, mime: string): CvKind | null {
  const n = fileName.toLowerCase()
  if (n.endsWith('.pdf') || mime === 'application/pdf') return 'pdf'
  if (n.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  return null
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
  text = text.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length < 200) {
    throw new Error('Could not extract enough text from this CV (is it a scanned image?). Upload a text-based PDF or DOCX.')
  }
  return text
}
