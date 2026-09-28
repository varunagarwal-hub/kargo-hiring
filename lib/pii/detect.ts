import type { Pii } from '@/lib/types'

// Heuristic extraction of personal details from raw CV text. This runs
// locally (no AI) because the AI must never see these values. The founder
// can correct anything it gets wrong on the candidate page.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Phone: optional +country, then 8-15 digits with common separators.
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){1,4}\d{3,5}/g
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)|,;]*)?/gi
const PINCODE_RE = /\b\d{3}\s?\d{3}\b/ // Indian PIN code
const ADDRESS_LABEL_RE = /^\s*(?:address|residence|home|location)\s*[:\-]\s*(.+)$/i
const SECTION_WORDS =
  /\b(curriculum|vitae|resume|résumé|cv|profile|summary|experience|education|skills|objective|contact|product|manager|senior|analyst|engineer|operations|executive|associate|lead|head|officer|coordinator|specialist)\b/i

export function digitsOf(s: string): string {
  return s.replace(/\D/g, '')
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[0] : null
}

function detectPhone(text: string): string | null {
  for (const m of text.matchAll(PHONE_RE)) {
    const raw = m[0].trim()
    const d = digitsOf(raw)
    // Skip years, date ranges, percentages and short numbers.
    if (d.length < 10 || d.length > 13) continue
    if (/^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(raw)) continue
    return raw
  }
  return null
}

function detectName(lines: string[]): string | null {
  // The name is almost always the first short line of 2-4 capitalised words.
  for (const line of lines.slice(0, 8)) {
    const l = line.replace(/\s+/g, ' ').trim()
    if (!l || l.length > 50) continue
    if (EMAIL_RE.test(l)) { EMAIL_RE.lastIndex = 0; continue }
    if (/\d/.test(l) || /[|@:/]/.test(l)) continue
    if (SECTION_WORDS.test(l)) continue
    const words = l.split(' ')
    if (words.length < 2 || words.length > 4) continue
    if (words.every((w) => /^[A-Z][a-zA-Z'’.-]*$/.test(w) || /^[A-Z]+$/.test(w))) {
      // Normalise ALL CAPS names to Title Case.
      return words.map((w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(' ')
    }
  }
  return null
}

function detectAddress(lines: string[]): string | null {
  for (const line of lines.slice(0, 15)) {
    const labelled = line.match(ADDRESS_LABEL_RE)
    if (labelled) return labelled[1].trim()
  }
  // An unlabelled header line containing a PIN code, e.g. "12 Hill Rd, Bandra West, Mumbai 400050".
  for (const line of lines.slice(0, 10)) {
    if (PINCODE_RE.test(line) && /[a-z]{3,}/i.test(line) && line.length < 140) {
      // Take the segment that contains the PIN code when the line is pipe/bullet separated.
      const seg = line.split(/\s[|•·]\s/).find((s) => PINCODE_RE.test(s)) ?? line
      return seg.trim()
    }
  }
  return null
}

export function detectPii(rawText: string): Pii {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const email = firstMatch(rawText, EMAIL_RE)
  EMAIL_RE.lastIndex = 0

  const urls = [...rawText.matchAll(URL_RE)]
    .map((m) => m[0].replace(/[.,;]+$/, ''))
    .filter((u) => !email || !email.includes(u)) // the email's domain is not a URL
    .filter((u) => /\//.test(u) || /^(https?:|www\.)/i.test(u) || /linkedin|github/i.test(u))
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? null
  const github = urls.find((u) => /github\.com/i.test(u)) ?? null
  // Other personal URLs (portfolio, blog) in the header area only; company URLs later in the CV are kept.
  const header = lines.slice(0, 8).join('\n')
  const other = urls.filter((u) => u !== linkedin && u !== github && header.includes(u))

  return {
    name: detectName(lines),
    email,
    phone: detectPhone(rawText),
    linkedin_url: linkedin,
    github_url: github,
    other_urls: [...new Set(other)],
    address: detectAddress(lines),
  }
}
