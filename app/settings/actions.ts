'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { q } from '@/lib/db'
import { syncAll } from '@/lib/pipeline'

export type SettingsState = { ok?: string; error?: string }

export async function saveSettings(_p: SettingsState, f: FormData): Promise<SettingsState> {
  await requireAuth()
  const num = (k: string) => Number(f.get(k))
  const text = (k: string) => String(f.get(k) ?? '').trim()
  const s = {
    pm_threshold: num('pm_threshold'),
    spm_threshold: num('spm_threshold'),
    top_n: num('top_n'),
    company_name: text('company_name'),
    sender_name: text('sender_name'),
    reply_to: text('reply_to'),
    signature: text('signature'),
    invite_next_step: text('invite_next_step'),
    jd_pm: text('jd_pm'),
    jd_spm: text('jd_spm'),
  }
  for (const k of ['pm_threshold', 'spm_threshold'] as const) {
    if (!Number.isFinite(s[k]) || s[k] < 0 || s[k] > 100) return { error: `${k} must be between 0 and 100.` }
  }
  if (!Number.isInteger(s.top_n) || s.top_n < 0 || s.top_n > 50) return { error: 'Top N must be a whole number from 0 to 50.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.reply_to)) return { error: 'Reply-to must be an email address.' }
  for (const [k, v] of Object.entries(s)) if (v === '') return { error: `${k} cannot be empty.` }

  try {
    await q(
      `update settings set pm_threshold = $1, spm_threshold = $2, top_n = $3, company_name = $4, sender_name = $5, reply_to = $6,
         signature = $7, invite_next_step = $8, jd_pm = $9, jd_spm = $10, updated_at = now() where id = 1`,
      [s.pm_threshold, s.spm_threshold, s.top_n, s.company_name, s.sender_name, s.reply_to, s.signature, s.invite_next_step, s.jd_pm, s.jd_spm],
    )
  } catch (e) {
    return { error: (e as Error).message }
  }
  // Thresholds and top N change who is above the line and who gets a brief.
  const r = await syncAll()
  revalidatePath('/', 'layout')
  return r.errors.length
    ? { error: `Saved, but some regenerations failed: ${r.errors.slice(0, 3).join(' | ')}` }
    : { ok: 'Saved. Lines, briefs and draft types are up to date (sent emails untouched).' }
}
