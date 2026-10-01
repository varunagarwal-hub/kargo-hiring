// Re-score every candidate with the current rubric, prompt and rules (e.g. after a
// scoring change). Briefs and unsent drafts are regenerated; sent emails are never
// touched. Candidates waiting for a name confirmation stay held.
//   npx tsx --conditions=react-server scripts/rescore-all.ts           # dry run
//   npx tsx --conditions=react-server scripts/rescore-all.ts --apply
import path from 'node:path'
process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
const apply = process.argv.includes('--apply')

const { q } = await import('../lib/db')
const { processCandidate } = await import('../lib/pipeline')

const rows = await q<{ id: string; status: string; name_status: string }>(
  `select c.id, c.status, p.name_status from candidates c join candidate_pii p on p.candidate_id = c.id order by c.created_at`,
)
const todo = rows.filter((r) => r.name_status !== 'unconfirmed' && r.status !== 'processing')
console.log(`${rows.length} candidates; ${todo.length} to re-score${apply ? '' : ' (dry run: re-run with --apply)'}`)
if (!apply) process.exit(0)

let done = 0
const queue = [...todo]
await Promise.all(
  [0, 1].map(async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      try {
        await processCandidate(r.id, { forceDraft: true })
        console.log(`${r.id.slice(0, 8)} re-scored (${++done}/${todo.length})`)
      } catch (e) {
        console.log(`${r.id.slice(0, 8)} failed: ${(e as Error).message}`)
      }
    }
  }),
)
process.exit(0)
