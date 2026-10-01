import { z } from 'zod'
import { generateJson, type AiConfig } from '@/lib/ai/gemini'
import type { PiiGuard } from '@/lib/pii/redact'
import type { CriterionScore, Rubric } from '@/lib/types'

export const SYSTEM_PROMPT = `You are an experienced hiring manager at Kargo, a logistics software company, reading CVs against a fixed rubric.
Read each CV the way a fair, generous senior manager would: look for the behaviour each criterion describes, not for the exact wording or industry of the rubric's examples.
Rules:
- The rubric was written from logistics hires, but the behaviours are general. Credit equivalent evidence from any industry (SaaS, banking, consulting, e-commerce, government and so on). The "HOW TO READ" notes list equivalents.
- Use what the CV says or clearly implies. A reasonable reading is fine; do not invent facts the CV does not support.
- Judge each criterion on its own. A gap in one criterion must not lower the score of another.
- When torn between two scores, choose the higher one.
- The "source lines from past hires" are calibration examples from other people. They are not part of this CV.
- Personal details in the CV were replaced with tokens such as [CANDIDATE], [EMAIL], [PHONE], [URL], [ADDRESS]. Ignore them.
- Scores are integers 0, 1, 2 or 3.
- "reason" is ONE line (max ~35 words). For 1-3, quote or closely paraphrase the CV line you relied on, then say briefly why. For 0, say in a few words what is missing.
- Reply with JSON only.`

/** How to apply the rubric leniently and across industries. Shown to the model with every rubric. */
export const READING_GUIDE = `HOW TO READ THIS RUBRIC (applies to every criterion):
Scores:
- 0 = nothing in the CV relates to this behaviour at all.
- 1 = the behaviour shows up in some form, even if partial, adjacent, or missing who/what/result.
- 2 = the behaviour is clearly demonstrated at least once. One detail (the exact organisation name, the precise result, the duration) may be implied rather than spelled out.
- 3 = clearly demonstrated more than once, in different contexts.
Equivalent evidence by criterion:
1. Got a yes from someone they couldn't instruct: winning agreement from anyone outside their reporting line: enterprise clients (pilots, contracts, renewals, scope or price changes, CXO sign-off), regulators or government bodies (RBI, SEBI, ministries, customs, approvals), partners and integrations, investors, carriers or vendors they had to persuade or negotiate with.
2. Stayed the named contact until closure: being the point of contact through a long-running effort to a clear end: client implementations, rollouts, migrations, launches, escalations, audits or onboarding, owned over weeks or months to go-live, sign-off or resolution.
3. Caught the disruption before the customer felt it: handling something unplanned (incident, outage, regulatory change, vendor or partner failure, escalation, volume spike, deadline risk) so that customers or downstream teams were protected: "on time", "no downtime", "no customer impact", "met the deadline".
4. Fixed it with what was already in the room: solving problems without extra headcount or budget: re-prioritising, process redesign, automation, a small team, extra hours, or an approach that the team kept using afterwards.`

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
  const lines = [`RUBRIC: ${title}, version ${rubric.version}`, `SCORING GUIDE (all criteria):\n${rubric.scoring_guide}`, READING_GUIDE]
  if (rubric.role === 'spm') {
    lines.push(
      'SPM RULE: each SPM criterion is the PM behaviour plus an extra bar (shown below). Read it with the same lenient guide: ' +
        'give 2 when the PM behaviour is clearly there and the extra bar is at least partly met, 3 when both are clearly met more than once.',
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
 * The rubric's SPM rule, enforced in code: each SPM criterion is the PM bar plus
 * an extra bar, so meeting it implies meeting the PM version. An SPM criterion
 * score therefore never exceeds the PM score for the same criterion. (SPM totals
 * can still differ from PM totals because the two rubrics weight criteria differently.)
 */
export function applySpmGate(
  spm: Omit<CriterionScore, 'gated' | 'score'>[],
  pmByPosition: Map<number, number>,
): CriterionScore[] {
  return spm.map((s) => {
    const pm = pmByPosition.get(s.position) ?? 0
    const capped = Math.min(s.model_score, pm)
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
