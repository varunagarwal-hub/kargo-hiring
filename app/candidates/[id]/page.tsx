import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loadSettings, one, q } from '@/lib/db'
import { NAME_TOKEN } from '@/lib/pii/redact'
import { ROLES, ROLE_LABEL, otherRole, type Pii, type Role } from '@/lib/types'
import { Shell } from '@/app/nav'
import { Avatar, Icon, LinePill, Pill, ScoreBar, ScoreDots, fmtDate, fmtDateTime } from '@/app/ui'
import { EmailEditor, PiiForm, RescoreButton } from './forms'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // re-score runs the whole pipeline

type ScoreRow = { score: number; model_score: number; gated: boolean; reason: string; criteria: { position: number; name: string; weight: number } }
type TotalRow = { id: string; role: Role; total: number; above_line: boolean; model: string; created_at: string; rubrics: { version: number }; scores: ScoreRow[] }
type EmailRow = { id: string; type: string; subject: string; body: string; status: string; sent_at: string | null; resend_id: string | null; last_error: string | null }

const ROLE_TITLE: Record<Role, string> = { pm: 'Product Manager', spm: 'Senior Product Manager' }

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
  const email = sent ?? draft
  const line = (r: Role) => (r === 'pm' ? settings.pm_threshold : settings.spm_threshold)
  const display = (t: string) => t.replaceAll(NAME_TOKEN, pii.name?.split(/\s+/)[0] || 'the candidate')
  const other = totals.find((t) => t.role === otherRole(c.role_applied))
  const from = `${settings.sender_name} <${process.env.RESEND_FROM_EMAIL || 'not set'}>`

  return (
    <Shell>
      <div className="crumbs">
        <Link href="/"><Icon name="arrowLeft" size={14} />Candidates</Link>
      </div>

      <section className="card profile" style={{ marginBottom: 20 }}>
        <Avatar name={pii.name} size={52} />
        <div>
          <h1>{pii.name || 'Unnamed candidate'}</h1>
          <div className="profile-meta">
            <span><Icon name="file" size={14} />Applied for {ROLE_TITLE[c.role_applied]}</span>
            <span><Icon name="clock" size={14} />Added {fmtDate(c.created_at)}</span>
            {pii.email && <span><Icon name="mail" size={14} />{pii.email}</span>}
          </div>
        </div>
        <div className="profile-actions">
          {c.cv_file_name && (
            <a className="btn" href={`/api/cv/${c.id}`} target="_blank" rel="noreferrer">
              <Icon name="file" />Original CV
            </a>
          )}
          <RescoreButton candidateId={c.id} />
        </div>
      </section>

      {(c.status !== 'ready' || other?.above_line) && (
        <div className="alerts">
          {c.status === 'processing' && (
            <div className="alert alert-info"><span className="spinner" />Scoring in progress. Refresh in a minute.</div>
          )}
          {c.status === 'error' && (
            <div className="alert alert-bad">
              <Icon name="alert" />
              <div><strong>Processing failed.</strong> {c.error_message} Fix the personal details below if needed, then re-score.</div>
            </div>
          )}
          {other?.above_line && (
            <div className="alert alert-warn">
              <Icon name="swap" />
              <div>
                Also clears the <strong>{ROLE_LABEL[other.role]}</strong> line ({Number(other.total).toFixed(1)} ≥ {line(other.role)}). Consider them for{' '}
                {ROLE_TITLE[other.role]}.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="stack">
        <div className="grid-2">
          {ROLES.map((role) => {
            const t = totals.find((x) => x.role === role)
            const brief = briefs.find((b) => b.role === role)
            return (
              <section className="card" key={role}>
                <div className="card-head">
                  <div>
                    <h2>{ROLE_TITLE[role]}</h2>
                    <p>{role === c.role_applied ? 'Role applied for' : 'Cross-check'}{t ? ` · rubric v${t.rubrics.version}` : ''}</p>
                  </div>
                  {t && <LinePill above={t.above_line} line={line(role)} />}
                </div>
                {t ? (
                  <>
                    <div className="card-body" style={{ paddingBottom: 14 }}>
                      <div className="total">
                        <span className="total-value">{Number(t.total).toFixed(1)}</span>
                        <span className="total-of">/ 100</span>
                      </div>
                      <div className="total-bar">
                        <ScoreBar value={Number(t.total)} line={line(role)} label={ROLE_LABEL[role]} />
                      </div>
                    </div>
                    <ul className="criteria">
                      {[...(t.scores ?? [])]
                        .sort((a, b) => a.criteria.position - b.criteria.position)
                        .map((s) => (
                          <li key={s.criteria.position}>
                            <div className="criteria-head">
                              <ScoreDots score={s.score} />
                              <span className="name">{s.criteria.name}</span>
                              <span className="weight">Weight {s.criteria.weight}</span>
                            </div>
                            <p className="reason">{display(s.reason)}</p>
                            {s.gated && (
                              <p className="gated">
                                <Icon name="info" size={13} />
                                Model gave {s.model_score}; capped at {s.score} because the PM bar for this criterion isn&apos;t met.
                              </p>
                            )}
                          </li>
                        ))}
                    </ul>
                    {brief ? (
                      <div className="brief">
                        <div className="brief-title"><Icon name="sparkle" size={13} />Interview brief</div>
                        <p>{display(brief.text)}</p>
                      </div>
                    ) : (
                      <p className="brief-empty">
                        Interview briefs are written for the top {settings.top_n} in the {ROLE_LABEL[role]} ranking.
                      </p>
                    )}
                    <p className="card-meta">Scored {fmtDateTime(t.created_at)} · {t.model}</p>
                  </>
                ) : (
                  <div className="empty">Not scored yet.</div>
                )}
              </section>
            )
          })}
        </div>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>{email ? (email.type === 'invite' ? 'Interview invitation' : 'Rejection email') : 'Email'}</h2>
              <p>
                {sent
                  ? 'This email has been sent and can no longer be edited.'
                  : 'Written from the CV. Review and edit, then send. Scores are never mentioned.'}
              </p>
            </div>
            {sent?.status === 'sent' && <Pill tone="good" icon="check">Sent {sent.sent_at && fmtDateTime(sent.sent_at)}</Pill>}
            {sent?.status === 'sending' && <Pill tone="warn" icon="clock">Sending</Pill>}
            {!sent && draft && <Pill tone="neutral" icon="mail">Draft</Pill>}
          </div>
          {sent ? (
            <>
              <div className="composer-row"><span className="k">To</span>{pii.email}</div>
              <div className="composer-row"><span className="k">Subject</span><strong>{sent.subject}</strong></div>
              <pre className="sent-body">{sent.body}</pre>
              <div className="card-foot">
                <span className="muted small">
                  {sent.status === 'sending'
                    ? 'If this stays in "Sending", check the Resend dashboard before doing anything else.'
                    : `Resend id ${sent.resend_id ?? '–'}`}
                </span>
                <button className="btn btn-primary" disabled><Icon name="check" />Sent</button>
              </div>
            </>
          ) : draft ? (
            <EmailEditor
              key={draft.id}
              candidateId={c.id}
              emailId={draft.id}
              subject={draft.subject}
              body={draft.body}
              to={pii.email}
              from={from}
              replyTo={settings.reply_to}
              lastError={draft.last_error}
            />
          ) : (
            <div className="empty">No draft yet. It&apos;s written once scoring finishes.</div>
          )}
        </section>

        <div className="grid-2">
          <details className="card">
            <summary className="card-head">
              <div>
                <h2>Personal details</h2>
                <p>Stored separately and never sent to the AI.</p>
              </div>
              <Icon name="chevron" className="chev" />
            </summary>
            <div className="card-body">
              <PiiForm candidateId={c.id} pii={pii} />
            </div>
          </details>
          <details className="card">
            <summary className="card-head">
              <div>
                <h2>Redacted CV</h2>
                <p>Exactly the text the AI sees.</p>
              </div>
              <Icon name="chevron" className="chev" />
            </summary>
            <pre className="cv">{c.redacted_cv_text}</pre>
          </details>
        </div>
      </div>
    </Shell>
  )
}
