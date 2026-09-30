'use client'

import { useActionState } from 'react'
import { rescoreAction, saveDraftAction, savePiiAction, sendAction, type ActionState } from './actions'
import type { Pii } from '@/lib/types'

function Status({ s }: { s: ActionState }) {
  if (s.error) return <p className="note note-bad">{s.error}</p>
  if (s.ok) return <p className="note note-good">{s.ok}</p>
  return null
}

export function RescoreButton({ candidateId }: { candidateId: string }) {
  const [state, action, pending] = useActionState(rescoreAction, {})
  return (
    <form action={action} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <button className="btn" disabled={pending} title="Score again and rewrite the brief and draft. A sent email is never changed.">
        {pending && <span className="spinner" />}
        {pending ? 'Re-scoring' : 'Re-score'}
      </button>
      {state.error && <span className="mark mark-bad" title={state.error}>Failed</span>}
      {state.ok && !pending && <span className="mark mark-good">Updated</span>}
    </form>
  )
}

export function PiiForm({ candidateId, pii }: { candidateId: string; pii: Pii }) {
  const [state, action, pending] = useActionState(savePiiAction, {})
  const field = (k: keyof Pii, label: string, opts: { type?: string; hint?: string; span?: boolean } = {}) => (
    <div className={`field ${opts.span ? 'span-2' : ''}`}>
      <label htmlFor={k}>{label}</label>
      <input
        id={k}
        name={k}
        className="input"
        type={opts.type ?? 'text'}
        defaultValue={(k === 'other_urls' ? pii.other_urls.join(' ') : (pii[k] as string | null)) ?? ''}
      />
      {opts.hint && <span className="hint">{opts.hint}</span>}
    </div>
  )
  return (
    <form action={action} style={{ maxWidth: 780 }}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <div className="form-grid">
        {field('name', 'Full name', { span: true, hint: 'Every occurrence is replaced with [CANDIDATE] before the AI sees the CV.' })}
        {field('email', 'Email', { type: 'email', hint: 'The email is sent here.' })}
        {field('phone', 'Phone')}
        {field('linkedin_url', 'LinkedIn')}
        {field('github_url', 'GitHub')}
        {field('other_urls', 'Other personal links', { span: true, hint: 'Separate with spaces.' })}
        {field('address', 'Home address', { span: true })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending && <span className="spinner" />}
          {pending ? 'Saving' : 'Save details'}
        </button>
        <span className="hint">If the redacted text changes, the CV is scored again.</span>
      </div>
      {(state.ok || state.error) && <div style={{ marginTop: 14 }}><Status s={state} /></div>}
    </form>
  )
}

export function EmailEditor(props: {
  candidateId: string
  emailId: string
  subject: string
  body: string
  to: string | null
  from: string
  replyTo: string
  lastError: string | null
}) {
  const [saveState, saveAction, saving] = useActionState(saveDraftAction, {})
  const [sendState, send, sending] = useActionState(sendAction, {})
  const busy = saving || sending
  const notice = sendState.ok || sendState.error ? sendState : saveState
  const showLastError = props.lastError && !sendState.ok && !sendState.error && !saveState.ok
  return (
    <form className="letter">
      <input type="hidden" name="candidate_id" value={props.candidateId} />
      <input type="hidden" name="email_id" value={props.emailId} />
      <div className="letter-row">
        <span className="k">To</span>
        {props.to ?? <span style={{ color: 'var(--bad)' }}>No address on file. Add one under Personal details.</span>}
      </div>
      <div className="letter-row">
        <span className="k">From</span>
        <span className="faint">{props.from}, replies to {props.replyTo}</span>
      </div>
      <div className="letter-row">
        <label className="k" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" className="input" type="text" defaultValue={props.subject} required />
      </div>
      <div className="letter-body">
        <textarea id="body" name="body" className="textarea" aria-label="Email body" defaultValue={props.body} required />
      </div>
      {(showLastError || notice.ok || notice.error) && (
        <div className="letter-notice">
          {showLastError ? <p className="note note-bad">The last send failed: {props.lastError}</p> : <Status s={notice} />}
        </div>
      )}
      <div className="letter-foot">
        <span className="hint">Sending saves your edits first. One click sends exactly one email.</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-quiet" formAction={saveAction} disabled={busy}>
            {saving && <span className="spinner" />}
            {saving ? 'Saving' : 'Save draft'}
          </button>
          <button className="btn btn-primary" formAction={send} disabled={busy || !props.to || !!sendState.ok}>
            {sending && <span className="spinner" style={{ borderTopColor: 'var(--paper)' }} />}
            {sending ? 'Sending' : sendState.ok ? 'Sent' : 'Send email'}
          </button>
        </div>
      </div>
    </form>
  )
}
