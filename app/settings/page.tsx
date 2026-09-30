import { requireAuth } from '@/lib/auth'
import { loadSettings, q } from '@/lib/db'
import { Shell } from '@/app/nav'
import { SettingsForm } from './form'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // saving may regenerate briefs and drafts

export default async function SettingsPage() {
  await requireAuth()
  const [s, rubrics] = await Promise.all([
    loadSettings(),
    q<{ role: string; version: number }>(`select role, version from rubrics where active order by role`),
  ])
  return (
    <Shell>
      <div className="head" style={{ borderBottom: 0, marginBottom: 8 }}>
        <div>
          <h1>Settings</h1>
          <p className="lede">Where the line sits, who gets a brief, and how emails go out.</p>
        </div>
        <p className="kicker">{rubrics.map((r) => `${r.role} rubric v${r.version}`).join(' · ')}</p>
      </div>
      <SettingsForm s={s} fromEmail={process.env.RESEND_FROM_EMAIL || ''} />
    </Shell>
  )
}
