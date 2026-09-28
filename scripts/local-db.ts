// Runs the real migration in an in-process Postgres (PGlite) so tests and the
// offline test run use the exact rubric the production database is seeded with.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { Criterion, Role, Rubric } from '../lib/types'

const MIGRATION = path.resolve(import.meta.dirname, '../db/migrations/0001_init.sql')

export async function migratedDb(): Promise<PGlite> {
  const pg = new PGlite()
  const sql = readFileSync(MIGRATION, 'utf8')
  await pg.exec(sql)
  return pg
}

export async function loadRubric(pg: PGlite, role: Role): Promise<Rubric> {
  const r = await pg.query<Omit<Rubric, 'criteria'>>(`select id, role, version, scoring_guide from rubrics where role = $1 and active`, [role])
  const c = await pg.query<Criterion>(`select * from criteria where rubric_id = $1 order by position`, [r.rows[0].id])
  return { ...r.rows[0], criteria: c.rows }
}
