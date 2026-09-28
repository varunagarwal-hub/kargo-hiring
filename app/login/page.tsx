'use client'

import { useActionState } from 'react'
import { login } from './actions'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {})
  return (
    <main style={{ maxWidth: 340, marginTop: 80 }}>
      <h1>Kargo Hiring</h1>
      <form action={action} className="card">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required />
        {state.error && <p className="error">{state.error}</p>}
        <p><button className="primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button></p>
      </form>
    </main>
  )
}
