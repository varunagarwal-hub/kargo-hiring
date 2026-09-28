'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { q } from '@/lib/db'
import { processCandidate, updatePii } from '@/lib/pipeline'
import { sendDraft } from '@/lib/send'
import type { Pii } from '@/lib/types'

export type ActionState = { ok?: string; error?: string }

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? '').trim()
  return v || null
}

export async function savePiiAction(_p: ActionState, f: FormData): Promise<ActionState> {
  await requireAuth()
  const id = String(f.get('candidate_id'))
  const pii: Pii = {
    name: str(f, 'name'),
    email: str(f, 'email'),
    phone: str(f, 'phone'),
    linkedin_url: str(f, 'linkedin_url'),
    github_url: str(f, 'github_url'),
    other_urls: String(f.get('other_urls') ?? '').split(/\s+/).filter(Boolean),
    address: str(f, 'address'),
  }
  try {
    const { rescored } = await updatePii(id, pii)
    revalidatePath(`/candidates/${id}`)
    return { ok: rescored ? 'Saved. Redacted text changed, so the CV was re-scored.' : 'Saved.' }
  } catch (e) {
    revalidatePath(`/candidates/${id}`)
    return { error: (e as Error).message }
  }
}

export async function rescoreAction(_p: ActionState, f: FormData): Promise<ActionState> {
  await requireAuth()
  const id = String(f.get('candidate_id'))
  try {
    await processCandidate(id, { forceDraft: true })
    revalidatePath(`/candidates/${id}`)
    revalidatePath('/')
    return { ok: 'Re-scored. Brief and draft regenerated (sent emails are never changed).' }
  } catch (e) {
    revalidatePath(`/candidates/${id}`)
    return { error: (e as Error).message }
  }
}

async function saveEdits(f: FormData): Promise<{ emailId: string; candidateId: string }> {
  const emailId = String(f.get('email_id'))
  const candidateId = String(f.get('candidate_id'))
  const subject = String(f.get('subject') ?? '').trim()
  const body = String(f.get('body') ?? '').trim()
  if (!subject || !body) throw new Error('Subject and body are required.')
  // Only drafts can be edited; a sent email is never overwritten.
  await q(`update emails set subject = $2, body = $3, updated_at = now() where id = $1 and status = 'draft'`, [emailId, subject, body])
  return { emailId, candidateId }
}

export async function saveDraftAction(_p: ActionState, f: FormData): Promise<ActionState> {
  await requireAuth()
  try {
    const { candidateId } = await saveEdits(f)
    revalidatePath(`/candidates/${candidateId}`)
    return { ok: 'Draft saved.' }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** One click: save what is on screen, then send exactly one email. */
export async function sendAction(_p: ActionState, f: FormData): Promise<ActionState> {
  await requireAuth()
  try {
    const { emailId, candidateId } = await saveEdits(f)
    const r = await sendDraft(emailId)
    revalidatePath(`/candidates/${candidateId}`)
    revalidatePath('/')
    return r.ok ? { ok: `Sent at ${new Date(r.sentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.` } : { error: r.error }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
