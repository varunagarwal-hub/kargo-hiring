'use client'

import { useActionState } from 'react'
import { login } from './actions'
import { Brand } from '@/app/nav'
import { Icon } from '@/app/ui'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {})
  return (
    <main className="login">
      <div className="card login-card">
        <Brand />
        <h1>Sign in</h1>
        <p className="muted" style={{ marginTop: 4, marginBottom: 20 }}>Internal hiring dashboard</p>
        <form action={action}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" autoFocus required autoComplete="current-password" />
          </div>
          {state.error && (
            <div className="alert alert-bad" style={{ marginTop: 14 }}>
              <Icon name="alert" />
              {state.error}
            </div>
          )}
          <button className="btn btn-primary" disabled={pending} style={{ width: '100%', marginTop: 18, height: 40 }}>
            {pending && <span className="spinner" />}
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="login-foot"><Icon name="lock" size={13} />Access is limited to the Kargo founder</p>
      </div>
    </main>
  )
}
