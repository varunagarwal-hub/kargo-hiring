import type { Pii } from '@/lib/types'
import { digitsOf } from './detect'

export const NAME_TOKEN = '[CANDIDATE]'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Letter-aware boundaries (\b is ASCII-only and treats ' as a boundary).
const B_START = "(?<![\\p{L}\\p{N}])"
const B_END = "(?![\\p{L}\\p{N}])"
const bounded = (pattern: string) => new RegExp(`${B_START}${pattern}${B_END}`, 'giu')

const ALL_EMAILS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const ALL_PHONES = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){1,4}\d{3,5}/g
const PROFILE_URLS = /\b(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s)|,;]*/gi

export function nameParts(name: string | null): string[] {
  if (!name) return []
  return name
    .split(/[\s]+/)
    .map((p) => p.replace(/[.,]/g, ''))
    .filter((p) => p.length >= 2)
}

/** Name variants as they appear in handles and URLs: "ananyaiyer", "ananya.iyer", "aiyer"... */
function nameCompounds(name: string | null): string[] {
  const parts = nameParts(name).map((p) => p.toLowerCase())
  if (parts.length < 2) return []
  const first = parts[0]
  const last = parts[parts.length - 1]
  const out = new Set<string>()
  for (const sep of ['', '.', '_', '-']) {
    out.add(first + sep + last)
    out.add(last + sep + first)
    out.add(parts.join(sep))
  }
  if ((first[0] + last).length >= 5) out.add(first[0] + last)
  return [...out]
}

function phoneRegex(phone: string): RegExp | null {
  const d = digitsOf(phone).slice(-10)
  if (d.length < 8) return null
  return new RegExp(d.split('').join('[\\s().+-]*'), 'g')
}

function emailHandle(email: string | null): string | null {
  const h = email?.split('@')[0]
  return h && h.length >= 4 ? h : null
}

/**
 * Remove personal details from CV text. Every email, phone number and
 * LinkedIn/GitHub URL is removed (not only the candidate's), then the
 * detected address and personal URLs, then every occurrence of the name.
 */
export function redactCv(raw: string, pii: Pii): string {
  let t = raw
  t = t.replace(ALL_EMAILS, '[EMAIL]')
  t = t.replace(PROFILE_URLS, '[URL]')
  for (const u of [pii.linkedin_url, pii.github_url, ...pii.other_urls]) {
    if (u) t = t.replace(new RegExp(esc(u), 'gi'), '[URL]')
  }
  if (pii.phone) {
    const re = phoneRegex(pii.phone)
    if (re) t = t.replace(re, '[PHONE]')
  }
  t = t.replace(ALL_PHONES, (m) => (digitsOf(m).length >= 10 && digitsOf(m).length <= 13 ? '[PHONE]' : m))
  t = t.replace(/\+\d{1,3}[\s.-]*\[PHONE\]/g, '[PHONE]') // leftover country code
  if (pii.address) t = t.replace(new RegExp(esc(pii.address), 'gi'), '[ADDRESS]')

  const parts = nameParts(pii.name)
  if (parts.length) {
    // Full name first (any whitespace between parts), so "Ananya Iyer" becomes one token.
    t = t.replace(bounded(parts.map(esc).join('\\s+')), NAME_TOKEN)
    for (const c of nameCompounds(pii.name)) t = t.replace(new RegExp(esc(c), 'gi'), NAME_TOKEN)
    for (const p of parts) t = t.replace(bounded(esc(p)), NAME_TOKEN)
    // Possessives/initials left behind: "[CANDIDATE] [CANDIDATE]" -> "[CANDIDATE]"
    t = t.replace(/\[CANDIDATE\](?:\s+\[CANDIDATE\])+/g, NAME_TOKEN)
  }
  const handle = emailHandle(pii.email)
  if (handle) t = t.replace(new RegExp(esc(handle), 'gi'), NAME_TOKEN)
  return t
}

export class PiiLeakError extends Error {
  constructor(public found: string[]) {
    super(`Blocked AI request: payload contains personal details (${found.join(', ')})`)
  }
}

/**
 * Build a check for AI payloads. Two scopes:
 *  - the whole payload must not contain the full name, email, phone, URLs or address;
 *  - candidate-derived text must not contain any single name part or email handle.
 * (Single name parts are only checked in candidate text because the fixed rubric
 * quotes past hires by first name, e.g. "Meghna", which is not this candidate.)
 */
export function buildPiiGuard(pii: Pii) {
  const parts = nameParts(pii.name)
  const whole: { label: string; test: (s: string) => boolean }[] = []
  const candidateOnly: typeof whole = []

  if (parts.length >= 2) {
    const re = bounded(parts.map(esc).join('\\s+'))
    whole.push({ label: 'name', test: (s) => new RegExp(re).test(s) })
  }
  for (const p of parts) {
    candidateOnly.push({ label: 'name part', test: (s) => bounded(esc(p)).test(s) })
  }
  for (const c of nameCompounds(pii.name)) {
    candidateOnly.push({ label: 'name variant', test: (s) => s.toLowerCase().includes(c) })
  }
  if (pii.email) whole.push({ label: 'email', test: (s) => s.toLowerCase().includes(pii.email!.toLowerCase()) })
  const handle = emailHandle(pii.email)
  if (handle) candidateOnly.push({ label: 'email handle', test: (s) => s.toLowerCase().includes(handle.toLowerCase()) })
  if (pii.phone) {
    const re = phoneRegex(pii.phone)
    if (re) whole.push({ label: 'phone', test: (s) => new RegExp(re).test(s) })
  }
  for (const u of [pii.linkedin_url, pii.github_url, ...pii.other_urls]) {
    if (u) whole.push({ label: 'url', test: (s) => s.toLowerCase().includes(u.toLowerCase()) })
  }
  if (pii.address) whole.push({ label: 'address', test: (s) => s.toLowerCase().includes(pii.address!.toLowerCase()) })

  return {
    findLeaks(payload: string, candidateText: string[]): string[] {
      const found = new Set<string>()
      for (const c of whole) if (c.test(payload)) found.add(c.label)
      for (const text of candidateText) for (const c of [...whole, ...candidateOnly]) if (c.test(text)) found.add(c.label)
      return [...found]
    },
    assertClean(payload: string, candidateText: string[]) {
      const found = this.findLeaks(payload, candidateText)
      if (found.length) throw new PiiLeakError(found)
    },
  }
}

export type PiiGuard = ReturnType<typeof buildPiiGuard>
