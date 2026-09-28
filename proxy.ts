import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifyToken } from '@/lib/session'

export async function proxy(req: NextRequest) {
  const ok = await verifyToken(process.env.SESSION_SECRET, req.cookies.get(SESSION_COOKIE)?.value)
  if (ok) return NextResponse.next()
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
}
