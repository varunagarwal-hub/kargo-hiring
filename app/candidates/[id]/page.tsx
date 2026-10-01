import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { loadSettings, one, q } from '@/lib/db'
import { NAME_TOKEN } from '@/lib/pii/redact'
import { ROLES, ROLE_LABEL, otherRole, type Pii, type Role } from '@/lib/types'
import { Shell } from '@/app/nav'
import { Icon, LineMark, ScoreBar, ScoreMarks, fmtDate, fmtDateTime } from '@/app/ui'
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
    one<Pii & { name_status: string }>(`select name, email, phone, linkedin_url, github_url, other_urls, address, name_status from candidate_pii where candidate_id = $1`, [id]),
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
  const pii = piiRow ?? { name: null, email: null, phone: null, linkedin_url: null, github_url: null, other_urls: [], address: null, name_status: 'unconfirmed' }
  const needsName = c.status === 'error' && pii.name_status === 'unconfirmed'
  const sent = emails.find((e) => e.status !== 'draft')
  const draft = emails.find((e) => e.status === 'draft')
  const email = sent ?? draft
  const line = (r: Role) => (r === 'pm' ? settings.pm_threshold : settings.spm_threshold)
  const display = (t: string) => t.replaceAll(NAME_TOKEN, pii.name?.split(/\s+/)[0] || 'the candidate')
  const other = totals.find((t) => t.role === otherRole(c.role_applied))
  const from = `${settings.sender_name} <${process.env.RESEND_FROM_EMAIL || 'not set'}>`

  return (
    <Shell>
      <Link href="/" className="crumb"><Icon name="arrowLeft" size={13} />All candidates</Link>

      <header className="dossier-head">
        <div>
          <h1>{pii.name || 'Unnamed candidate'}</h1>
          <div className="dossier-meta">
            <span>Applied for {ROLE_TITLE[c.role_applied]}</span>
            <span>Received {fmtDate(c.created_at)}</span>
            {pii.email && <span>{pii.email}</span>}
          </div>
        </div>
        <div className="dossier-actions">
          {c.cv_file_name && (
            <a className="btn btn-quiet" href={`/api/cv/${c.id}`} target="_blank" rel="noreferrer">
              <Icon name="file" />Original CV
            </a>
          )}
          <RescoreButton candidateId={c.id} />
        </div>
      </header>

      {(c.status !== 'ready' || other?.above_line) && (
        <div className="notes">
          {c.status === 'processing' && (
            <p className="note note-accent"><span className="spinner" style={{ marginRight: 8, verticalAlign: -1 }} />Scoring in progress. Refresh in a minute.</p>
          )}
          {c.status === 'error' && (
            <p className="note note-bad">{needsName || !pii.name ? <strong>Waiting for you to confirm the name.</strong> : <strong>Processing failed.</strong>} {c.error_message}</p>
          )}
          {other?.above_line && (
            <p className="note note-accent">
              <strong>Also clears the {ROLE_LABEL[other.role]} line</strong> ({Number(other.total).toFixed(1)} against {line(other.role)}). Worth considering for {ROLE_TITLE[other.role]}.
            </p>
          )}
        </div>
      )}

      <div className="columns">
        {ROLES.map((role) => {
          const t = totals.find((x) => x.role === role)
          const brief = briefs.find((b) => b.role === role)
          return (
            <section className="column" key={role}>
              <div className="column-head">
                <h2>{ROLE_TITLE[role]}</h2>
                <span className="kicker">{role === c.role_applied ? 'Applied' : 'Cross-check'}</span>
              </div>
              {t ? (
                <>
                  <div className="total">
                    <b>{Number(t.total).toFixed(1)}</b>
                    <span>of 100 · line {line(role)}</span>
                  </div>
                  <div className="total-rule"><ScoreBar value={Number(t.total)} line={line(role)} label={ROLE_LABEL[role]} showValue={false} /></div>
                  <div style={{ marginTop: 12 }}><LineMark above={t.above_line} /></div>

                  <ol className="criteria">
                    {[...(t.scores ?? [])]
                      .sort((a, b) => a.criteria.position - b.criteria.position)
                      .map((s) => (
                        <li key={s.criteria.position}>
                          <div className="criteria-head">
                            <span className="name">{s.criteria.name}</span>
                            <ScoreMarks score={s.score} />
                            <span className="weight">weight {s.criteria.weight}</span>
                          </div>
                          <p className="reason">{display(s.reason)}</p>
                          {s.gated && (
                            <p className="gated">The model gave {s.model_score}; held to {s.score} because the PM bar for this criterion isn&apos;t met.</p>
                          )}
                        </li>
                      ))}
                  </ol>

                  {brief ? (
                    <blockquote className="brief" style={{ marginLeft: 0, marginRight: 0 }}>
                      <span className="kicker">Interview brief</span>
                      <p>{display(brief.text)}</p>
                    </blockquote>
                  ) : (
                    <p className="brief-none">Briefs are written for the top {settings.top_n} in the {ROLE_LABEL[role]} ranking.</p>
                  )}
                  <p className="stamp">Rubric v{t.rubrics.version} · scored {fmtDateTime(t.created_at)} · {t.model}</p>
                </>
              ) : (
                <p className="faint" style={{ marginTop: 16 }}>Not scored yet.</p>
              )}
            </section>
          )
        })}
      </div>

      <div className="section-title">
        <h2>{email ? (email.type === 'invite' ? 'Invitation to interview' : 'Rejection') : 'Email'}</h2>
        <p>{sent ? 'Sent. It can no longer be edited.' : 'Drafted from the CV. Edit freely before sending; scores are never mentioned.'}</p>
      </div>

      {sent ? (
        <div className="letter">
          <div className="letter-row"><span className="k">To</span><span>{pii.email}</span></div>
          <div className="letter-row"><span className="k">Subject</span><strong style={{ fontWeight: 500 }}>{sent.subject}</strong></div>
          <pre className="letter-sent">{sent.body}</pre>
          <div className="letter-foot">
            <span className="hint">
              {sent.status === 'sending'
                ? 'Still marked as sending. Check the Resend dashboard before doing anything else.'
                : `Resend reference ${sent.resend_id ?? '—'}`}
            </span>
            {sent.status === 'sent' ? (
              <span className="sent-stamp">Sent {sent.sent_at && fmtDateTime(sent.sent_at)}</span>
            ) : (
              <span className="kicker">Sending</span>
            )}
          </div>
        </div>
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
        <p className="faint">No draft yet. It&apos;s written once scoring finishes.</p>
      )}

      <div style={{ marginTop: 48 }}>
        <details className="fold" open={needsName || !pii.name}>
          <summary>
            <h2>Personal details</h2>
            <span className="faint">Kept apart from the CV text and never sent to the AI</span>
          </summary>
          <div className="fold-body">
            <PiiForm candidateId={c.id} pii={pii} />
          </div>
        </details>
        <details className="fold">
          <summary>
            <h2>Redacted CV</h2>
            <span className="faint">Exactly what the AI reads</span>
          </summary>
          <div className="fold-body">
            <pre className="cv">{c.redacted_cv_text}</pre>
          </div>
        </details>
      </div>
    </Shell>
  )
}
