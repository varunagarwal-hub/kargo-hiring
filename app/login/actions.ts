'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'
import { SESSION_COOKIE, SESSION_DAYS, makeToken, passwordMatches } from '@/lib/session'

export async function login(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get('password') ?? '')
  const secret = env.sessionSecret()
  if (!(await passwordMatches(password, env.appPassword(), secret))) {
    await new Promise((r) => setTimeout(r, 800)) // slow down guessing
    return { error: 'Wrong password.' }
  }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, await makeToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
  redirect('/')
}

export async function logout() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/login')
}
