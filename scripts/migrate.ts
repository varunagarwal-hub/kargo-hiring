// Applies db/migrations/*.sql in order to the Neon database, once each, each in a
// transaction. Uses the direct (unpooled) connection, as Neon recommends for DDL.
//   npm run migrate                # uses DATABASE_URL_UNPOOLED from .env.local
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
} catch {
  // no .env.local: rely on the environment
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL_UNPOOLED (run `neon env pull`)')

const dir = path.resolve(import.meta.dirname, '../db/migrations')
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`)
  const done = new Set((await client.query<{ name: string }>(`select name from schema_migrations`)).rows.map((r) => r.name))
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) {
      console.log(`skip   ${file}`)
      continue
    }
    await client.query('begin')
    try {
      await client.query(readFileSync(path.join(dir, file), 'utf8'))
      await client.query(`insert into schema_migrations (name) values ($1)`, [file])
      await client.query('commit')
      console.log(`apply  ${file}`)
    } catch (e) {
      await client.query('rollback')
      throw new Error(`${file} failed, rolled back: ${(e as Error).message}`)
    }
  }
} finally {
  await client.end()
}
