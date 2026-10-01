// Runs the real migration in an in-process Postgres (PGlite) so tests and the
// offline test run use the exact rubric the production database is seeded with.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { Criterion, Role, Rubric } from '../lib/types'

const MIGRATIONS = path.resolve(import.meta.dirname, '../db/migrations')

export async function migratedDb(): Promise<PGlite> {
  const pg = new PGlite()
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'))
  }
  return pg
}

export async function loadRubric(pg: PGlite, role: Role): Promise<Rubric> {
  const r = await pg.query<Omit<Rubric, 'criteria'>>(`select id, role, version, scoring_guide from rubrics where role = $1 and active`, [role])
  const c = await pg.query<Criterion>(`select * from criteria where rubric_id = $1 order by position`, [r.rows[0].id])
  return { ...r.rows[0], criteria: c.rows }
}
