import 'server-only'
import { loadSettings, q } from '@/lib/db'
import type { Role } from '@/lib/types'

export type DashboardRow = {
  id: string
  name: string | null
  role_applied: Role
  status: 'processing' | 'ready' | 'error'
  error_message: string | null
  created_at: string
  pm: { total: number; above_line: boolean } | null
  spm: { total: number; above_line: boolean } | null
  email: { status: string; type: string; sent_at: string | null } | null
  rank: number | null
  appliedAbove: boolean | null
  otherRoleFlag: boolean
  /** Highest role whose line they clear (SPM requires PM), or null. */
  bestFit: Role | null
}

export async function dashboard(rankBy: Role) {
  const [cands, pii, tot, mail, settings] = await Promise.all([
    q<Omit<DashboardRow, 'name' | 'pm' | 'spm' | 'email' | 'rank' | 'appliedAbove' | 'otherRoleFlag' | 'bestFit'>>(
      `select id, role_applied, status, error_message, created_at from candidates`,
    ),
    q<{ candidate_id: string; name: string | null }>(`select candidate_id, name from candidate_pii`),
    q<{ candidate_id: string; role: Role; total: number; above_line: boolean }>(
      `select candidate_id, role, total, above_line from totals where is_current`,
    ),
    q<{ candidate_id: string; status: string; type: string; sent_at: string | null }>(`select candidate_id, status, type, sent_at from emails`),
    loadSettings(),
  ])
  const names = new Map(pii.map((p) => [p.candidate_id, p.name]))

  const rows: DashboardRow[] = cands.map((c) => {
    const t = (role: Role) => {
      const r = tot.find((x) => x.candidate_id === c.id && x.role === role)
      return r ? { total: Number(r.total), above_line: r.above_line } : null
    }
    // Prefer the sent email over a draft when showing status.
    const e = mail.filter((m) => m.candidate_id === c.id).sort((a, b) => (a.status === 'sent' ? -1 : b.status === 'sent' ? 1 : 0))[0] ?? null
    const pm = t('pm')
    const spm = t('spm')
    const applied = c.role_applied === 'pm' ? pm : spm
    // SPM above the line already implies PM above the line (enforced in the database).
    const bestFit: Role | null = spm?.above_line ? 'spm' : pm?.above_line ? 'pm' : null
    return {
      ...c,
      name: names.get(c.id) ?? null,
      pm,
      spm,
      email: e,
      rank: null,
      appliedAbove: applied ? applied.above_line : null,
      bestFit,
      // Worth a look for the other role: a PM applicant who clears SPM, or an SPM applicant who only clears PM.
      otherRoleFlag: bestFit !== null && bestFit !== c.role_applied,
    }
  })

  const ranked = rows
    .filter((r) => r.status === 'ready' && r[rankBy])
    .sort((a, b) => b[rankBy]!.total - a[rankBy]!.total || a.created_at.localeCompare(b.created_at))
  ranked.forEach((r, i) => (r.rank = i + 1))
  const unranked = rows.filter((r) => r.rank === null).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { rows: [...ranked, ...unranked], settings }
}
