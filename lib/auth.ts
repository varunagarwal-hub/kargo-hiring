import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { SESSION_COOKIE, verifyToken } from '@/lib/session'

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies()
  return verifyToken(process.env.SESSION_SECRET, jar.get(SESSION_COOKIE)?.value)
}

/** Call at the top of every server action and route handler (proxy.ts is only an optimistic check). */
export async function requireAuth(): Promise<void> {
  env.sessionSecret()
  if (!(await isAuthed())) redirect('/login')
}
