import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AiError, type AiConfig, type AuditEntry } from '@/lib/ai/gemini'
import { detectPii } from '@/lib/pii/detect'
import { buildPiiGuard, redactCv } from '@/lib/pii/redact'
import { applySpmGate, computeTotal, scoreBoth } from '@/lib/scoring'
import { finalizeEmail, firstNameOf, writeBrief, writeEmail } from '@/lib/writing'
import type { Rubric } from '@/lib/types'
import { loadRubric, migratedDb } from '../scripts/local-db'
import { SAMPLE_CV } from './fixtures'

let pm: Rubric
let spm: Rubric
beforeAll(async () => {
  const pg = await migratedDb()
  pm = await loadRubric(pg, 'pm')
  spm = await loadRubric(pg, 'spm')
})

/** Fake Gemini: records every request body and answers with valid JSON for each purpose. */
function fakeGemini(opts: { malformedFirst?: boolean; pmScores?: number[]; spmScores?: number[] } = {}) {
  const bodies: string[] = []
  let n = 0
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = String(init.body)
    bodies.push(body)
    n++
    const sys = JSON.parse(body).systemInstruction.parts[0].text as string
    const user = JSON.parse(body).contents[0].parts[0].text as string
    let reply: unknown
    if (opts.malformedFirst && n === 1) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"criteria": [ oops' }] } }] }))
    }
    if (user.includes('RUBRIC: ')) {
      const isSpm = user.includes('SENIOR PRODUCT MANAGER')
      const s = (isSpm ? opts.spmScores : opts.pmScores) ?? [2, 1, 0, 3]
      reply = {
        criteria: s.map((score, i) => ({
          position: i + 1,
          score,
          reason: score === 0 ? 'No instance found.' : '"Renegotiated detention charges with Maersk Line" - named carrier, ask and result.',
        })),
      }
    } else if (sys.includes('interview briefs')) {
      reply = {
        strongest: 'The candidate got Maersk Line to waive detention charges.',
        weakest: 'No disruption caught before the customer felt it.',
        question: 'Tell me about a time a vendor changed something without notice?',
      }
    } else {
      reply = { subject: 'Your application to Kargo', body: 'Hi {{first_name}},\n\nThank you for applying. Your work with Maersk Line on detention charges stood out to us. We would like to talk.' }
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { bodies, fetchMock }
}

afterEach(() => vi.unstubAllGlobals())

describe('no AI payload contains personal details', () => {
  it('scoring, brief and both email types send only redacted text', async () => {
    const { bodies } = fakeGemini()
    const audit: AuditEntry[] = []
    const cfg: AiConfig = { apiKey: 'test', model: 'test-model', audit: (e) => void audit.push(e) }
    const pii = detectPii(SAMPLE_CV)
    const guard = buildPiiGuard(pii)
    const redactedCv = redactCv(SAMPLE_CV, pii)

    const result = await scoreBoth(cfg, { candidateId: 'c1', redactedCv, pm, spm, guard })
    await writeBrief(cfg, { candidateId: 'c1', redactedCv, rubric: pm, scores: result.pm.scores, guard })
    const settings = { company_name: 'Kargo', invite_next_step: 'Reply with slots.', jd_pm: 'PM JD', jd_spm: 'SPM JD' }
    const invite = await writeEmail(cfg, { candidateId: 'c1', redactedCv, type: 'invite', role: 'pm', settings, guard })
    await writeEmail(cfg, { candidateId: 'c1', redactedCv, type: 'rejection', role: 'pm', settings, guard })

    expect(bodies.length).toBe(5) // 2 scoring + 1 brief + 2 emails
    for (const b of bodies) {
      const text = JSON.parse(b).contents[0].parts[0].text + JSON.parse(b).systemInstruction.parts[0].text
      for (const s of [b, text]) {
        expect(s).not.toMatch(/ananya/i)
        expect(s).not.toMatch(/iyer/i)
        expect(s).not.toContain('ananya.iyer92@gmail.com')
        expect(s.replace(/\D/g, '')).not.toContain('9820012345')
        expect(s).not.toContain('linkedin.com/in')
        expect(s).not.toContain('Carter Road')
      }
      expect(b).toContain('[CANDIDATE]')
    }
    // Audit log: one entry per request, all passed, payload stored redacted.
    expect(audit.map((a) => a.pii_check)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed'])
    expect(audit.every((a) => !/ananya/i.test(a.payload))).toBe(true)

    // The name only appears after server-side substitution.
    const final = finalizeEmail(invite, firstNameOf(pii.name), 'Best,\nFounder')
    expect(final.body.startsWith('Hi Ananya,')).toBe(true)
    expect(final.body.endsWith('Best,\nFounder')).toBe(true)
  })

  it('blocks the request (and never calls the API) if unredacted text slips through', async () => {
    const { fetchMock } = fakeGemini()
    const audit: AuditEntry[] = []
    const cfg: AiConfig = { apiKey: 'test', model: 'm', audit: (e) => void audit.push(e) }
    const pii = detectPii(SAMPLE_CV)
    await expect(
      scoreBoth(cfg, { candidateId: 'c2', redactedCv: SAMPLE_CV, pm, spm, guard: buildPiiGuard(pii) }),
    ).rejects.toThrow(AiError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(audit.every((a) => a.pii_check === 'blocked' && a.payload.startsWith('[withheld'))).toBe(true)
  })
})

describe('scoring', () => {
  it('retries once when the model returns malformed JSON', async () => {
    const { fetchMock } = fakeGemini({ malformedFirst: true })
    const cfg: AiConfig = { apiKey: 't', model: 'm', audit: () => {} }
    const guard = buildPiiGuard(detectPii(SAMPLE_CV))
    const r = await scoreBoth(cfg, { candidateId: null, redactedCv: '[CANDIDATE] did things', pm, spm, guard })
    expect(fetchMock).toHaveBeenCalledTimes(3) // pm (bad, retry) + spm
    expect(r.pm.scores.map((s) => s.score)).toEqual([2, 1, 0, 3])
  })

  it('computes totals in code: sum(score / 3 * weight)', () => {
    const s = (vals: number[], r: Rubric) => r.criteria.map((c, i) => ({ criterion_id: c.id, score: vals[i] }))
    expect(computeTotal(pm, s([3, 3, 3, 3], pm))).toBe(100)
    expect(computeTotal(pm, s([0, 0, 0, 0], pm))).toBe(0)
    // 2/3*34 + 1/3*27 + 0 + 3/3*15 = 22.667 + 9 + 15 = 46.7
    expect(computeTotal(pm, s([2, 1, 0, 3], pm))).toBe(46.7)
    // SPM: 1/3*26 + 2/3*35 + 2/3*21 + 0 = 8.667 + 23.333 + 14 = 46
    expect(computeTotal(spm, s([1, 2, 2, 0], spm))).toBe(46)
  })

  it('applies the SPM gate: no SPM credit above the PM score unless the PM bar (>= 2) is met', () => {
    const raw = [1, 2, 3, 4].map((position) => ({ criterion_id: `c${position}`, position, model_score: 3, reason: 'x' }))
    const gated = applySpmGate(raw, new Map([[1, 3], [2, 2], [3, 1], [4, 0]]))
    expect(gated.map((g) => g.score)).toEqual([3, 3, 1, 0])
    expect(gated.map((g) => g.gated)).toEqual([false, false, true, true])
  })

  it('end to end: SPM scores are gated by the PM scores from the same CV', async () => {
    fakeGemini({ pmScores: [2, 1, 0, 3], spmScores: [3, 3, 2, 3] })
    const cfg: AiConfig = { apiKey: 't', model: 'm', audit: () => {} }
    const r = await scoreBoth(cfg, { candidateId: null, redactedCv: '[CANDIDATE]', pm, spm, guard: buildPiiGuard(detectPii(SAMPLE_CV)) })
    expect(r.spm.scores.map((s) => s.score)).toEqual([3, 1, 0, 3])
    expect(r.spm.total).toBe(computeTotal(spm, r.spm.scores))
  })
})

describe('brief focus', () => {
  it('is picked from the scores, so the brief cannot contradict them', async () => {
    const { pickBriefFocus } = await import('@/lib/writing')
    const s = (vals: number[], r: Rubric) => r.criteria.map((c, i) => ({ criterion_id: c.id, score: vals[i] }))
    // Priya's live PM scores: 3, 2, 2, 3 -> strongest "Got a yes" (3, weight 34); weakest "Stayed the named contact" (gap 27).
    const f = pickBriefFocus(pm, s([3, 2, 2, 3], pm))
    expect(f.strongest.position).toBe(1)
    expect(f.weakest.position).toBe(2)
    // A missing criterion always wins "weakest" over a partial one of similar weight.
    expect(pickBriefFocus(pm, s([2, 1, 0, 2], pm)).weakest.position).toBe(3)
    // All perfect: still two different criteria.
    const all = pickBriefFocus(spm, s([3, 3, 3, 3], spm))
    expect(all.strongest.position).not.toBe(all.weakest.position)
  })
})
