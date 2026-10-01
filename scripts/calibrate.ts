// Score CVs with the current scoring prompt without writing anything: the
// founder's current candidates (already redacted in the DB) plus the fixed
// sample CVs. Prints per-criterion scores and totals for calibration.
//   npx tsx scripts/calibrate.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { cvKind, extractText } from '../lib/extract'
import { detectPii } from '../lib/pii/detect'
import { buildPiiGuard, redactCv } from '../lib/pii/redact'
import { scoreBoth } from '../lib/scoring'
import type { Pii } from '../lib/types'
import { loadRubric, migratedDb } from './local-db'

process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
const ai = { apiKey: process.env.GEMINI_API_KEY!, model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview', audit: () => {} }
const local = await migratedDb()
const pm = await loadRubric(local, 'pm')
const spm = await loadRubric(local, 'spm')

const inputs: { label: string; redacted: string; pii: Pii; fileName: string | null }[] = []
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED!.replace(/sslmode=require\b/, 'sslmode=verify-full') })
await db.connect()
for (const r of (await db.query(`select c.id, c.cv_file_name, c.redacted_cv_text, p.* from candidates c join candidate_pii p on p.candidate_id = c.id order by c.created_at`)).rows) {
  inputs.push({ label: `uploaded ${String(r.id).slice(0, 8)}`, redacted: r.redacted_cv_text, pii: r, fileName: r.cv_file_name })
}
await db.end()
for (const f of ['priya-nair-pm.pdf', 'farah-sheikh-pm.pdf', 'karan-mehta-spm.docx']) {
  const raw = await extractText(readFileSync(path.resolve(import.meta.dirname, '../test-run/cvs', f)), cvKind(f, '')!)
  const pii = detectPii(raw, { fileName: f })
  inputs.push({ label: `sample ${f.split('-')[0]}`, redacted: redactCv(raw, pii), pii, fileName: f })
}

const results = await Promise.all(
  inputs.map(async (i) => ({ i, r: await scoreBoth(ai, { candidateId: null, redactedCv: i.redacted, pm, spm, guard: buildPiiGuard(i.pii, { fileName: i.fileName }) }) })),
)
for (const { i, r } of results) {
  console.log(`${i.label.padEnd(18)} PM ${r.pm.total.toFixed(1).padStart(5)} [${r.pm.scores.map((s) => s.score).join(' ')}]   SPM ${r.spm.total.toFixed(1).padStart(5)} [${r.spm.scores.map((s) => s.score).join(' ')}]`)
}
process.exit(0)
