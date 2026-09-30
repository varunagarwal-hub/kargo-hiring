'use client'

import { useActionState } from 'react'
import { login } from './actions'
import { Wordmark } from '@/app/nav'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {})
  return (
    <main className="login">
      <div className="login-box">
        <Wordmark />
        <hr className="login-rule" />
        <form action={action}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" autoFocus required autoComplete="current-password" />
          </div>
          {state.error && <p className="note note-bad" style={{ marginTop: 14 }}>{state.error}</p>}
          <button className="btn btn-primary" disabled={pending} style={{ width: '100%', marginTop: 20, height: 42 }}>
            {pending && <span className="spinner" style={{ borderTopColor: 'var(--paper)' }} />}
            {pending ? 'Signing in' : 'Sign in'}
          </button>
        </form>
        <p className="login-foot">For the Kargo founder only.</p>
      </div>
    </main>
  )
}
