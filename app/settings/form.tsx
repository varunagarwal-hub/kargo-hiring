'use client'

import { useActionState } from 'react'
import { saveSettings } from './actions'
import type { Settings } from '@/lib/types'

export function SettingsForm({ s, fromEmail }: { s: Settings; fromEmail: string }) {
  const [state, action, pending] = useActionState(saveSettings, {})
  return (
    <form action={action}>
      <section className="settings-row">
        <div>
          <h2>The line</h2>
          <p>At or above the line for the role they applied for, a candidate is invited to interview. Below it, they get a considerate no.</p>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pm_threshold">Product Manager</label>
            <input id="pm_threshold" name="pm_threshold" className="input" type="number" step="0.1" min={0} max={100} defaultValue={s.pm_threshold} />
            <span className="hint">Out of 100</span>
          </div>
          <div className="field">
            <label htmlFor="spm_threshold">Senior Product Manager</label>
            <input id="spm_threshold" name="spm_threshold" className="input" type="number" step="0.1" min={0} max={100} defaultValue={s.spm_threshold} />
            <span className="hint">Out of 100</span>
          </div>
          <div className="field span-2">
            <label htmlFor="top_n">Interview briefs per ranking</label>
            <input id="top_n" name="top_n" className="input" type="number" min={0} max={50} defaultValue={s.top_n} style={{ maxWidth: 140 }} />
            <span className="hint">The top few in each ranking get a three-sentence brief for the interview.</span>
          </div>
        </div>
      </section>

      <section className="settings-row">
        <div>
          <h2>Sender</h2>
          <p>How the emails are signed. The signature is added after the draft is written, so the AI never sees it.</p>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sender_name">Sender name</label>
            <input id="sender_name" name="sender_name" className="input" type="text" defaultValue={s.sender_name} />
          </div>
          <div className="field">
            <label htmlFor="reply_to">Replies go to</label>
            <input id="reply_to" name="reply_to" className="input" type="email" defaultValue={s.reply_to} />
          </div>
          <div className="field">
            <label htmlFor="from">Sent from</label>
            <input id="from" className="input" type="text" value={fromEmail || 'Not set'} disabled />
            <span className="hint">Set as RESEND_FROM_EMAIL in Vercel.</span>
          </div>
          <div className="field">
            <label htmlFor="company_name">Company</label>
            <input id="company_name" name="company_name" className="input" type="text" defaultValue={s.company_name} />
          </div>
          <div className="field span-2">
            <label htmlFor="signature">Signature</label>
            <textarea id="signature" name="signature" className="textarea" defaultValue={s.signature} style={{ minHeight: 96 }} />
          </div>
        </div>
      </section>

      <section className="settings-row">
        <div>
          <h2>Context for writing</h2>
          <p>Used only when writing emails and briefs. Scores always come from the rubric alone.</p>
        </div>
        <div>
          <div className="field">
            <label htmlFor="invite_next_step">Next step, in every invitation</label>
            <textarea id="invite_next_step" name="invite_next_step" className="textarea" defaultValue={s.invite_next_step} style={{ minHeight: 76 }} />
          </div>
          <div className="field">
            <label htmlFor="jd_pm">Job description, Product Manager</label>
            <textarea id="jd_pm" name="jd_pm" className="textarea" defaultValue={s.jd_pm} style={{ minHeight: 150 }} />
          </div>
          <div className="field">
            <label htmlFor="jd_spm">Job description, Senior Product Manager</label>
            <textarea id="jd_spm" name="jd_spm" className="textarea" defaultValue={s.jd_spm} style={{ minHeight: 150 }} />
          </div>
        </div>
      </section>

      <div className="save-bar">
        {state.error && <p className="note note-bad">{state.error}</p>}
        {state.ok && <p className="note note-good">{state.ok}</p>}
        {!state.ok && !state.error && <span className="hint">Moving the line or the brief count updates decisions, briefs and unsent drafts. Sent emails never change.</span>}
        <button className="btn btn-primary" disabled={pending}>
          {pending && <span className="spinner" style={{ borderTopColor: 'var(--paper)' }} />}
          {pending ? 'Saving' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}
