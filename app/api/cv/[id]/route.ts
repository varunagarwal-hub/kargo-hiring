import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/auth'
import { one } from '@/lib/db'
import { cvUrl } from '@/lib/storage'

export const runtime = 'nodejs'

/** Redirect to a 60-second presigned URL for the original CV in the private bucket. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { id } = await ctx.params
  const c = await one<{ cv_file_path: string | null }>(`select cv_file_path from candidates where id = $1`, [id]).catch(() => null)
  if (!c?.cv_file_path) return NextResponse.json({ error: 'No file' }, { status: 404 })
  try {
    return NextResponse.redirect(await cvUrl(c.cv_file_path))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
