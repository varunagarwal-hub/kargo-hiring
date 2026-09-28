import { z } from 'zod'
import { generateJson, type AiConfig } from '@/lib/ai/gemini'
import type { PiiGuard } from '@/lib/pii/redact'
import type { CriterionScore, Rubric } from '@/lib/types'

export const SYSTEM_PROMPT = `You score CVs for Kargo, a logistics software company, against a fixed hiring rubric.
Rules:
- Use only what the CV text says. Do not infer, assume or reward anything the CV does not state.
- Judge each criterion against its "strong" and "weak" descriptions and the 0-3 scoring guide.
- The "source lines from past hires" are calibration examples from other people. They are not part of this CV.
- Personal details in the CV were replaced with tokens such as [CANDIDATE], [EMAIL], [PHONE], [URL], [ADDRESS]. Ignore them.
- Scores are integers 0, 1, 2 or 3.
- "reason" is ONE line (max ~35 words). If the score is 1-3, quote or closely paraphrase the specific CV line you relied on, in quotation marks, then say briefly why it earns that score. If the score is 0, the reason is exactly "No instance found."
- Reply with JSON only.`

const ScoringReply = z.object({
  criteria: z
    .array(
      z.object({
        position: z.number().int(),
        reason: z.string().min(1),
        score: z.number().int().min(0).max(3),
      }),
    )
    .min(1),
})
type ScoringReply = z.infer<typeof ScoringReply>

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    criteria: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          position: { type: 'INTEGER' },
          reason: { type: 'STRING' },
          score: { type: 'INTEGER', minimum: 0, maximum: 3 },
        },
        required: ['position', 'reason', 'score'],
        propertyOrdering: ['position', 'reason', 'score'],
      },
    },
  },
  required: ['criteria'],
}

function block(label: string, text: string | null) {
  return text ? `${label}:\n${text}` : ''
}

/** Rubric text given to the model. For SPM, the PM bar is included per criterion. */
export function rubricPrompt(rubric: Rubric, pmRubric?: Rubric): string {
  const title = rubric.role === 'pm' ? 'PRODUCT MANAGER (PM)' : 'SENIOR PRODUCT MANAGER (SPM)'
  const lines = [`RUBRIC: ${title}, version ${rubric.version}`, `SCORING GUIDE (all criteria):\n${rubric.scoring_guide}`]
  if (rubric.role === 'spm') {
    lines.push(
      'SPM RULE: for each criterion, first check the CV meets the PM strong description in full. ' +
        'Only then apply the additional SPM bar. A CV that does not meet the PM bar cannot score above what it would score on the PM version.',
    )
  }
  for (const c of rubric.criteria) {
    const pm = pmRubric?.criteria.find((p) => p.position === c.position)
    lines.push(
      [
        `--- CRITERION ${c.position}: ${c.name} ---`,
        block('Source lines from past hires (calibration only)', c.source_evidence),
        pm ? block('PM bar that must be met first (PM strong description)', pm.strong_description) : '',
        pm ? block('PM weak forms', pm.weak_description) : '',
        block(rubric.role === 'spm' ? 'SPM strong description' : 'What a strong candidate looks like', c.strong_description),
        block(rubric.role === 'spm' ? 'SPM weak forms' : 'What a weak candidate looks like', c.weak_description),
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
  lines.push(
    `Return {"criteria": [...]} with exactly one entry for each criterion position ${rubric.criteria.map((c) => c.position).join(', ')}.`,
  )
  return lines.join('\n\n')
}

export function validateReply(rubric: Rubric, reply: ScoringReply): string | null {
  const want = rubric.criteria.map((c) => c.position).sort()
  const got = reply.criteria.map((c) => c.position).sort()
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    return `expected exactly one entry for each position ${want.join(', ')}, got ${got.join(', ') || 'none'}`
  }
  for (const c of reply.criteria) {
    if (/\r|\n/.test(c.reason.trim())) return `criterion ${c.position}: reason must be one line`
    const none = /no instance found/i.test(c.reason)
    if (c.score === 0 && !none) return `criterion ${c.position}: a score of 0 must have the reason "No instance found."`
    if (c.score > 0 && none) return `criterion ${c.position}: reason says no instance found but score is ${c.score}`
  }
  return null
}

export async function scoreAgainstRubric(
  ai: AiConfig,
  opts: { candidateId: string | null; redactedCv: string; rubric: Rubric; pmRubric?: Rubric; guard: PiiGuard },
): Promise<Omit<CriterionScore, 'gated' | 'score'>[]> {
  const { rubric } = opts
  const reply = await generateJson(ai, {
    purpose: `score_${rubric.role}`,
    candidateId: opts.candidateId,
    system: SYSTEM_PROMPT,
    fixed: rubricPrompt(rubric, opts.pmRubric),
    candidate: [`CV TEXT (redacted):\n"""\n${opts.redactedCv}\n"""`],
    schema: ScoringReply,
    responseSchema: RESPONSE_SCHEMA,
    validate: (r) => validateReply(rubric, r),
    guard: opts.guard,
  })
  return rubric.criteria.map((c) => {
    const r = reply.criteria.find((x) => x.position === c.position)!
    return { criterion_id: c.id, position: c.position, model_score: r.score, reason: r.reason.trim() }
  })
}

/**
 * The rubric's SPM rule, enforced in code: the PM bar must be met (PM score >= 2
 * on the same criterion) before the SPM extra bar counts. If it is not met, the
 * SPM score cannot exceed the PM score.
 */
export function applySpmGate(
  spm: Omit<CriterionScore, 'gated' | 'score'>[],
  pmByPosition: Map<number, number>,
): CriterionScore[] {
  return spm.map((s) => {
    const pm = pmByPosition.get(s.position) ?? 0
    const capped = pm < 2 ? Math.min(s.model_score, pm) : s.model_score
    return { ...s, score: capped, gated: capped !== s.model_score }
  })
}

export function ungated(scores: Omit<CriterionScore, 'gated' | 'score'>[]): CriterionScore[] {
  return scores.map((s) => ({ ...s, score: s.model_score, gated: false }))
}

/** Total = sum(score / 3 * weight), 0-100, one decimal. */
export function computeTotal(rubric: Rubric, scores: { criterion_id: string; score: number }[]): number {
  let total = 0
  for (const c of rubric.criteria) {
    const s = scores.find((x) => x.criterion_id === c.id)
    if (!s) throw new Error(`Missing score for criterion ${c.position}`)
    total += (s.score / 3) * c.weight
  }
  return Math.round(total * 10) / 10
}

/** Score both rubrics. PM and SPM calls run in parallel; the gate is applied after. */
export async function scoreBoth(
  ai: AiConfig,
  opts: { candidateId: string | null; redactedCv: string; pm: Rubric; spm: Rubric; guard: PiiGuard },
) {
  const [pmRaw, spmRaw] = await Promise.all([
    scoreAgainstRubric(ai, { ...opts, rubric: opts.pm }),
    scoreAgainstRubric(ai, { ...opts, rubric: opts.spm, pmRubric: opts.pm }),
  ])
  const pmScores = ungated(pmRaw)
  const spmScores = applySpmGate(spmRaw, new Map(pmScores.map((s) => [s.position, s.score])))
  return {
    pm: { scores: pmScores, total: computeTotal(opts.pm, pmScores) },
    spm: { scores: spmScores, total: computeTotal(opts.spm, spmScores) },
  }
}
