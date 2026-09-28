import 'server-only'
import { Resend } from 'resend'
import { loadSettings, one, q } from '@/lib/db'
import { env } from '@/lib/env'

export type SendResult = { ok: true; sentAt: string } | { ok: false; error: string }

/**
 * Send one draft through Resend. Double-send protection, in layers:
 *  1. atomic claim: status draft -> sending only succeeds once;
 *  2. unique index emails_one_sent: at most one sending/sent email per candidate;
 *  3. Resend idempotency key = email id, so a retried request is not re-delivered.
 */
export async function sendDraft(emailId: string): Promise<SendResult> {
  let email: { id: string; candidate_id: string; subject: string; body: string } | null
  try {
    email = await one(
      `update emails set status = 'sending', last_error = null, updated_at = now()
        where id = $1 and status = 'draft'
        returning id, candidate_id, subject, body`,
      [emailId],
    )
  } catch (e) {
    const msg = (e as Error).message
    return { ok: false, error: /emails_one_sent/.test(msg) ? 'An email has already been sent to this candidate.' : msg }
  }
  if (!email) return { ok: false, error: 'This email has already been sent (or is being sent).' }

  const release = async (error: string): Promise<SendResult> => {
    await q(`update emails set status = 'draft', last_error = $2, updated_at = now() where id = $1 and status = 'sending'`, [emailId, error])
    return { ok: false, error }
  }

  try {
    const pii = await one<{ email: string | null }>(`select email from candidate_pii where candidate_id = $1`, [email.candidate_id])
    const to = pii?.email?.trim()
    if (!to) return release('No email address on file for this candidate. Add it under Personal details.')
    const settings = await loadSettings()
    const resend = new Resend(env.resendApiKey())
    const { data, error } = await resend.emails.send(
      {
        from: `${settings.sender_name} <${env.resendFromEmail()}>`,
        to: [to],
        replyTo: settings.reply_to,
        subject: email.subject,
        text: email.body,
      },
      { idempotencyKey: `kargo-email-${email.id}` },
    )
    if (error || !data?.id) return release(`Resend error: ${error?.message ?? 'no message id returned'}`)
    const sent = await one<{ sent_at: string }>(
      `update emails set status = 'sent', sent_at = now(), resend_id = $2, updated_at = now() where id = $1 returning sent_at`,
      [emailId, data.id],
    )
    return { ok: true, sentAt: sent!.sent_at }
  } catch (e) {
    return release(`Send failed: ${(e as Error).message}`)
  }
}
