import { requireAuth } from '@/lib/auth'
import { loadSettings, q } from '@/lib/db'
import { Nav } from '@/app/nav'
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
    <>
      <Nav />
      <main>
        <h1>Settings</h1>
        <p className="muted small">
          Active rubrics:{' '}
          {rubrics.map((r) => `${r.role.toUpperCase()} v${r.version}`).join(', ')}.
          To change the rubric itself, see README → “Changing the rubric”.
        </p>
        <SettingsForm s={s} fromEmail={process.env.RESEND_FROM_EMAIL || '(not set)'} />
      </main>
    </>
  )
}
