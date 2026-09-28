// Offline end-to-end test run against the real Gemini API (no database/Resend needed):
// sample CV files -> text extraction -> PII separation/redaction -> scoring (both
// rubrics, seeded from the real migration) -> top-N briefs -> email drafts.
// Writes test-run/REPORT.md and test-run/ai-requests.jsonl (every AI payload sent).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cvKind, extractText } from '../lib/extract'
import type { AiConfig } from '../lib/ai/gemini'
import { detectPii } from '../lib/pii/detect'
import { buildPiiGuard, redactCv } from '../lib/pii/redact'
import { scoreBoth } from '../lib/scoring'
import { finalizeEmail, firstNameOf, writeBrief, writeEmail } from '../lib/writing'
import { ROLES, ROLE_LABEL, otherRole, type Rubric } from '../lib/types'
import { loadRubric, migratedDb } from './local-db'
import { makeSamples } from './make-sample-cvs'

process.loadEnvFile(path.resolve(import.meta.dirname, '../.env.local'))
const OUT = path.resolve(import.meta.dirname, '../test-run')
const LOG = path.join(OUT, 'ai-requests.jsonl')
mkdirSync(OUT, { recursive: true })
writeFileSync(LOG, '')

const SETTINGS = {
  pm_threshold: 60,
  spm_threshold: 60,
  top_n: 5,
  company_name: 'Kargo',
  invite_next_step: 'Please reply with two or three 45-minute slots that work for you over the next week, and we will send a calendar invite.',
  jd_pm: 'Product Manager at Kargo (logistics software, Mumbai). Owns product for freight and customs workflows; works directly with carriers, customs brokers, ports and client operations teams.',
  jd_spm: 'Senior Product Manager at Kargo (logistics software, Mumbai). Owns a product area end to end across freight, customs and client operations; leads outside-party relationships and sets up processes that outlast incidents.',
  signature: 'Best,\nFounder, Kargo\nMumbai',
}

const ai: AiConfig = {
  apiKey: process.env.GEMINI_API_KEY!,
  model: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
  audit: (e) => appendFileSync(LOG, JSON.stringify(e) + '\n'),
}

async function main() {
  const pg = await migratedDb()
  const rubrics: Record<'pm' | 'spm', Rubric> = { pm: await loadRubric(pg, 'pm'), spm: await loadRubric(pg, 'spm') }
  const samples = await makeSamples()

  type Result = (typeof samples)[number] & {
    raw: string
    pii: ReturnType<typeof detectPii>
    redacted: string
    guard: ReturnType<typeof buildPiiGuard>
    scored: Awaited<ReturnType<typeof scoreBoth>>
  }
  const results: Result[] = []
  for (const s of samples) {
    const t0 = Date.now()
    const buf = readFileSync(s.path)
    const raw = await extractText(buf, cvKind(s.file, '')!)
    const pii = detectPii(raw)
    const redacted = redactCv(raw, pii)
    const guard = buildPiiGuard(pii)
    guard.assertClean('', [redacted])
    const scored = await scoreBoth(ai, { candidateId: s.file, redactedCv: redacted, pm: rubrics.pm, spm: rubrics.spm, guard })
    console.log(`${s.file}: PM ${scored.pm.total} SPM ${scored.spm.total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
    results.push({ ...s, raw, pii, redacted, guard, scored })
  }

  // Rankings and top N per role (ties: upload order).
  const ranking = Object.fromEntries(ROLES.map((r) => [r, [...results].sort((a, b) => b.scored[r].total - a.scored[r].total)])) as Record<
    'pm' | 'spm',
    typeof results
  >
  const briefs = new Map<string, string>()
  for (const role of ROLES) {
    for (const c of ranking[role].slice(0, SETTINGS.top_n)) {
      briefs.set(`${c.file}:${role}`, await writeBrief(ai, { candidateId: c.file, redactedCv: c.redacted, rubric: rubrics[role], scores: c.scored[role].scores, guard: c.guard }))
    }
  }
  const emails = new Map<string, { type: string; subject: string; body: string }>()
  for (const c of results) {
    const line = c.role === 'pm' ? SETTINGS.pm_threshold : SETTINGS.spm_threshold
    const type = c.scored[c.role].total >= line ? 'invite' : 'rejection'
    const draft = await writeEmail(ai, { candidateId: c.file, redactedCv: c.redacted, type, role: c.role, settings: SETTINGS, guard: c.guard })
    emails.set(c.file, { type, ...finalizeEmail(draft, firstNameOf(c.pii.name), SETTINGS.signature) })
  }

  // Independent leak scan of every logged payload (plain substring checks, not the guard).
  const logged = readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { purpose: string; candidate_id: string; payload: string; pii_check: string })
  const leaks: string[] = []
  for (const entry of logged) {
    const c = results.find((r) => r.file === entry.candidate_id)!
    const cvPart = entry.payload.slice(entry.payload.indexOf('CV TEXT'))
    const checks = [
      ...(c.pii.name ? [c.pii.name, ...c.pii.name.split(' ')] : []),
      c.pii.email, c.pii.phone, c.pii.linkedin_url, c.pii.github_url, c.pii.address, ...c.pii.other_urls,
    ].filter(Boolean) as string[]
    for (const v of checks) if (cvPart.toLowerCase().includes(v.toLowerCase())) leaks.push(`${entry.purpose}/${c.file}: "${v}"`)
    const digits = c.pii.phone?.replace(/\D/g, '').slice(-10)
    if (digits && entry.payload.replace(/\D/g, '').includes(digits)) leaks.push(`${entry.purpose}/${c.file}: phone digits`)
    if (c.pii.email && entry.payload.toLowerCase().includes(c.pii.email.toLowerCase())) leaks.push(`${entry.purpose}/${c.file}: email`)
    if (c.pii.name && entry.payload.toLowerCase().includes(c.pii.name.toLowerCase())) leaks.push(`${entry.purpose}/${c.file}: full name`)
  }

  // ---- Report ----
  const md: string[] = []
  md.push(`# Test run: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '')
  md.push(`Model: \`${ai.model}\` · Rubric: PM v${rubrics.pm.version}, SPM v${rubrics.spm.version} (seeded by the migration) · Lines: PM ${SETTINGS.pm_threshold}, SPM ${SETTINGS.spm_threshold} · Top N: ${SETTINGS.top_n}`, '')
  md.push(`**AI requests:** ${logged.length}, all \`pii_check=${[...new Set(logged.map((l) => l.pii_check))].join('/')}\`. **Independent leak scan:** ${leaks.length ? 'LEAKS FOUND: ' + leaks.join('; ') : 'no name, email, phone, URL or address found in any payload.'}`, '')
  for (const role of ROLES) {
    md.push(`## ${ROLE_LABEL[role]} ranking`, '', '| Rank | Name | Applied | PM | SPM | Line (applied role) | Flag |', '|---|---|---|---|---|---|---|')
    ranking[role].forEach((c, i) => {
      const applied = c.scored[c.role].total >= (c.role === 'pm' ? SETTINGS.pm_threshold : SETTINGS.spm_threshold)
      const o = otherRole(c.role)
      const flag = c.scored[o].total >= (o === 'pm' ? SETTINGS.pm_threshold : SETTINGS.spm_threshold) ? `clears ${ROLE_LABEL[o]} line` : ''
      md.push(`| ${i + 1} | ${c.pii.name} | ${ROLE_LABEL[c.role]} | ${c.scored.pm.total.toFixed(1)} | ${c.scored.spm.total.toFixed(1)} | ${applied ? 'above' : 'below'} | ${flag} |`)
    })
    md.push('')
  }
  for (const c of results) {
    md.push(`---`, '', `## ${c.pii.name}: applied ${ROLE_LABEL[c.role]} (\`${c.file}\`)`, '')
    md.push('**Personal details separated (never sent to AI):**', '')
    md.push(`name=${c.pii.name} · email=${c.pii.email} · phone=${c.pii.phone} · linkedin=${c.pii.linkedin_url ?? '-'} · github=${c.pii.github_url ?? '-'} · other urls=${c.pii.other_urls.join(', ') || '-'} · address=${c.pii.address ?? '-'}`, '')
    md.push('<details><summary>Redacted CV text (exactly what the AI saw)</summary>', '', '```', c.redacted, '```', '</details>', '')
    for (const role of ROLES) {
      md.push(`### ${ROLE_LABEL[role]}: ${c.scored[role].total.toFixed(1)} / 100`, '', '| # | Criterion | Wt | Score | Reason |', '|---|---|---|---|---|')
      for (const cr of rubrics[role].criteria) {
        const s = c.scored[role].scores.find((x) => x.criterion_id === cr.id)!
        const gate = s.gated ? ` _(model said ${s.model_score}; capped: PM bar not met)_` : ''
        md.push(`| ${cr.position} | ${cr.name} | ${cr.weight} | ${s.score}${gate} | ${s.reason.replace(/\|/g, '/')} |`)
      }
      md.push('')
      const b = briefs.get(`${c.file}:${role}`)
      if (b) md.push(`**Interview brief (${ROLE_LABEL[role]}):** ${b}`, '')
    }
    const e = emails.get(c.file)!
    md.push(`### Email draft: ${e.type === 'invite' ? 'interview invite' : 'rejection'}`, '', `**Subject:** ${e.subject}`, '', '```', e.body, '```', '')
  }
  writeFileSync(path.join(OUT, 'REPORT.md'), md.join('\n'))
  console.log(`\nWrote test-run/REPORT.md (${logged.length} AI requests, ${leaks.length} leaks)`)
  if (leaks.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
