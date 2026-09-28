import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/auth'
import { createCandidate, processCandidate } from '@/lib/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Upload one CV: extract, separate personal details, score both rubrics, brief if top N, draft email. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const form = await req.formData()
  const file = form.get('file')
  const role = form.get('role')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (role !== 'pm' && role !== 'spm') return NextResponse.json({ error: 'Role must be pm or spm' }, { status: 400 })

  let id: string
  try {
    id = await createCandidate(file, role)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  try {
    await processCandidate(id)
    return NextResponse.json({ id })
  } catch (e) {
    console.error(`[pipeline] candidate=${id} failed: ${(e as Error).message}`)
    return NextResponse.json({ id, error: `Saved, but processing failed: ${(e as Error).message}` }, { status: 500 })
  }
}
