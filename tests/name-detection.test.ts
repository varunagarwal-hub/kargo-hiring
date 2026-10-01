import { describe, expect, it } from 'vitest'
import { normalizeCvText } from '@/lib/extract'
import { detectPii } from '@/lib/pii/detect'
import { buildPiiGuard, redactCv } from '@/lib/pii/redact'

// Layouts seen in real uploads (names and numbers here are invented). Designed
// PDF templates put the header block at the END of the extracted text, print the
// name twice with no space ("DESAIAnita"), and double the phone number.

const BODY = `SUMMARY
Data-driven Associate Product Manager with 2+ years in B2B SaaS, scaling platforms to 2.6M+ users.
EXPERIENCE
Associate Product Manager
Acme Talent March 2025 - Present New Delhi, Delhi, IN,
• Renegotiated assessment pricing with 3 enterprise clients; 18% higher renewals.
EDUCATION
B.Tech in Computer Science 2020 – 2024
Abacus Institute of Engineering and Management (MAKAUT)`

const FOOTER_NAME = `New Delhi, Delhi, India
${BODY}
ANITA DESAIAnita Desai
anita.d@example.com +91 98111 2233398111 22333 anita-desai-pmin/anita-desai-pm`

const COLLEGE_FIRST = `| | |
EDUCATION
R.M.K COLLEGE OF
ENGINEERING AND
TECHNOLOGY
BE in Computer Science
June 2024 | Tiruvallur, TamilNadu
${BODY}
RAHUL MENON
RAHUL MENON
Rahul Menon
rahul.m@example.com 97183 52840`

const COMPETENCIES_FIRST = `| | LinkedInSUMMARY
PRODUCT STRATEGY | PRODUCT HEAD | EX-FOUNDER | SAAS
CORE COMPETENCIES
Product Strategy, Roadmapping, Product Discovery, PRD/BRD, User Research
${BODY}
Led product design, market research, and fundraising.VIKAS RAOVikas Rao
team@example.com+91 98142 7031898142 70318 vikas-rao-pm`

describe('normalizeCvText', () => {
  it('splits names that templates glue together', () => {
    expect(normalizeCvText('ANITA DESAIAnita Desai')).toBe('ANITA DESAI Anita Desai')
    expect(normalizeCvText('Ravi KumarRAVI KUMAR')).toBe('Ravi Kumar RAVI KUMAR')
    expect(normalizeCvText('fundraising.VIKAS RAOVikas Rao')).toBe('fundraising. VIKAS RAO Vikas Rao')
    expect(normalizeCvText('| | LinkedInSUMMARY')).toBe('| | LinkedIn SUMMARY')
  })
  it('leaves ordinary words alone', () => {
    expect(normalizeCvText('iOS, SaaS, PhD, B2B, McKinsey, AI/ML')).toBe('iOS, SaaS, PhD, B2B, McKinsey, AI/ML')
  })
})

describe('name detection on real-world layouts', () => {
  it('finds a name printed at the end of the text, glued and duplicated', () => {
    const p = detectPii(FOOTER_NAME, { fileName: '04_anita_desai.pdf' })
    expect(p.name).toBe('Anita Desai')
    expect(p.nameConfidence).toBe('high')
    expect(p.phone).toBe('+91 98111 22333')
  })

  it('does not take a college name from the first lines', () => {
    const p = detectPii(COLLEGE_FIRST, { fileName: '16_rahul_menon.pdf' })
    expect(p.name).toBe('Rahul Menon')
    expect(p.nameConfidence).toBe('high')
  })

  it('does not take a section heading like CORE COMPETENCIES', () => {
    const p = detectPii(COMPETENCIES_FIRST, { fileName: '10_vikas_rao.pdf' })
    expect(p.name).toBe('Vikas Rao')
    expect(p.nameConfidence).toBe('high')
  })

  it('is still confident without a helpful file name when the layout is clear', () => {
    const p = detectPii(COLLEGE_FIRST, { fileName: 'Resume.pdf' })
    expect(p.name).toBe('Rahul Menon')
    expect(p.nameConfidence).toBe('high')
  })

  it('reports low confidence when nothing backs the guess up', () => {
    const p = detectPii(`Priyanka Shah\n${BODY}\nReferences available on request.`, { fileName: 'CV_final.pdf' })
    expect(p.nameConfidence).toBe('low')
  })

  it('redacts every copy of the name, the doubled phone and the profile slug', () => {
    for (const [cv, file, parts, digits] of [
      [FOOTER_NAME, '04_anita_desai.pdf', ['anita', 'desai'], ['98111', '22333']],
      [COLLEGE_FIRST, '16_rahul_menon.pdf', ['rahul', 'menon'], ['97183', '52840']],
      [COMPETENCIES_FIRST, '10_vikas_rao.pdf', ['vikas', 'rao'], ['98142', '70318']],
    ] as const) {
      const pii = detectPii(cv, { fileName: file })
      const out = redactCv(cv, pii)
      for (const part of parts) expect(out.toLowerCase()).not.toMatch(new RegExp(`(?<![a-z])${part}(?![a-z])`))
      for (const d of digits) expect(out).not.toContain(d)
      expect(out).toContain('[CANDIDATE]')
      expect(out).toContain('Abacus Institute of Engineering') // work content survives
      expect(buildPiiGuard(pii, { fileName: file }).findLeaks('', [out])).toEqual([])
    }
  })
})

describe('guard safety net', () => {
  it('blocks the AI request when the detected name was wrong but the file name says otherwise', () => {
    const wrong = { name: 'Core Competencies', email: null, phone: null, linkedin_url: null, github_url: null, other_urls: [], address: null }
    const leaked = redactCv(COMPETENCIES_FIRST, wrong)
    const leaks = buildPiiGuard(wrong, { fileName: '10_vikas_rao.pdf' }).findLeaks('', [leaked])
    expect(leaks).toContain('name from file name')
  })

  it('blocks any phone-like number left in the CV text', () => {
    const none = { name: 'Anita Desai', email: null, phone: null, linkedin_url: null, github_url: null, other_urls: [], address: null }
    expect(buildPiiGuard(none).findLeaks('', ['call 98111 22333 anytime'])).toContain('phone-like number')
    expect(buildPiiGuard(none).findLeaks('', ['B.Tech 2020 – 2024, 2.6M+ users, ₹1,50,000'])).toEqual([])
  })
})
