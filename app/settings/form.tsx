'use client'

import { useActionState } from 'react'
import { saveSettings } from './actions'
import type { Settings } from '@/lib/types'

export function SettingsForm({ s, fromEmail }: { s: Settings; fromEmail: string }) {
  const [state, action, pending] = useActionState(saveSettings, {})
  return (
    <form action={action}>
      <div className="grid2">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Scoring</h2>
          <label htmlFor="pm_threshold">PM line (0–100): at or above gets an interview invite</label>
          <input id="pm_threshold" name="pm_threshold" type="number" step="0.1" min={0} max={100} defaultValue={s.pm_threshold} />
          <label htmlFor="spm_threshold">SPM line (0–100)</label>
          <input id="spm_threshold" name="spm_threshold" type="number" step="0.1" min={0} max={100} defaultValue={s.spm_threshold} />
          <label htmlFor="top_n">Top N per role that get an interview brief</label>
          <input id="top_n" name="top_n" type="number" min={0} max={50} defaultValue={s.top_n} />
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Sender</h2>
          <label>From address (RESEND_FROM_EMAIL, set in Vercel)</label>
          <input type="text" value={fromEmail} disabled />
          <label htmlFor="sender_name">Sender name</label>
          <input id="sender_name" name="sender_name" type="text" defaultValue={s.sender_name} />
          <label htmlFor="reply_to">Reply-to address</label>
          <input id="reply_to" name="reply_to" type="email" defaultValue={s.reply_to} />
          <label htmlFor="signature">Signature (appended to every email; never sent to the AI)</label>
          <textarea id="signature" name="signature" defaultValue={s.signature} style={{ minHeight: 90 }} />
          <label htmlFor="company_name">Company name</label>
          <input id="company_name" name="company_name" type="text" defaultValue={s.company_name} />
        </section>
      </div>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Email and brief context (never used for scoring)</h2>
        <label htmlFor="invite_next_step">Next step included in interview invites</label>
        <textarea id="invite_next_step" name="invite_next_step" defaultValue={s.invite_next_step} style={{ minHeight: 70 }} />
        <label htmlFor="jd_pm">Job description: Product Manager</label>
        <textarea id="jd_pm" name="jd_pm" defaultValue={s.jd_pm} style={{ minHeight: 140 }} />
        <label htmlFor="jd_spm">Job description: Senior Product Manager</label>
        <textarea id="jd_spm" name="jd_spm" defaultValue={s.jd_spm} style={{ minHeight: 140 }} />
      </section>
      <p className="row">
        <button className="primary" disabled={pending}>{pending ? 'Saving and updating drafts…' : 'Save settings'}</button>
        <span className="muted small">Changing a line or top N updates above/below, briefs and unsent draft types.</span>
      </p>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="ok">{state.ok}</p>}
    </form>
  )
}
