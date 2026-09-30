'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/login/actions'

const LINKS = [
  { href: '/', label: 'Candidates', match: (p: string) => p === '/' || p.startsWith('/candidates') },
  { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
]

export function Wordmark() {
  return (
    <span className="wordmark">
      Kargo<span className="wordmark-sub">Hiring</span>
    </span>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <>
      <header className="masthead">
        <div className="masthead-in">
          <Link href="/" className="masthead-brand" aria-label="Kargo Hiring, candidates">
            <Wordmark />
          </Link>
          <nav className="masthead-nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={l.match(path) ? 'active' : ''} aria-current={l.match(path) ? 'page' : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="masthead-out">
            <button type="submit" className="textbtn">Log out</button>
          </form>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  )
}
