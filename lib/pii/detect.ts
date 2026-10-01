import type { Pii } from '@/lib/types'
import { normalizeCvText } from '@/lib/extract'

// Heuristic extraction of personal details from raw CV text. This runs locally
// (no AI) because the AI must never see these values. The founder can correct
// anything it gets wrong on the candidate page.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const HAS_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ // non-global, so .test() keeps no state
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)|,;]*)?/gi
/** A run of digits with phone-style separators. Filtered to >= 10 digits by callers. */
export const PHONE_BLOB_RE = /\+?\(?\d[\d \t().-]{8,}\d/g
const PINCODE_RE = /\b\d{3}\s?\d{3}\b/ // Indian PIN code
const ADDRESS_LABEL_RE = /^\s*(?:address|residence|home|location)\s*[:\-]\s*(.+)$/i

// Words that are never part of a person's name on a CV: section headings, job
// words, institutions, places, months. Matched case-insensitively per token.
const NOT_NAME = new Set(
  (
    'summary profile objective about experience education skills skill competencies core professional work employment history projects project ' +
    'certifications certification achievements awards honours honors languages interests hobbies contact details references declaration ' +
    'curriculum vitae resume cv linkedin github portfolio email phone mobile address personal key highlights expertise areas tools technical ' +
    'product products manager management senior junior associate assistant head lead leader director engineer engineering developer analyst ' +
    'consultant founder cofounder co intern internship officer executive vice president chief strategy strategic operations ops business ' +
    'technology technologies tech solutions services private limited pvt ltd inc llc group company corporation ' +
    'college university institute school academy matriculation secondary higher board bachelor master bachelors masters degree diploma ' +
    'india indian delhi new mumbai bombay bangalore bengaluru chennai hyderabad pune gurgaon gurugram noida kolkata ahmedabad jaipur ' +
    'tamil nadu tamilnadu haryana karnataka maharashtra kerala telangana gujarat rajasthan uttar pradesh west bengal punjab ' +
    'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec present ' +
    'saas b2b b2c ai ml data science scrum agile marketing sales growth design research customer client team the and of for in at with to'
  ).split(' '),
)

export function digitsOf(s: string): string {
  return s.replace(/\D/g, '')
}

/** Phone-like digit runs (10+ digits, not a list of years). */
export function phoneBlobs(text: string): string[] {
  return [...text.matchAll(PHONE_BLOB_RE)]
    .map((m) => m[0].trim())
    .filter((b) => {
      const d = digitsOf(b)
      if (d.length < 10) return false
      const groups = b.split(/[^\d]+/).filter(Boolean)
      return !groups.every((g) => /^(19|20)\d{2}$/.test(g)) // "2019 2020 2021"
    })
}

/** The candidate's own number from a blob, tolerating templates that print it twice: "+91 98111 2233398111 22333". */
function normalisePhone(blob: string): string {
  let d = digitsOf(blob)
  if (d.startsWith('91') && d.length >= 12) d = d.slice(2)
  else if (d.startsWith('0') && d.length >= 11) d = d.slice(1)
  const ten = d.slice(0, 10)
  return /^[6-9]\d{9}$/.test(ten) ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : blob
}

function hintTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2 && !NOT_NAME.has(t) && !['pdf', 'docx', 'doc', 'final', 'updated', 'new', 'latest', 'copy', 'pm', 'spm', 'apm', 'ops'].includes(t))
}

/** Tokens from the file name that look like a person's name, e.g. "04_anita_desai.pdf" -> ["anita", "desai"]. */
export function fileNameHints(fileName: string | null | undefined): string[] {
  if (!fileName) return []
  const t = hintTokens(fileName.replace(/\.(pdf|docx?)$/i, ''))
  return t.length >= 2 && t.length <= 4 ? t : []
}

const NAME_WORD = /^(?:[A-Z][a-z'’]+(?:-[A-Z][a-z'’]+)?|[A-Z]{2,}|[A-Z]\.?)$/

export type NameGuess = { name: string | null; confidence: 'high' | 'low' | 'none'; reasons: string[] }

/**
 * Score every 2-4 word run of capitalised words in the document. A real name is
 * usually corroborated: it matches the file name or a profile/email handle, sits
 * next to the email/phone line, and is often printed twice by the template.
 */
export function guessName(text: string, opts: { fileName?: string | null; handles?: string[] } = {}): NameGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const fileHints = fileNameHints(opts.fileName)
  const handleHints = new Set((opts.handles ?? []).flatMap(hintTokens))
  const contactLines = lines.flatMap((l, i) => (HAS_EMAIL.test(l) || phoneBlobs(l).length || /linkedin|github/i.test(l) ? [i] : []))
  const lowerText = text.toLowerCase()

  type Cand = { key: string; words: string[]; score: number; reasons: string[] }
  const best = new Map<string, Cand>()

  lines.forEach((line, i) => {
    for (const segment of line.split(/\s*(?:[|•·,;:()/]|—|–|\s-\s|\.\s)\s*/)) {
      const words = segment.split(/\s+/).filter(Boolean)
      for (let start = 0; start < words.length; start++) {
        for (let len = 2; len <= 4 && start + len <= words.length; len++) {
          const w = words.slice(start, start + len)
          if (!w.every((x) => NAME_WORD.test(x))) break
          const toks = w.map((x) => x.replace(/[.'’]/g, '').toLowerCase())
          if (toks.some((t) => NOT_NAME.has(t))) break
          if (new Set(toks).size !== toks.length) continue // "DESAI Anita Desai"
          if (toks.filter((t) => t.length > 1).length < 2) continue // need two real words
          const key = toks.join(' ')
          const reasons: string[] = []
          let score = 0
          const inFile = fileHints.length > 0 && toks.filter((t) => t.length > 1).every((t) => fileHints.includes(t))
          if (inFile) {
            const inOrder = fileHints.join(' ').includes(toks.filter((t) => t.length > 1).join(' '))
            score += inOrder ? 6 : 3
            reasons.push('file name')
          }
          if (handleHints.size && toks.filter((t) => t.length > 1).every((t) => handleHints.has(t))) {
            score += 6
            reasons.push('profile/email handle')
          }
          const near = contactLines.some((c) => Math.abs(c - i) <= 2)
          if (near) {
            score += 3
            reasons.push('next to contact details')
          }
          const repeats = lowerText.split(key).length - 1
          if (repeats >= 2) {
            score += 2
            reasons.push('repeated')
          }
          if (i < 3 || i >= lines.length - 3) score += 1
          if (len <= 3) score += 1
          const prev = best.get(key)
          if (!prev || prev.score < score) best.set(key, { key, words: w, score, reasons })
        }
      }
    }
  })

  const ranked = [...best.values()].sort((a, b) => b.score - a.score || b.words.length - a.words.length)
  const top = ranked[0]
  if (!top) return { name: null, confidence: 'none', reasons: [] }

  // Prefer the way the name is written in normal case somewhere in the CV.
  const titled = (() => {
    const re = new RegExp(top.words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i')
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) if (m[0] !== m[0].toUpperCase()) return m[0].replace(/\s+/g, ' ')
    return top.words.map((w) => (w.length > 1 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(' ')
  })()

  const corroborated = top.reasons.includes('file name') || top.reasons.includes('profile/email handle')
  const strongLayout = top.reasons.includes('next to contact details') && top.reasons.includes('repeated')
  const runnerUp = ranked[1]
  const clearWinner = !runnerUp || top.score - runnerUp.score >= 2
  const confidence = (corroborated || strongLayout) && clearWinner ? 'high' : 'low'
  return { name: titled, confidence, reasons: top.reasons }
}

function detectAddress(lines: string[]): string | null {
  for (const line of lines.slice(0, 15)) {
    const labelled = line.match(ADDRESS_LABEL_RE)
    if (labelled) return labelled[1].trim()
  }
  for (const line of [...lines.slice(0, 10), ...lines.slice(-6)]) {
    if (PINCODE_RE.test(line) && /[a-z]{3,}/i.test(line) && line.length < 140) {
      const seg = line.split(/\s[|•·]\s/).find((s) => PINCODE_RE.test(s)) ?? line
      return seg.trim()
    }
  }
  return null
}

export type DetectedPii = Pii & { nameConfidence: NameGuess['confidence']; nameReasons: string[] }

export function detectPii(rawText: string, opts: { fileName?: string | null } = {}): DetectedPii {
  const text = normalizeCvText(rawText)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const email = text.match(EMAIL_RE)?.[0] ?? null

  const urls = [...text.matchAll(URL_RE)]
    .map((m) => m[0].replace(/[.,;]+$/, ''))
    .filter((u) => !email || !email.includes(u))
    .filter((u) => /\//.test(u) || /^(https?:|www\.)/i.test(u) || /linkedin|github/i.test(u))
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? null
  const github = urls.find((u) => /github\.com/i.test(u)) ?? null
  // Personal URLs: anything on the contact lines (header or footer), not company links in the body.
  const contactText = lines.filter((l) => HAS_EMAIL.test(l) || phoneBlobs(l).length).join('\n') + '\n' + lines.slice(0, 8).join('\n')
  const other = urls.filter((u) => u !== linkedin && u !== github && contactText.includes(u))

  // Handles: profile slugs ("anita-desai-pm") and the email's local part.
  const slugs = [...contactText.matchAll(/\b[a-z]+(?:[-_.][a-z]+){1,3}\b/gi)].map((m) => m[0]).filter((s) => !/\.(com|in|co|org|io|dev|net)$/i.test(s))
  const handles = [...slugs, ...urls, email?.split('@')[0] ?? ''].filter(Boolean)
  const guess = guessName(text, { fileName: opts.fileName, handles })

  const phoneBlob = phoneBlobs(text)[0]
  return {
    name: guess.name,
    nameConfidence: guess.confidence,
    nameReasons: guess.reasons,
    email,
    phone: phoneBlob ? normalisePhone(phoneBlob) : null,
    linkedin_url: linkedin,
    github_url: github,
    other_urls: [...new Set(other)],
    address: detectAddress(lines),
  }
}
