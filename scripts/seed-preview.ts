// Seeds a Neon *preview* branch with the three fictional sample CVs through the real pipeline.
// Refuses to run unless .env.preview.local points at a non-production branch.
// Run: npx tsx --conditions=react-server scripts/seed-preview.ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
for (const k of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'NEON_BRANCH', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION']) delete process.env[k]
process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.preview.local'))
if (!process.env.NEON_BRANCH || process.env.NEON_BRANCH === 'production') throw new Error('Refusing to seed: .env.preview.local is not a preview branch')
console.log(`seeding branch ${process.env.NEON_BRANCH}`)
const { createCandidate, processCandidate } = await import('../lib/pipeline')
const samples: [string, 'pm' | 'spm', string][] = [
  ['priya-nair-pm.pdf', 'pm', 'application/pdf'],
  ['karan-mehta-spm.docx', 'spm', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['farah-sheikh-pm.pdf', 'pm', 'application/pdf'],
]
for (const [file, role, type] of samples) {
  const t0 = Date.now()
  const f = new File([readFileSync(path.resolve(import.meta.dirname, '../test-run/cvs', file))], file, { type })
  const id = await createCandidate(f, role)
  await processCandidate(id)
  console.log(`${file}: ${id} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
process.exit(0)
