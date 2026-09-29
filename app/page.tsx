import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { dashboard } from '@/lib/queries'
import { ROLE_LABEL, otherRole, type Role } from '@/lib/types'
import { Shell } from './nav'
import { Avatar, Icon, LinePill, PageHeader, Pill, ScoreBar, fmtShortDate } from './ui'
import { UploadPanel } from './upload-panel'

export const dynamic = 'force-dynamic'

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ rank?: string }> }) {
  await requireAuth()
  const rankBy: Role = (await searchParams).rank === 'spm' ? 'spm' : 'pm'
  const { rows, settings } = await dashboard(rankBy)
  const line = (r: Role) => (r === 'pm' ? settings.pm_threshold : settings.spm_threshold)

  const scored = rows.filter((r) => r.appliedAbove !== null)
  const above = scored.filter((r) => r.appliedAbove).length
  const crossFit = rows.filter((r) => r.otherRoleFlag).length
  const sent = rows.filter((r) => r.email?.status === 'sent').length
  const drafts = rows.filter((r) => r.email?.status === 'draft').length
  const attention = rows.filter((r) => r.status !== 'ready').length

  return (
    <Shell>
      <PageHeader
        title="Candidates"
        subtitle={`Every CV scored against the PM and SPM rubrics. Lines: PM ${settings.pm_threshold} · SPM ${settings.spm_threshold}.`}
      />

      <section className="tiles" aria-label="Summary">
        <div className="card tile">
          <div className="tile-label"><Icon name="users" size={15} />Candidates</div>
          <div className="tile-value">{rows.length}</div>
          <div className="tile-sub">{attention ? `${attention} processing or need attention` : 'All processed'}</div>
        </div>
        <div className="card tile">
          <div className="tile-label"><Icon name="arrowUp" size={15} />Above the line</div>
          <div className="tile-value">{above}</div>
          <div className="tile-sub">{scored.length ? `${Math.round((above / scored.length) * 100)}% of scored, for the role applied` : 'For the role applied'}</div>
        </div>
        <div className="card tile">
          <div className="tile-label"><Icon name="swap" size={15} />Fit the other role</div>
          <div className="tile-value">{crossFit}</div>
          <div className="tile-sub">Clear the line for the role they didn't apply for</div>
        </div>
        <div className="card tile">
          <div className="tile-label"><Icon name="mail" size={15} />Emails sent</div>
          <div className="tile-value">{sent}</div>
          <div className="tile-sub">{drafts} draft{drafts === 1 ? '' : 's'} ready to send</div>
        </div>
      </section>

      <div className="stack">
        <UploadPanel />

        <section className="card">
          <div className="card-head">
            <div>
              <h2>Ranking</h2>
              <p>
                Ranked by {ROLE_LABEL[rankBy]} score · the marker on each bar is that role&apos;s line · top {settings.top_n} per role get an interview brief
              </p>
            </div>
            <nav className="segmented" aria-label="Rank by">
              <Link href="/?rank=pm" className={rankBy === 'pm' ? 'on' : ''} aria-current={rankBy === 'pm' ? 'true' : undefined}>
                PM ranking
              </Link>
              <Link href="/?rank=spm" className={rankBy === 'spm' ? 'on' : ''} aria-current={rankBy === 'spm' ? 'true' : undefined}>
                SPM ranking
              </Link>
            </nav>
          </div>

          {rows.length === 0 ? (
            <div className="empty">
              <Icon name="file" size={36} />
              <strong>No candidates yet</strong>
              Upload CVs above. Each one is scored, briefed and drafted automatically.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Candidate</th>
                    <th>PM score</th>
                    <th>SPM score</th>
                    <th>Decision</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`rank ${r.rank !== null && r.rank <= settings.top_n ? 'top' : ''}`}>{r.rank ?? '–'}</td>
                      <td>
                        <div className="cand">
                          <Avatar name={r.name} size={34} />
                          <div>
                            <Link href={`/candidates/${r.id}`} className="row-link">
                              {r.name || 'Unnamed candidate'}
                            </Link>
                            <div className="cand-meta">
                              Applied {ROLE_LABEL[r.role_applied]} · {fmtShortDate(r.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><ScoreBar value={r.pm?.total ?? null} line={line('pm')} label="PM" /></td>
                      <td><ScoreBar value={r.spm?.total ?? null} line={line('spm')} label="SPM" /></td>
                      <td>
                        <div className="cell-pills">
                          {r.status === 'processing' && (
                            <Pill tone="info"><span className="spinner" style={{ width: 10, height: 10 }} />Scoring</Pill>
                          )}
                          {r.status === 'error' && <Pill tone="bad" icon="alert" title={r.error_message ?? ''}>Needs attention</Pill>}
                          {r.appliedAbove !== null && <LinePill above={r.appliedAbove} />}
                          {r.otherRoleFlag && (
                            <Pill tone="warn" icon="swap" title={`Scores above the ${ROLE_LABEL[otherRole(r.role_applied)]} line`}>
                              Fits {ROLE_LABEL[otherRole(r.role_applied)]}
                            </Pill>
                          )}
                        </div>
                      </td>
                      <td className="cell-nowrap">
                        {!r.email ? (
                          <span className="muted">–</span>
                        ) : r.email.status === 'sent' ? (
                          <Pill tone="good" icon="check">Sent</Pill>
                        ) : (
                          <Pill tone="neutral" icon="mail">{r.email.type === 'invite' ? 'Invite draft' : 'Rejection draft'}</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Shell>
  )
}
