'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/login/actions'
import { Icon, type IconName } from '@/app/ui'

const LINKS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Candidates', icon: 'users', match: (p) => p === '/' || p.startsWith('/candidates') },
  { href: '/settings', label: 'Settings', icon: 'settings', match: (p) => p.startsWith('/settings') },
]

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">K</span>
      <span className="brand-text">
        <strong>Kargo</strong>
        <span>Hiring</span>
      </span>
    </div>
  )
}

function Sidebar() {
  const path = usePathname()
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="sidebar-nav" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={l.match(path) ? 'active' : ''} aria-current={l.match(path) ? 'page' : undefined}>
            <Icon name={l.icon} size={17} />
            {l.label}
          </Link>
        ))}
      </nav>
      <form action={logout} className="sidebar-foot">
        <button type="submit" className="sidebar-logout">
          <Icon name="logout" size={17} />
          Log out
        </button>
      </form>
    </aside>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">{children}</main>
    </div>
  )
}
