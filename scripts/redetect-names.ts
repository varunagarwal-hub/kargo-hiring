// Re-run personal-detail detection for candidates uploaded before the detector
// fix, then re-redact and re-score them. Skips candidates whose details the
// founder already confirmed, and anyone who has been emailed.
//
//   npx tsx --conditions=react-server scripts/redetect-names.ts           # dry run
//   npx tsx --conditions=react-server scripts/redetect-names.ts --apply   # do it
import path from 'node:path'
process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
const apply = process.argv.includes('--apply')

const { q } = await import('../lib/db')
const { detectPii } = await import('../lib/pii/detect')
const { redactCv } = await import('../lib/pii/redact')
const { processCandidate } = await import('../lib/pipeline')

const rows = await q<{ id: string; cv_file_name: string | null; raw_cv_text: string; name: string | null; name_status: string; emailed: boolean }>(
  `select c.id, c.cv_file_name, p.raw_cv_text, p.name, p.name_status,
          exists (select 1 from emails e where e.candidate_id = c.id and e.status in ('sending', 'sent')) as emailed
     from candidates c join candidate_pii p on p.candidate_id = c.id
    order by c.created_at`,
)

for (const r of rows) {
  const tag = r.id.slice(0, 8)
  if (r.name_status === 'confirmed') { console.log(`${tag} skip: details confirmed by the founder`); continue }
  if (r.emailed) { console.log(`${tag} skip: already emailed`); continue }
  const d = detectPii(r.raw_cv_text, { fileName: r.cv_file_name })
  const status = d.nameConfidence === 'high' ? 'confident' : 'unconfirmed'
  console.log(`${tag} name ${d.name === r.name ? 'unchanged' : 'changed'} · confidence ${d.nameConfidence} (${d.nameReasons.join(' + ') || 'no signals'})`)
  if (!apply) continue
  await q(
    `update candidate_pii set name = $2, email = $3, phone = $4, linkedin_url = $5, github_url = $6, other_urls = $7, address = $8,
            name_status = $9, updated_at = now() where candidate_id = $1`,
    [r.id, d.name, d.email, d.phone, d.linkedin_url, d.github_url, d.other_urls, d.address, status],
  )
  await q(`update candidates set redacted_cv_text = $2 where id = $1`, [r.id, redactCv(r.raw_cv_text, d)])
  try {
    await processCandidate(r.id, { forceDraft: true })
    console.log(`${tag} re-scored`)
  } catch (e) {
    console.log(`${tag} held: ${(e as Error).message}`)
  }
}
if (!apply) console.log('\nDry run. Re-run with --apply to update and re-score.')
process.exit(0)
