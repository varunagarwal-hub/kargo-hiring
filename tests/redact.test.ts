import { describe, expect, it } from 'vitest'
import { detectPii } from '@/lib/pii/detect'
import { buildPiiGuard, redactCv } from '@/lib/pii/redact'
import { SAMPLE_CV } from './fixtures'


describe('detectPii', () => {
  it('finds name, email, phone, profile URLs and address', () => {
    const p = detectPii(SAMPLE_CV)
    expect(p.name).toBe('Ananya Iyer')
    expect(p.email).toBe('ananya.iyer92@gmail.com')
    expect(p.phone?.replace(/\D/g, '')).toBe('919820012345')
    expect(p.linkedin_url).toBe('linkedin.com/in/ananya-iyer')
    expect(p.github_url).toBe('github.com/ananyaiyer')
    expect(p.address).toBe('14 Carter Road, Bandra West, Mumbai 400050')
  })

  it('does not treat year ranges as phone numbers', () => {
    expect(detectPii('Rohit Rao\n(2019-2023) (2015-2019)\n').phone).toBeNull()
  })
})

describe('redactCv', () => {
  const pii = detectPii(SAMPLE_CV)
  const out = redactCv(SAMPLE_CV, pii)

  it('replaces every occurrence of the name, including possessives and URL handles', () => {
    expect(out).not.toMatch(/ananya/i)
    expect(out).not.toMatch(/iyer/i)
    expect(out).toContain("[CANDIDATE]'s customers")
    expect(out).toContain('[CANDIDATE] is a product manager')
  })

  it('removes email, phones, URLs and address but keeps work content', () => {
    expect(out).not.toContain('98200')
    expect(out).not.toContain('2640')
    expect(out).toContain('[EMAIL]')
    expect(out).toContain('[EMAIL] | [PHONE] |')
    expect(out).toContain('[URL]')
    expect(out).toContain('[ADDRESS]')
    expect(out).toContain('Renegotiated detention charges with Maersk Line')
    expect(out).toContain('(2019-2023)')
  })

  it('passes its own guard', () => {
    const guard = buildPiiGuard(pii)
    expect(guard.findLeaks(out, [out])).toEqual([])
  })

  it('the guard catches a leak in candidate text', () => {
    const guard = buildPiiGuard(pii)
    expect(guard.findLeaks('x', ['Ananya led the project'])).toContain('name part')
    expect(guard.findLeaks('call +91-98200-12345', [])).toContain('phone')
    expect(guard.findLeaks('mail ANANYA.IYER92@gmail.com', [])).toContain('email')
  })

  it("does not flag a past hire's first name in the fixed rubric when it matches the candidate's", () => {
    const meghna = { name: 'Meghna Rao', email: null, phone: null, linkedin_url: null, github_url: null, other_urls: [], address: null }
    const guard = buildPiiGuard(meghna)
    const rubricText = 'Meghna: "coordinated directly with the CHA and customs officer"'
    expect(guard.findLeaks(rubricText, ['[CANDIDATE] managed carriers'])).toEqual([])
    expect(guard.findLeaks(rubricText, ['Meghna managed carriers'])).toContain('name part')
    expect(guard.findLeaks('Meghna Rao', [])).toContain('name')
  })
})
