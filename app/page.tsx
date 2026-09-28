import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { dashboard } from '@/lib/queries'
import { ROLE_LABEL, otherRole, type Role } from '@/lib/types'
import { Nav } from './nav'
import { UploadPanel } from './upload-panel'

export const dynamic = 'force-dynamic'

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ rank?: string }> }) {
  await requireAuth()
  const rankBy: Role = (await searchParams).rank === 'spm' ? 'spm' : 'pm'
  const { rows, settings } = await dashboard(rankBy)
  const line = rankBy === 'pm' ? settings.pm_threshold : settings.spm_threshold

  return (
    <>
      <Nav />
      <main>
        <UploadPanel />
        <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 12px' }}>
          <h1 style={{ margin: 0 }}>Candidates ({rows.length})</h1>
          <div className="row">
            <span className="muted small">
              Ranking by {ROLE_LABEL[rankBy]} · line {line} · briefs for top {settings.top_n}
            </span>
            <nav className="toggle row" style={{ gap: 0 }}>
              <Link href="/?rank=pm" className={rankBy === 'pm' ? 'on' : ''}>PM ranking</Link>
              <Link href="/?rank=spm" className={rankBy === 'spm' ? 'on' : ''}>SPM ranking</Link>
            </nav>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th className="num">Rank</th>
              <th>Name</th>
              <th>Applied</th>
              <th className="num">PM</th>
              <th className="num">SPM</th>
              <th>Line (applied role)</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">No candidates yet. Upload CVs above.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={r.rank === null ? 'dim' : ''}>
                <td className="num">{r.rank ?? '–'}</td>
                <td>
                  <Link href={`/candidates/${r.id}`}>{r.name || 'Unnamed (check details)'}</Link>
                  {r.rank !== null && r.rank <= settings.top_n && <> <span className="pill info">top {settings.top_n}</span></>}
                  {r.status === 'processing' && <> <span className="pill warn">scoring…</span></>}
                  {r.status === 'error' && <> <span className="pill bad" title={r.error_message ?? ''}>error</span></>}
                </td>
                <td>{ROLE_LABEL[r.role_applied]}</td>
                <td className="num" style={rankBy === 'pm' ? { fontWeight: 600 } : undefined}>{r.pm?.total.toFixed(1) ?? '–'}</td>
                <td className="num" style={rankBy === 'spm' ? { fontWeight: 600 } : undefined}>{r.spm?.total.toFixed(1) ?? '–'}</td>
                <td>
                  {r.appliedAbove === null ? '–' : r.appliedAbove ? <span className="pill good">above</span> : <span className="pill">below</span>}
                  {r.otherRoleFlag && (
                    <> <span className="pill warn" title="Scores above the line for the role they did not apply for">clears {ROLE_LABEL[otherRole(r.role_applied)]} line</span></>
                  )}
                </td>
                <td>
                  {!r.email ? '–' : r.email.status === 'sent' ? (
                    <span className="pill good" title={r.email.sent_at ?? ''}>sent {r.email.type}</span>
                  ) : (
                    <span className="pill">{r.email.status} {r.email.type}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  )
}
