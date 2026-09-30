import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { dashboard } from '@/lib/queries'
import { ROLE_LABEL, otherRole, type Role } from '@/lib/types'
import { Shell } from './nav'
import { LineMark, Mark, ScoreBar, fmtShortDate } from './ui'
import { UploadPanel } from './upload-panel'

export const dynamic = 'force-dynamic'

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ rank?: string }> }) {
  await requireAuth()
  const rankBy: Role = (await searchParams).rank === 'spm' ? 'spm' : 'pm'
  const { rows, settings } = await dashboard(rankBy)
  const line = (r: Role) => (r === 'pm' ? settings.pm_threshold : settings.spm_threshold)

  const above = rows.filter((r) => r.appliedAbove).length
  const crossFit = rows.filter((r) => r.otherRoleFlag).length
  const sent = rows.filter((r) => r.email?.status === 'sent').length
  const drafts = rows.filter((r) => r.email?.status === 'draft').length

  return (
    <Shell>
      <div className="head">
        <div>
          <h1>Candidates</h1>
          <p className="lede">
            Every CV is scored against both rubrics. The line is {settings.pm_threshold} for PM and {settings.spm_threshold} for SPM.
          </p>
        </div>
        <div className="summary" aria-label="Summary">
          <div><b>{rows.length}</b><span>on file</span></div>
          <div><b>{above}</b><span>above the line</span></div>
          <div><b>{crossFit}</b><span>fit the other role</span></div>
          <div><b>{sent}</b><span>emailed · {drafts} to send</span></div>
        </div>
      </div>

      <UploadPanel />

      <div className="section-title">
        <h2>Ranking</h2>
        <nav className="tabs" aria-label="Rank by">
          <Link href="/?rank=pm" className={rankBy === 'pm' ? 'on' : ''} aria-current={rankBy === 'pm' ? 'true' : undefined}>
            By PM score
          </Link>
          <Link href="/?rank=spm" className={rankBy === 'spm' ? 'on' : ''} aria-current={rankBy === 'spm' ? 'true' : undefined}>
            By SPM score
          </Link>
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="empty" style={{ borderTop: '1px solid var(--ink)' }}>
          <strong>Nothing on file yet</strong>
          Add CVs above; each one is scored, briefed and drafted automatically.
        </div>
      ) : (
        <div className="ledger-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>No.</th>
                <th>Candidate</th>
                <th>PM</th>
                <th>SPM</th>
                <th>Decision</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`rank ${r.rank === null ? 'dim' : ''}`}>{r.rank ?? '–'}</td>
                  <td>
                    <Link href={`/candidates/${r.id}`} className="who">{r.name || 'Unnamed candidate'}</Link>
                    {r.rank !== null && r.rank <= settings.top_n && <span className="brief-flag">brief</span>}
                    <div className="who-meta">{ROLE_LABEL[r.role_applied]} · {fmtShortDate(r.created_at)}</div>
                  </td>
                  <td><ScoreBar value={r.pm?.total ?? null} line={line('pm')} label="PM" /></td>
                  <td><ScoreBar value={r.spm?.total ?? null} line={line('spm')} label="SPM" /></td>
                  <td>
                    <div className="marks-stack">
                      {r.status === 'processing' && <Mark tone="accent">Scoring…</Mark>}
                      {r.status === 'error' && <Mark tone="bad" title={r.error_message ?? ''}>Needs attention</Mark>}
                      {r.appliedAbove !== null && <LineMark above={r.appliedAbove} />}
                      {r.otherRoleFlag && <Mark tone="accent">Fits {ROLE_LABEL[otherRole(r.role_applied)]} too</Mark>}
                    </div>
                  </td>
                  <td className="nowrap">
                    {!r.email ? (
                      <span className="faint">—</span>
                    ) : r.email.status === 'sent' ? (
                      <Mark tone="good">Sent</Mark>
                    ) : (
                      <span className="faint">{r.email.type === 'invite' ? 'Invite drafted' : 'Rejection drafted'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="faint" style={{ fontSize: 13, marginTop: 12 }}>
        The rust tick on each rule marks that role&apos;s line. The top {settings.top_n} in each ranking get an interview brief.
      </p>
    </Shell>
  )
}
