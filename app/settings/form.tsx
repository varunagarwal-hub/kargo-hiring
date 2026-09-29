'use client'

import { useActionState } from 'react'
import { saveSettings } from './actions'
import { Icon } from '@/app/ui'
import type { Settings } from '@/lib/types'

export function SettingsForm({ s, fromEmail }: { s: Settings; fromEmail: string }) {
  const [state, action, pending] = useActionState(saveSettings, {})
  return (
    <form action={action}>
      <section className="settings-section">
        <div>
          <h2>Decision lines</h2>
          <p>Candidates at or above the line for the role they applied for get an interview invite; below it, a warm rejection.</p>
        </div>
        <div className="card card-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pm_threshold">PM line</label>
              <input id="pm_threshold" name="pm_threshold" className="input" type="number" step="0.1" min={0} max={100} defaultValue={s.pm_threshold} />
              <span className="hint">Score out of 100</span>
            </div>
            <div className="field">
              <label htmlFor="spm_threshold">SPM line</label>
              <input id="spm_threshold" name="spm_threshold" className="input" type="number" step="0.1" min={0} max={100} defaultValue={s.spm_threshold} />
              <span className="hint">Score out of 100</span>
            </div>
            <div className="field span-2">
              <label htmlFor="top_n">Interview briefs per role</label>
              <input id="top_n" name="top_n" className="input" type="number" min={0} max={50} defaultValue={s.top_n} style={{ maxWidth: 160 }} />
              <span className="hint">The top N in each ranking get a three-sentence interview brief.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h2>Sender</h2>
          <p>How emails appear to candidates. The signature is added after the AI writes the draft, so it is never sent to the AI.</p>
        </div>
        <div className="card card-body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sender_name">Sender name</label>
              <input id="sender_name" name="sender_name" className="input" type="text" defaultValue={s.sender_name} />
            </div>
            <div className="field">
              <label htmlFor="reply_to">Reply-to address</label>
              <input id="reply_to" name="reply_to" className="input" type="email" defaultValue={s.reply_to} />
            </div>
            <div className="field">
              <label htmlFor="from">From address</label>
              <input id="from" className="input" type="text" value={fromEmail || 'Not set'} disabled />
              <span className="hint">Set with RESEND_FROM_EMAIL in Vercel.</span>
            </div>
            <div className="field">
              <label htmlFor="company_name">Company name</label>
              <input id="company_name" name="company_name" className="input" type="text" defaultValue={s.company_name} />
            </div>
            <div className="field span-2">
              <label htmlFor="signature">Signature</label>
              <textarea id="signature" name="signature" className="textarea" defaultValue={s.signature} style={{ minHeight: 90 }} />
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h2>Email and brief context</h2>
          <p>Used only to write emails and briefs. Scoring always comes from the rubric alone.</p>
        </div>
        <div className="card card-body">
          <div className="field">
            <label htmlFor="invite_next_step">Next step in interview invites</label>
            <textarea id="invite_next_step" name="invite_next_step" className="textarea" defaultValue={s.invite_next_step} style={{ minHeight: 70 }} />
          </div>
          <div className="field">
            <label htmlFor="jd_pm">Job description: Product Manager</label>
            <textarea id="jd_pm" name="jd_pm" className="textarea" defaultValue={s.jd_pm} style={{ minHeight: 140 }} />
          </div>
          <div className="field">
            <label htmlFor="jd_spm">Job description: Senior Product Manager</label>
            <textarea id="jd_spm" name="jd_spm" className="textarea" defaultValue={s.jd_spm} style={{ minHeight: 140 }} />
          </div>
        </div>
      </section>

      <div className="save-bar">
        {state.error && <div className="alert alert-bad"><Icon name="alert" />{state.error}</div>}
        {state.ok && <div className="alert alert-good"><Icon name="checkCircle" />{state.ok}</div>}
        {!state.ok && !state.error && <span className="hint">Changing a line or N updates decisions, briefs and unsent drafts. Sent emails never change.</span>}
        <button className="btn btn-primary" disabled={pending}>
          {pending && <span className="spinner" />}
          {pending ? 'Saving and updating…' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}
