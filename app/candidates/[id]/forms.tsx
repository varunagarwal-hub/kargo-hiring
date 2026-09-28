'use client'

import { useActionState } from 'react'
import { rescoreAction, saveDraftAction, savePiiAction, sendAction, type ActionState } from './actions'
import type { Pii } from '@/lib/types'

function Status({ s }: { s: ActionState }) {
  if (s.error) return <p className="error">{s.error}</p>
  if (s.ok) return <p className="ok">{s.ok}</p>
  return null
}

export function RescoreButton({ candidateId }: { candidateId: string }) {
  const [state, action, pending] = useActionState(rescoreAction, {})
  return (
    <form action={action}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <button disabled={pending}>{pending ? 'Re-scoring… (up to a minute)' : 'Re-score'}</button>
      <Status s={state} />
    </form>
  )
}

export function PiiForm({ candidateId, pii }: { candidateId: string; pii: Pii }) {
  const [state, action, pending] = useActionState(savePiiAction, {})
  const field = (k: keyof Pii, label: string, type = 'text') => (
    <>
      <label htmlFor={k}>{label}</label>
      <input id={k} name={k} type={type} defaultValue={(k === 'other_urls' ? pii.other_urls.join(' ') : (pii[k] as string | null)) ?? ''} />
    </>
  )
  return (
    <form action={action}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      {field('name', 'Name (replaced with [CANDIDATE] before any AI call)')}
      {field('email', 'Email (the send-to address)', 'email')}
      {field('phone', 'Phone')}
      {field('linkedin_url', 'LinkedIn URL')}
      {field('github_url', 'GitHub URL')}
      {field('other_urls', 'Other personal URLs (space-separated)')}
      {field('address', 'Home address')}
      <p className="row">
        <button disabled={pending}>{pending ? 'Saving…' : 'Save details'}</button>
        <span className="muted small">If the redacted text changes, the CV is re-scored automatically.</span>
      </p>
      <Status s={state} />
    </form>
  )
}

export function EmailEditor(props: { candidateId: string; emailId: string; subject: string; body: string; to: string | null; lastError: string | null }) {
  const [saveState, saveAction, saving] = useActionState(saveDraftAction, {})
  const [sendState, send, sending] = useActionState(sendAction, {})
  const busy = saving || sending
  return (
    <form>
      <input type="hidden" name="candidate_id" value={props.candidateId} />
      <input type="hidden" name="email_id" value={props.emailId} />
      <label htmlFor="subject">Subject</label>
      <input id="subject" name="subject" type="text" defaultValue={props.subject} required />
      <label htmlFor="body">Body</label>
      <textarea id="body" name="body" defaultValue={props.body} required />
      <p className="row">
        <button formAction={saveAction} disabled={busy}>{saving ? 'Saving…' : 'Save draft'}</button>
        <button className="primary" formAction={send} disabled={busy || !props.to || !!sendState.ok}>
          {sending ? 'Sending…' : 'Send'}
        </button>
        <span className="muted small">{props.to ? `To: ${props.to}` : 'No email address. Add one under Personal details.'}</span>
      </p>
      {props.lastError && !sendState.ok && !sendState.error && <p className="error">Last send attempt failed: {props.lastError}</p>}
      <Status s={saveState} />
      <Status s={sendState} />
    </form>
  )
}
