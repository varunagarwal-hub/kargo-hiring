import { requireAuth } from '@/lib/auth'
import { loadSettings, q } from '@/lib/db'
import { Shell } from '@/app/nav'
import { PageHeader, Pill } from '@/app/ui'
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
      <PageHeader
        title="Settings"
        subtitle="Decision lines, interview briefs and how emails are sent."
        actions={rubrics.map((r) => (
          <Pill key={r.role} tone="info">{r.role.toUpperCase()} rubric v{r.version}</Pill>
        ))}
      />
      <SettingsForm s={s} fromEmail={process.env.RESEND_FROM_EMAIL || ''} />
    </Shell>
  )
}
