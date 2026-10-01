import 'server-only'
import { randomUUID } from 'node:crypto'
import { dbAudit, loadActiveRubric, loadRubricById, loadSettings, mustOne, one, q, tx } from '@/lib/db'
import { env } from '@/lib/env'
import { cvKind, extractText } from '@/lib/extract'
import type { AiConfig } from '@/lib/ai/gemini'
import { detectPii } from '@/lib/pii/detect'
import { buildPiiGuard, redactCv } from '@/lib/pii/redact'
import { scoreBoth } from '@/lib/scoring'
import { putCv } from '@/lib/storage'
import { finalizeEmail, firstNameOf, writeBrief, writeEmail } from '@/lib/writing'
import { ROLES, type CriterionScore, type EmailType, type Pii, type Role } from '@/lib/types'

// Orchestration. This is the only module that holds both personal details and
// the AI config: it reads PII to build the guard and to fill in {{first_name}},
// but it only ever hands redacted text to the AI modules.

function ai(): AiConfig {
  return { apiKey: env.geminiApiKey(), model: env.geminiModel(), audit: dbAudit }
}

type PiiRow = Pii & { raw_cv_text: string; name_status: 'confident' | 'unconfirmed' | 'confirmed' }
type CandidateRow = { id: string; role_applied: Role; redacted_cv_text: string; status: string; cv_file_name: string | null }

const loadPii = (id: string) => mustOne<PiiRow>(`select * from candidate_pii where candidate_id = $1`, [id], 'personal details')
const loadCandidate = (id: string) =>
  mustOne<CandidateRow>(`select id, role_applied, redacted_cv_text, status, cv_file_name from candidates where id = $1`, [id], 'candidate')
const setStatus = (id: string, status: string, error: string | null = null) =>
  q(`update candidates set status = $2, error_message = $3, updated_at = now() where id = $1`, [id, status, error])

// ---------------------------------------------------------------------------
// Step 0: upload, extract, separate personal details
// ---------------------------------------------------------------------------

export async function createCandidate(file: File, role: Role): Promise<string> {
  const kind = cvKind(file.name, file.type)
  if (!kind) throw new Error('Only PDF and DOCX files are supported.')
  if (file.size > 4 * 1024 * 1024) throw new Error('File is larger than 4 MB.')
  const buf = Buffer.from(await file.arrayBuffer())
  const raw = await extractText(buf, kind)
  const pii = detectPii(raw, { fileName: file.name })
  const redacted = redactCv(raw, pii)

  // File first, then both rows in one transaction: no row ever points at a missing file.
  const id = randomUUID()
  const key = `cvs/${id}/original.${kind}`
  try {
    await putCv(key, buf, file.type || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'))
  } catch (e) {
    throw new Error(`Upload to storage failed: ${(e as Error).message}`)
  }
  await tx(async (query) => {
    await query(
      `insert into candidates (id, role_applied, redacted_cv_text, cv_file_path, cv_file_name, status) values ($1, $2, $3, $4, $5, 'processing')`,
      [id, role, redacted, key, file.name],
    )
    await query(
      `insert into candidate_pii (candidate_id, name, email, phone, linkedin_url, github_url, other_urls, address, raw_cv_text, name_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, pii.name, pii.email, pii.phone, pii.linkedin_url, pii.github_url, pii.other_urls, pii.address, raw, pii.nameConfidence === 'high' ? 'confident' : 'unconfirmed'],
    )
  })
  return id
}

/** Founder corrected the personal details: re-redact from the original text, re-score if the redacted text changed. */
export async function updatePii(candidateId: string, pii: Pii): Promise<{ rescored: boolean }> {
  const current = await loadPii(candidateId)
  const redacted = redactCv(current.raw_cv_text, pii)
  await q(
    `update candidate_pii set name = $2, email = $3, phone = $4, linkedin_url = $5, github_url = $6, other_urls = $7, address = $8, name_status = 'confirmed', updated_at = now()
     where candidate_id = $1`,
    [candidateId, pii.name, pii.email, pii.phone, pii.linkedin_url, pii.github_url, pii.other_urls, pii.address],
  )
  const cand = await loadCandidate(candidateId)
  if (cand.redacted_cv_text === redacted && cand.status !== 'error') return { rescored: false }
  await q(`update candidates set redacted_cv_text = $2 where id = $1`, [candidateId, redacted])
  await processCandidate(candidateId, { forceDraft: true })
  return { rescored: true }
}

// ---------------------------------------------------------------------------
// Steps 1-3 for one candidate
// ---------------------------------------------------------------------------

export async function processCandidate(candidateId: string, opts: { forceDraft?: boolean } = {}): Promise<void> {
  await setStatus(candidateId, 'processing')
  try {
    const cand = await loadCandidate(candidateId)
    const pii = await loadPii(candidateId)
    const guard = buildPiiGuard(pii, { fileName: cand.cv_file_name })
    // Fail closed: without a known name we cannot redact it, so nothing goes to the AI.
    if (!pii.name?.trim()) {
      throw new Error('No name was found in this CV. Enter it under Personal details and save; scoring then runs automatically.')
    }
    if (pii.name_status === 'unconfirmed') {
      throw new Error(`Please confirm the name. Our best guess is "${pii.name}", but nothing in the CV backs it up. Check it under Personal details and save; scoring then runs automatically.`)
    }
    guard.assertClean('', [cand.redacted_cv_text])

    const [pm, spm] = await Promise.all([loadActiveRubric('pm'), loadActiveRubric('spm')])
    const result = await scoreBoth(ai(), { candidateId, redactedCv: cand.redacted_cv_text, pm, spm, guard })
    const model = env.geminiModel()
    for (const role of ROLES) {
      const r = result[role]
      await q(`select record_scoring($1, $2, $3, $4, $5, $6::jsonb)`, [
        candidateId, role, role === 'pm' ? pm.id : spm.id, r.total, model, JSON.stringify(r.scores),
      ])
    }
    await setStatus(candidateId, 'ready')

    await syncBriefs({ force: candidateId })
    await ensureDraft(candidateId, { force: opts.forceDraft ?? true })
  } catch (e) {
    await setStatus(candidateId, 'error', (e as Error).message)
    throw e
  }
}

// ---------------------------------------------------------------------------
// Step 2: briefs for the top N per role
// ---------------------------------------------------------------------------

type CurrentTotal = { id: string; candidate_id: string; role: Role; rubric_id: string; total: number; above_line: boolean }

/** Current totals for a role, best first. Ties: earlier applicant first. */
export function rankedTotals(role: Role): Promise<CurrentTotal[]> {
  return q<CurrentTotal>(
    `select t.id, t.candidate_id, t.role, t.rubric_id, t.total, t.above_line
       from totals t join candidates c on c.id = t.candidate_id
      where t.role = $1 and t.is_current and c.status = 'ready'
      order by t.total desc, c.created_at asc`,
    [role],
  )
}

function scoresFor(totalId: string): Promise<CriterionScore[]> {
  return q<CriterionScore>(
    `select s.criterion_id, s.score, s.model_score, s.gated, s.reason, cr.position
       from scores s join criteria cr on cr.id = s.criterion_id
      where s.total_id = $1 order by cr.position`,
    [totalId],
  )
}

/** Make sure exactly the current top N per role have an up-to-date brief. `force` regenerates one candidate's briefs. */
export async function syncBriefs(opts: { force?: string } = {}): Promise<void> {
  const settings = await loadSettings()
  for (const role of ROLES) {
    const top = (await rankedTotals(role)).slice(0, settings.top_n)
    const topIds = top.map((t) => t.candidate_id)
    await q(`delete from briefs where role = $1 and not (candidate_id = any($2::uuid[]))`, [role, topIds])
    const existing = await q<{ candidate_id: string; total_id: string }>(`select candidate_id, total_id from briefs where role = $1`, [role])

    for (const t of top) {
      const have = existing.find((b) => b.candidate_id === t.candidate_id)
      if (have && have.total_id === t.id && opts.force !== t.candidate_id) continue
      const cand = await loadCandidate(t.candidate_id)
      const guard = buildPiiGuard(await loadPii(t.candidate_id), { fileName: cand.cv_file_name })
      const rubric = await loadRubricById(t.rubric_id)
      const text = await writeBrief(ai(), {
        candidateId: t.candidate_id,
        redactedCv: cand.redacted_cv_text,
        rubric,
        scores: await scoresFor(t.id),
        guard,
      })
      await q(
        `insert into briefs (candidate_id, role, total_id, text) values ($1, $2, $3, $4)
         on conflict (candidate_id, role) do update set total_id = excluded.total_id, text = excluded.text, created_at = now()`,
        [t.candidate_id, role, t.id, text],
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3: email draft
// ---------------------------------------------------------------------------

export async function expectedEmailType(candidateId: string): Promise<EmailType | null> {
  const t = await one<{ above_line: boolean }>(
    `select t.above_line from totals t join candidates c on c.id = t.candidate_id and c.role_applied = t.role
      where t.candidate_id = $1 and t.is_current`,
    [candidateId],
  )
  if (!t) return null
  return t.above_line ? 'invite' : 'rejection'
}

/**
 * Create (or replace) the draft for a candidate. Never touches an email that has
 * been sent: once one is sent, no new draft is created.
 */
export async function ensureDraft(candidateId: string, opts: { force?: boolean } = {}): Promise<void> {
  const emails = await q<{ id: string; type: EmailType; status: string }>(`select id, type, status from emails where candidate_id = $1`, [candidateId])
  if (emails.some((e) => e.status !== 'draft')) return
  const type = await expectedEmailType(candidateId)
  if (!type) return
  const draft = emails.find((e) => e.status === 'draft')
  if (draft && draft.type === type && !opts.force) return

  const [cand, pii, settings] = await Promise.all([loadCandidate(candidateId), loadPii(candidateId), loadSettings()])
  const generated = await writeEmail(ai(), {
    candidateId,
    redactedCv: cand.redacted_cv_text,
    type,
    role: cand.role_applied,
    settings,
    guard: buildPiiGuard(pii, { fileName: cand.cv_file_name }),
  })
  const final = finalizeEmail(generated, firstNameOf(pii.name), settings.signature)
  // Replace only the draft (the status filter protects sent mail), atomically.
  await tx(async (query) => {
    await query(`delete from emails where candidate_id = $1 and status = 'draft'`, [candidateId])
    await query(`insert into emails (candidate_id, type, subject, body, status) values ($1, $2, $3, $4, 'draft')`, [
      candidateId, type, final.subject, final.body,
    ])
  })
}

/** After a settings change: re-derive lines, top-N briefs and draft types. */
export async function syncAll(): Promise<{ checked: number; errors: string[] }> {
  await q(`select recompute_lines()`)
  const errors: string[] = []
  try {
    await syncBriefs()
  } catch (e) {
    errors.push(`briefs: ${(e as Error).message}`)
  }
  const queue = await q<{ id: string }>(`select id from candidates where status = 'ready'`)
  let checked = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          await ensureDraft(c.id)
          checked++
        } catch (e) {
          errors.push(`${c.id}: ${(e as Error).message}`)
        }
      }
    }),
  )
  return { checked, errors }
}
