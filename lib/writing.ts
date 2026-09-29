import { z } from 'zod'
import { generateJson, type AiConfig } from '@/lib/ai/gemini'
import type { PiiGuard } from '@/lib/pii/redact'
import type { CriterionScore, EmailType, Rubric, Settings } from '@/lib/types'

const ROLE_TITLE = { pm: 'Product Manager', spm: 'Senior Product Manager' } as const

function cvBlock(redactedCv: string) {
  return `CV TEXT (redacted):\n"""\n${redactedCv}\n"""`
}

// ---------------------------------------------------------------------------
// Interview brief (top N per role)
// ---------------------------------------------------------------------------

const BriefReply = z.object({
  strongest: z.string().min(1),
  weakest: z.string().min(1),
  question: z.string().min(1),
})

const BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    strongest: { type: 'STRING' },
    weakest: { type: 'STRING' },
    question: { type: 'STRING' },
  },
  required: ['strongest', 'weakest', 'question'],
  propertyOrdering: ['strongest', 'weakest', 'question'],
}

const BRIEF_SYSTEM = `You write three-sentence interview briefs for Kargo's founder.
Rules:
- Refer only to things stated in the CV text. Never invent employers, numbers, dates or events.
- The STRONGEST and WEAKEST criteria are chosen for you from the scores. Write about exactly those two criteria; never swap them or pick others.
- "strongest": one sentence naming the candidate's evidence for the STRONGEST criterion, citing the CV line.
- "weakest": one sentence naming the WEAKEST criterion and what the CV lacks for it.
- "question": one specific interview question, ending with "?", that probes the WEAKEST criterion by asking for the details the rubric needs (the named outside party, the ask, the result, the duration, the end point, or how it was resourced).
- Refer to the candidate as "the candidate". Do not mention numeric scores.
- Each field is exactly one sentence. Reply with JSON only.`

/**
 * Pick the brief's focus in code so it can't contradict the scores.
 * Strongest: highest score, ties -> higher weight.
 * Weakest: biggest weighted gap (weight x (3 - score)), ties -> lower score; never the strongest.
 */
export function pickBriefFocus(rubric: Rubric, scores: Pick<CriterionScore, 'criterion_id' | 'score'>[]) {
  const rows = rubric.criteria.map((c) => ({ c, score: scores.find((s) => s.criterion_id === c.id)?.score ?? 0 }))
  const strongest = [...rows].sort((a, b) => b.score - a.score || b.c.weight - a.c.weight)[0]
  const weakest = rows
    .filter((r) => r !== strongest)
    .sort((a, b) => b.c.weight * (3 - b.score) - a.c.weight * (3 - a.score) || a.score - b.score)[0]
  return { strongest: strongest.c, weakest: weakest.c, weakestScore: weakest.score }
}

export async function writeBrief(
  ai: AiConfig,
  opts: { candidateId: string | null; redactedCv: string; rubric: Rubric; scores: CriterionScore[]; guard: PiiGuard },
): Promise<string> {
  const focus = pickBriefFocus(opts.rubric, opts.scores)
  const assessment = opts.rubric.criteria
    .map((c) => {
      const s = opts.scores.find((x) => x.criterion_id === c.id)
      return `${c.position}. ${c.name} (weight ${c.weight}) - scored ${s?.score ?? 0}/3: ${s?.reason ?? 'No instance found.'}`
    })
    .join('\n')
  const reply = await generateJson(ai, {
    purpose: `brief_${opts.rubric.role}`,
    candidateId: opts.candidateId,
    system: BRIEF_SYSTEM,
    fixed:
      `ROLE: ${ROLE_TITLE[opts.rubric.role]}\n\n` +
      `RUBRIC CRITERIA:\n${opts.rubric.criteria.map((c) => `${c.position}. ${c.name}\nStrong: ${c.strong_description}`).join('\n\n')}`,
    candidate: [
      `ASSESSMENT AGAINST THE RUBRIC (from this CV):\n${assessment}\n\n` +
        `STRONGEST criterion: ${focus.strongest.position}. ${focus.strongest.name}\n` +
        `WEAKEST criterion: ${focus.weakest.position}. ${focus.weakest.name}` +
        (focus.weakestScore >= 2 ? ' (met, but the thinnest evidence relative to its weight; probe for depth)' : ''),
      cvBlock(opts.redactedCv),
    ],
    schema: BriefReply,
    responseSchema: BRIEF_SCHEMA,
    validate: (r) => {
      if (!r.question.trim().endsWith('?')) return 'question must end with "?"'
      for (const [k, v] of Object.entries(r)) if (/\n/.test(v.trim())) return `${k} must be one sentence on one line`
      return null
    },
    guard: opts.guard,
  })
  return [reply.strongest, reply.weakest, reply.question].map((s) => s.trim()).join(' ')
}

// ---------------------------------------------------------------------------
// Email draft (every candidate)
// ---------------------------------------------------------------------------

const EmailReply = z.object({ subject: z.string().min(3).max(150), body: z.string().min(40) })
const EMAIL_SCHEMA = {
  type: 'OBJECT',
  properties: { subject: { type: 'STRING' }, body: { type: 'STRING' } },
  required: ['subject', 'body'],
  propertyOrdering: ['subject', 'body'],
}

export const FORBIDDEN_IN_EMAIL =
  /\b(score[sd]?|scoring|rubric|criteria|criterion|threshold|rank(ed|ing)?|points?|out of 100|percentile)\b|\[(CANDIDATE|EMAIL|PHONE|URL|ADDRESS)\]/i

function emailSystem(type: EmailType, companyName: string) {
  const common = `You write short, plain-text candidate emails from ${companyName}'s founder.
Rules:
- Start the body with exactly "Hi {{first_name}}," on its own line. Use the placeholder {{first_name}} literally; never write a name.
- Mention one or two specific things from the CV (a role, company or achievement it states) so the email is clearly personal. Never invent anything not in the CV.
- Never mention scores, rankings, rubrics, criteria, thresholds or any assessment method.
- Do not add a sign-off, signature, name or contact details at the end; a signature is appended automatically. End on the last sentence of the message.
- 90-160 words. Plain text, no markdown. Reply with JSON only.`
  if (type === 'invite') {
    return `${common}
- This is an interview invitation for the role below. Be warm and direct. Say why the CV caught our attention, then give the next step exactly as provided.`
  }
  return `${common}
- This is a warm rejection for the role below. Thank them sincerely, acknowledge something specific and genuinely good from the CV, say clearly that we will not be moving forward for this role, and wish them well.
- Do not give reasons tied to assessment, do not promise future roles, do not invite them to reapply.`
}

export async function writeEmail(
  ai: AiConfig,
  opts: {
    candidateId: string | null
    redactedCv: string
    type: EmailType
    role: Rubric['role']
    settings: Pick<Settings, 'company_name' | 'invite_next_step' | 'jd_pm' | 'jd_spm'>
    guard: PiiGuard
  },
): Promise<{ subject: string; body: string }> {
  const s = opts.settings
  const jd = opts.role === 'pm' ? s.jd_pm : s.jd_spm
  const reply = await generateJson(ai, {
    purpose: `email_${opts.type}`,
    candidateId: opts.candidateId,
    system: emailSystem(opts.type, s.company_name),
    fixed:
      `ROLE APPLIED FOR: ${ROLE_TITLE[opts.role]} at ${s.company_name}\n\n` +
      `JOB DESCRIPTION (context only):\n${jd}` +
      (opts.type === 'invite' ? `\n\nNEXT STEP TO INCLUDE:\n${s.invite_next_step}` : ''),
    candidate: [cvBlock(opts.redactedCv)],
    schema: EmailReply,
    responseSchema: EMAIL_SCHEMA,
    validate: (r) => {
      if (!/^\s*Hi \{\{first_name\}\},/.test(r.body)) return 'body must start with "Hi {{first_name}},"'
      const bad = `${r.subject}\n${r.body}`.match(FORBIDDEN_IN_EMAIL)
      if (bad) return `email must not contain "${bad[0]}"`
      return null
    },
    guard: opts.guard,
  })
  return { subject: reply.subject.trim(), body: reply.body.trim() }
}

/** Server-side, after generation: fill in the real first name and append the signature. */
export function finalizeEmail(draft: { subject: string; body: string }, firstName: string | null, signature: string) {
  const name = firstName?.trim() || 'there'
  const fill = (t: string) => t.replaceAll('{{first_name}}', name)
  return { subject: fill(draft.subject), body: `${fill(draft.body)}\n\n${signature.trim()}` }
}

export function firstNameOf(fullName: string | null): string | null {
  return fullName?.trim().split(/\s+/)[0] || null
}
