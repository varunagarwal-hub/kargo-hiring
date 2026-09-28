import Link from 'next/link'
import { logout } from '@/app/login/actions'

export function Nav() {
  return (
    <header className="top">
      <strong>Kargo Hiring</strong>
      <Link href="/">Candidates</Link>
      <Link href="/settings">Settings</Link>
      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </header>
  )
}
