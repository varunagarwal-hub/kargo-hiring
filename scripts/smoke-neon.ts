// Smoke test of the real pipeline against the linked Neon branch (DB + "mesa" bucket) and Gemini.
// Uploads one fictional sample CV. Run: npx tsx --conditions=react-server scripts/smoke-neon.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
const { createCandidate, processCandidate } = await import('../lib/pipeline')
const { q, one } = await import('../lib/db')
const { cvUrl } = await import('../lib/storage')

const file = path.resolve(import.meta.dirname, '../test-run/cvs/priya-nair-pm.pdf')
const f = new File([readFileSync(file)], 'priya-nair-pm.pdf', { type: 'application/pdf' })
const t0 = Date.now()
const id = await createCandidate(f, 'pm')
await processCandidate(id)
console.log(`candidate ${id} processed in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
console.log('status:', (await one<{ status: string; error_message: string | null }>(`select status, error_message from candidates where id=$1`, [id])))
console.log('totals:', await q(`select role, total, above_line from totals where candidate_id=$1 and is_current order by role`, [id]))
console.log('scores rows:', (await one<{ n: number }>(`select count(*)::int n from scores s join totals t on t.id=s.total_id where t.candidate_id=$1 and t.is_current`, [id]))!.n)
console.log('briefs:', (await q<{ role: string }>(`select role from briefs where candidate_id=$1`, [id])).map((b) => b.role))
const e = await one<{ type: string; status: string; subject: string; body: string }>(`select type, status, subject, body from emails where candidate_id=$1`, [id])
console.log('email:', e?.type, e?.status, '|', e?.subject, '|', e?.body.split('\n')[0])
const audit = await q<{ purpose: string; pii_check: string; leak: boolean }>(
  `select a.purpose, a.pii_check, (position(lower(p.name) in lower(a.payload)) > 0 or position(lower(p.email) in lower(a.payload)) > 0) as leak
     from ai_requests a join candidate_pii p on p.candidate_id = a.candidate_id where a.candidate_id=$1`, [id])
console.log('ai_requests:', audit.length, 'pii_check:', [...new Set(audit.map((a) => a.pii_check))], 'name/email in payload:', audit.some((a) => a.leak))
const key = (await one<{ cv_file_path: string }>(`select cv_file_path from candidates where id=$1`, [id]))!.cv_file_path
const res = await fetch(await cvUrl(key))
const unsigned = await fetch(`${process.env.AWS_ENDPOINT_URL_S3}/mesa/${key}`)
console.log('bucket file via presigned URL:', res.status, res.headers.get('content-type'), (await res.arrayBuffer()).byteLength, 'bytes; unsigned request:', unsigned.status)
process.exit(0)
