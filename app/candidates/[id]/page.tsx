import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loadSettings, one, q } from '@/lib/db'
import { NAME_TOKEN } from '@/lib/pii/redact'
import { ROLES, ROLE_LABEL, otherRole, type Pii, type Role } from '@/lib/types'
import { Nav } from '@/app/nav'
import { EmailEditor, PiiForm, RescoreButton } from './forms'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // re-score runs the whole pipeline

type ScoreRow = { score: number; model_score: number; gated: boolean; reason: string; criteria: { position: number; name: string; weight: number } }
type TotalRow = { id: string; role: Role; total: number; above_line: boolean; model: string; created_at: string; rubrics: { version: number }; scores: ScoreRow[] }
type EmailRow = { id: string; type: string; subject: string; body: string; status: string; sent_at: string | null; resend_id: string | null; last_error: string | null }

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [c, piiRow, totals, briefs, emails, settings] = await Promise.all([
    one<{ id: string; role_applied: Role; status: string; error_message: string | null; cv_file_name: string | null; redacted_cv_text: string | null; created_at: string }>(
      `select * from candidates where id = $1`,
      [id],
    ),
    one<Pii>(`select name, email, phone, linkedin_url, github_url, other_urls, address from candidate_pii where candidate_id = $1`, [id]),
    q<TotalRow>(
      `select t.id, t.role, t.total, t.above_line, t.model, t.created_at,
              json_build_object('version', r.version) as rubrics,
              (select json_agg(json_build_object(
                        'score', s.score, 'model_score', s.model_score, 'gated', s.gated, 'reason', s.reason,
                        'criteria', json_build_object('position', cr.position, 'name', cr.name, 'weight', cr.weight)))
                 from scores s join criteria cr on cr.id = s.criterion_id where s.total_id = t.id) as scores
         from totals t join rubrics r on r.id = t.rubric_id
        where t.candidate_id = $1 and t.is_current`,
      [id],
    ),
    q<{ role: Role; text: string }>(`select role, text from briefs where candidate_id = $1`, [id]),
    q<EmailRow>(`select * from emails where candidate_id = $1 order by created_at desc`, [id]),
    loadSettings(),
  ])
  if (!c) notFound()
  const pii = piiRow ?? { name: null, email: null, phone: null, linkedin_url: null, github_url: null, other_urls: [], address: null }
  const sent = emails.find((e) => e.status !== 'draft')
  const draft = emails.find((e) => e.status === 'draft')
  const line = (r: Role) => (r === 'pm' ? settings.pm_threshold : settings.spm_threshold)
  const display = (t: string) => t.replaceAll(NAME_TOKEN, pii.name?.split(/\s+/)[0] || 'the candidate')
  const other = totals.find((t) => t.role === otherRole(c.role_applied))

  return (
    <>
      <Nav />
      <main>
        <p className="small"><Link href="/">← All candidates</Link></p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0 }}>
            {pii.name || 'Unnamed'} <span className="muted" style={{ fontWeight: 400 }}>· applied {ROLE_LABEL[c.role_applied]}</span>
          </h1>
          <div className="row">
            {c.cv_file_name && <a href={`/api/cv/${c.id}`} target="_blank">Original CV ({c.cv_file_name})</a>}
            <RescoreButton candidateId={c.id} />
          </div>
        </div>
        {c.status === 'processing' && <p className="pill warn">Scoring in progress…</p>}
        {c.status === 'error' && <p className="error">Processing failed: {c.error_message}. Fix personal details if needed, then Re-score.</p>}
        {other?.above_line && (
          <p className="pill warn">
            Also clears the {ROLE_LABEL[other.role]} line ({Number(other.total).toFixed(1)} ≥ {line(other.role)}): consider them for {ROLE_LABEL[other.role]}.
          </p>
        )}

        <div className="grid2" style={{ marginTop: 12 }}>
          {ROLES.map((role) => {
            const t = totals.find((x) => x.role === role)
            const brief = briefs.find((b) => b.role === role)
            return (
              <section className="card" key={role}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 style={{ margin: 0 }}>{ROLE_LABEL[role]} rubric</h2>
                  {t ? (
                    <span>
                      <strong style={{ fontSize: 18 }}>{Number(t.total).toFixed(1)}</strong>
                      <span className="muted"> / 100 · line {line(role)} </span>
                      {t.above_line ? <span className="pill good">above</span> : <span className="pill">below</span>}
                    </span>
                  ) : (
                    <span className="muted">not scored</span>
                  )}
                </div>
                {t && (
                  <>
                    <table style={{ marginTop: 8 }}>
                      <tbody>
                        {[...(t.scores ?? [])]
                          .sort((a, b) => a.criteria.position - b.criteria.position)
                          .map((s) => (
                            <tr key={s.criteria.position}>
                              <td style={{ width: 34 }}><span className={`score s${s.score}`}>{s.score}</span></td>
                              <td>
                                <strong>{s.criteria.name}</strong> <span className="muted small">weight {s.criteria.weight}</span>
                                <div>{display(s.reason)}</div>
                                {s.gated && (
                                  <div className="small" style={{ color: 'var(--warn)' }}>
                                    Model gave {s.model_score}; capped to {s.score} because the PM bar for this criterion is not met.
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <p className="muted small">
                      Rubric v{t.rubrics.version} · {t.model} · {new Date(t.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </p>
                  </>
                )}
                <h3>Interview brief</h3>
                {brief ? <p>{display(brief.text)}</p> : <p className="muted">Only generated for the top {settings.top_n} in the {ROLE_LABEL[role]} ranking.</p>}
              </section>
            )
          })}
        </div>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>
            Email{' '}
            {(sent ?? draft) && <span className="pill">{(sent ?? draft)!.type === 'invite' ? 'interview invite' : 'rejection'}</span>}
          </h2>
          {sent ? (
            <>
              <p>
                {sent.status === 'sent' ? (
                  <span className="pill good">
                    Sent {sent.sent_at && new Date(sent.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} to {pii.email}
                  </span>
                ) : (
                  <span className="pill warn">Sending… (if this persists, check the Resend dashboard before doing anything)</span>
                )}{' '}
                {sent.resend_id && <span className="muted small">Resend id {sent.resend_id}</span>}
              </p>
              <p><strong>{sent.subject}</strong></p>
              <pre className="body">{sent.body}</pre>
              <button className="primary" disabled style={{ marginTop: 10 }}>Sent</button>
            </>
          ) : draft ? (
            <EmailEditor key={draft.id} candidateId={c.id} emailId={draft.id} subject={draft.subject} body={draft.body} to={pii.email} lastError={draft.last_error} />
          ) : (
            <p className="muted">No draft yet.</p>
          )}
        </section>

        <div className="grid2">
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Personal details</h2>
            <p className="muted small">Parsed from the CV and stored separately. Never sent to the AI. Correct anything parsing got wrong.</p>
            <PiiForm candidateId={c.id} pii={pii} />
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Redacted CV (exactly what the AI sees)</h2>
            <pre className="body small" style={{ maxHeight: 520, overflow: 'auto' }}>{c.redacted_cv_text}</pre>
          </section>
        </div>
      </main>
    </>
  )
}
