import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { loadRubric, migratedDb } from '../scripts/local-db'

let pg: PGlite
beforeAll(async () => {
  pg = await migratedDb()
})

describe('migration', () => {
  it('seeds both rubrics with 4 criteria and the rubric.txt weights', async () => {
    const pm = await loadRubric(pg, 'pm')
    const spm = await loadRubric(pg, 'spm')
    expect(pm.criteria.map((c) => c.weight)).toEqual([34, 27, 24, 15])
    expect(spm.criteria.map((c) => c.weight)).toEqual([26, 35, 21, 18])
    expect(pm.criteria.map((c) => c.name)).toEqual([
      "Got a yes from someone they couldn't instruct",
      'Stayed the named contact until closure',
      'Caught the disruption before the customer felt it',
      'Fixed it with what was already in the room',
    ])
    expect(pm.criteria.every((c) => c.spm_extra_bar === null)).toBe(true)
    expect(spm.criteria.every((c) => c.spm_extra_bar && c.spm_extra_bar.length > 20)).toBe(true)
    expect(pm.version).toBe(1)
  })

  it('rejects a rubric whose weights do not sum to 100', async () => {
    await expect(
      pg.transaction(async (tx) => {
        const r = await tx.query<{ id: string }>(`insert into rubrics (role, version, active, scoring_guide) values ('pm', 99, false, 'g') returning id`)
        await tx.query(
          `insert into criteria (rubric_id, position, name, source_evidence, strong_description, weak_description, weight)
           values ($1, 1, 'a', 's', 's', 'w', 60), ($1, 2, 'b', 's', 's', 'w', 30)`,
          [r.rows[0].id],
        )
      }),
    ).rejects.toThrow(/must be exactly 100/)
  })

  it('rejects changing an existing weight so the sum breaks', async () => {
    await expect(pg.exec(`update criteria set weight = 40 where position = 1 and rubric_id = (select id from rubrics where role='pm' and active)`)).rejects.toThrow(
      /must be exactly 100/,
    )
  })

  it('record_scoring keeps history and exactly one current total', async () => {
    const pm = await loadRubric(pg, 'pm')
    const c = await pg.query<{ id: string }>(`insert into candidates (role_applied) values ('pm') returning id`)
    const id = c.rows[0].id
    const scores = JSON.stringify(pm.criteria.map((cr) => ({ criterion_id: cr.id, score: 2, model_score: 2, gated: false, reason: 'r' })))
    await pg.query(`select record_scoring($1, 'pm', $2, 66.7, 'm', $3::jsonb)`, [id, pm.id, scores])
    await pg.query(`select record_scoring($1, 'pm', $2, 50.0, 'm', $3::jsonb)`, [id, pm.id, scores])
    const t = await pg.query<{ total: string; is_current: boolean; above_line: boolean }>(
      `select total, is_current, above_line from totals where candidate_id = $1 order by created_at, is_current`,
      [id],
    )
    expect(t.rows.length).toBe(2)
    expect(t.rows.filter((r) => r.is_current).map((r) => Number(r.total))).toEqual([50])
    expect(t.rows.find((r) => Number(r.total) === 66.7)?.above_line).toBe(true) // default line 60
    await pg.exec(`update settings set pm_threshold = 40; select recompute_lines();`)
    const cur = await pg.query<{ above_line: boolean }>(`select above_line from totals where candidate_id = $1 and is_current`, [id])
    expect(cur.rows[0].above_line).toBe(true)
  })

  it('makes a second sent email for the same candidate impossible', async () => {
    const c = await pg.query<{ id: string }>(`insert into candidates (role_applied) values ('spm') returning id`)
    const id = c.rows[0].id
    await pg.query(`insert into emails (candidate_id, type, subject, body, status) values ($1, 'invite', 's', 'b', 'sent')`, [id])
    await expect(pg.query(`insert into emails (candidate_id, type, subject, body, status) values ($1, 'invite', 's', 'b', 'sent')`, [id])).rejects.toThrow()
    // Atomic claim: only a draft can move to sending.
    const d = await pg.query<{ id: string }>(`insert into emails (candidate_id, type, subject, body) values ($1, 'invite', 's', 'b') returning id`, [id])
    await expect(pg.query(`update emails set status = 'sending' where id = $1 and status = 'draft'`, [d.rows[0].id])).rejects.toThrow(/emails_one_sent/)
  })

  it('creates a settings row with defaults', async () => {
    const s = await pg.query<{ top_n: number }>(`select top_n from settings`)
    expect(s.rows[0].top_n).toBe(5)
  })
})

describe('rubric change template', () => {
  it('publishes a new version, keeps the old one for traceability', async () => {
    const { readFileSync } = await import('node:fs')
    const tpl = readFileSync(new URL('../db/templates/new_rubric_version.sql', import.meta.url), 'utf8')
    await pg.exec(tpl)
    const r = await pg.query<{ version: number; active: boolean }>(`select version, active from rubrics where role = 'pm' order by version`)
    expect(r.rows).toEqual([{ version: 1, active: false }, { version: 2, active: true }])
    const pm = await loadRubric(pg, 'pm')
    expect(pm.version).toBe(2)
    expect(pm.criteria.reduce((a, c) => a + c.weight, 0)).toBe(100)
  })
})

describe('0002 name status', () => {
  it('adds name_status, defaulting to unconfirmed, and rejects other values', async () => {
    const c = await pg.query<{ id: string }>(`insert into candidates (role_applied) values ('pm') returning id`)
    await pg.query(`insert into candidate_pii (candidate_id, raw_cv_text) values ($1, 'x')`, [c.rows[0].id])
    const r = await pg.query<{ name_status: string }>(`select name_status from candidate_pii where candidate_id = $1`, [c.rows[0].id])
    expect(r.rows[0].name_status).toBe('unconfirmed')
    await expect(pg.query(`update candidate_pii set name_status = 'maybe' where candidate_id = $1`, [c.rows[0].id])).rejects.toThrow()
  })
})
