'use client'

import { useActionState } from 'react'
import { rescoreAction, saveDraftAction, savePiiAction, sendAction, type ActionState } from './actions'
import { Icon } from '@/app/ui'
import type { Pii } from '@/lib/types'

function Status({ s }: { s: ActionState }) {
  if (s.error) return <div className="alert alert-bad"><Icon name="alert" />{s.error}</div>
  if (s.ok) return <div className="alert alert-good"><Icon name="checkCircle" />{s.ok}</div>
  return null
}

export function RescoreButton({ candidateId }: { candidateId: string }) {
  const [state, action, pending] = useActionState(rescoreAction, {})
  return (
    <form action={action} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <button className="btn" disabled={pending} title="Score again and regenerate the brief and draft. Sent emails are never changed.">
        {pending ? <span className="spinner" /> : <Icon name="refresh" />}
        {pending ? 'Re-scoring…' : 'Re-score'}
      </button>
      {state.error && <span className="pill pill-bad" title={state.error}><Icon name="alert" size={12} />Failed</span>}
      {state.ok && !pending && <span className="pill pill-good"><Icon name="check" size={12} />Updated</span>}
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
    <form action={action}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <div className="form-grid">
        {field('name', 'Full name', { span: true, hint: 'Every occurrence is replaced with [CANDIDATE] before any AI call.' })}
        {field('email', 'Email', { type: 'email', hint: 'Emails are sent to this address.' })}
        {field('phone', 'Phone')}
        {field('linkedin_url', 'LinkedIn URL')}
        {field('github_url', 'GitHub URL')}
        {field('other_urls', 'Other personal URLs', { span: true, hint: 'Separate with spaces.' })}
        {field('address', 'Home address', { span: true })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending && <span className="spinner" />}
          {pending ? 'Saving…' : 'Save details'}
        </button>
        <span className="hint">If the redacted text changes, the CV is re-scored automatically.</span>
      </div>
      {(state.ok || state.error) && <div style={{ marginTop: 12 }}><Status s={state} /></div>}
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
  return (
    <form>
      <input type="hidden" name="candidate_id" value={props.candidateId} />
      <input type="hidden" name="email_id" value={props.emailId} />
      <div className="composer-row">
        <span className="k">To</span>
        {props.to ?? <span style={{ color: 'var(--bad)' }}>No email address. Add one under Personal details.</span>}
      </div>
      <div className="composer-row">
        <span className="k">From</span>
        <span className="muted">{props.from} · replies to {props.replyTo}</span>
      </div>
      <div className="composer-row">
        <label className="k" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" className="input" type="text" defaultValue={props.subject} required />
      </div>
      <div className="composer-body">
        <textarea id="body" name="body" className="textarea" aria-label="Email body" defaultValue={props.body} required />
      </div>
      {(props.lastError && !sendState.ok && !sendState.error) || notice.ok || notice.error ? (
        <div style={{ padding: '0 18px 14px' }}>
          {props.lastError && !sendState.ok && !sendState.error && !saveState.ok ? (
            <div className="alert alert-bad"><Icon name="alert" />Last send attempt failed: {props.lastError}</div>
          ) : (
            <Status s={notice} />
          )}
        </div>
      ) : null}
      <div className="card-foot">
        <span className="hint">Sending saves your edits first. One click sends exactly one email.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" formAction={saveAction} disabled={busy}>
            {saving && <span className="spinner" />}
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button className="btn btn-primary" formAction={send} disabled={busy || !props.to || !!sendState.ok}>
            {sending ? <span className="spinner" /> : <Icon name="send" />}
            {sending ? 'Sending…' : sendState.ok ? 'Sent' : 'Send email'}
          </button>
        </div>
      </div>
    </form>
  )
}
