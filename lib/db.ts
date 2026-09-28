import 'server-only'
import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'
import { env } from '@/lib/env'
import type { AuditSink } from '@/lib/ai/gemini'
import type { Criterion, Role, Rubric, Settings } from '@/lib/types'

// Keep timestamps as ISO strings and numerics as numbers (the defaults are Date and string).
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()) // timestamptz
pg.types.setTypeParser(1700, (v) => parseFloat(v)) // numeric

let pool: pg.Pool | null = null

/** Server-only pool on the pooled Neon URL. The browser never receives these credentials. */
function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: env.databaseUrl(), max: 5, idleTimeoutMillis: 5000 })
    // Lets Vercel Fluid compute close idle clients before a function instance suspends.
    attachDatabasePool(pool)
  }
  return pool
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await getPool().query(sql, params)).rows as T[]
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null
}

export async function mustOne<T = Record<string, unknown>>(sql: string, params: unknown[], what: string): Promise<T> {
  const row = await one<T>(sql, params)
  if (!row) throw new Error(`${what}: not found`)
  return row
}

/** Run fn in one transaction on one client. */
export async function tx<T>(fn: (query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await fn(async <R,>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as R[])
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function loadActiveRubric(role: Role): Promise<Rubric> {
  const r = await mustOne<Omit<Rubric, 'criteria'>>(
    `select id, role, version, scoring_guide from rubrics where role = $1 and active`,
    [role],
    `active ${role} rubric`,
  )
  return { ...r, criteria: await q<Criterion>(`select * from criteria where rubric_id = $1 order by position`, [r.id]) }
}

export async function loadRubricById(id: string): Promise<Rubric> {
  const r = await mustOne<Omit<Rubric, 'criteria'>>(`select id, role, version, scoring_guide from rubrics where id = $1`, [id], 'rubric')
  return { ...r, criteria: await q<Criterion>(`select * from criteria where rubric_id = $1 order by position`, [id]) }
}

export async function loadSettings(): Promise<Settings> {
  return mustOne<Settings>(`select * from settings where id = 1`, [], 'settings')
}

/** Audit sink that writes every AI request (redacted payload + PII check) to ai_requests. */
export const dbAudit: AuditSink = async (e) => {
  await q(
    `insert into ai_requests (candidate_id, purpose, model, payload, payload_sha256, pii_check) values ($1, $2, $3, $4, $5, $6)`,
    [e.candidate_id, e.purpose, e.model, e.payload, e.payload_sha256, e.pii_check],
  )
}
