import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type { PiiGuard } from '@/lib/pii/redact'

// The single way this app talks to an AI model. Every request:
//  1. is assembled from fixed text (instructions, rubric, JD) and redacted
//     candidate text only — there is no parameter that accepts PII;
//  2. is checked by the PII guard, and blocked if anything personal is found;
//  3. is written to the audit sink (ai_requests table) and the server log;
//  4. must return JSON matching the zod schema — retried once if it doesn't.

export type AuditEntry = {
  candidate_id: string | null
  purpose: string
  model: string
  payload: string
  payload_sha256: string
  pii_check: 'passed' | 'blocked'
}
export type AuditSink = (entry: AuditEntry) => Promise<void> | void

export type JsonCall<T> = {
  purpose: string
  candidateId: string | null
  system: string
  /** Fixed context: rubric, JD, instructions. */
  fixed: string
  /** Redacted candidate-derived text (CV body). Checked strictly by the guard. */
  candidate: string[]
  schema: z.ZodType<T>
  /** Gemini responseSchema (OpenAPI subset) mirroring `schema`. */
  responseSchema: object
  /** Extra semantic check; return an error message to trigger the retry. */
  validate?: (value: T) => string | null
  guard: PiiGuard
}

export type AiConfig = { apiKey: string; model: string; audit: AuditSink }

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export class AiError extends Error {}

function assemble(call: JsonCall<unknown>, correction?: string) {
  const user = [call.fixed, ...call.candidate, correction].filter(Boolean).join('\n\n')
  const body = {
    systemInstruction: { parts: [{ text: call.system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: call.responseSchema,
    },
  }
  return { text: `${call.system}\n\n${user}`, json: JSON.stringify(body) }
}

async function post(cfg: AiConfig, json: string): Promise<string> {
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt))
    let res: Response
    try {
      res = await fetch(`${ENDPOINT}/${cfg.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: json,
        signal: AbortSignal.timeout(120_000),
      })
    } catch (e) {
      lastErr = `network: ${(e as Error).message}`
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`
      continue
    }
    if (!res.ok) throw new AiError(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`)
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
    }
    if (data.promptFeedback?.blockReason) throw new AiError(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`)
    const parts = data.candidates?.[0]?.content?.parts ?? []
    return parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('')
  }
  throw new AiError(`Gemini unavailable after retries (${lastErr})`)
}

function parse<T>(call: JsonCall<T>, raw: string): { ok: true; value: T } | { ok: false; error: string } {
  let obj: unknown
  try {
    obj = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return { ok: false, error: 'Reply was not valid JSON.' }
  }
  const r = call.schema.safeParse(obj)
  if (!r.success) {
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') }
  }
  const semantic = call.validate?.(r.data)
  if (semantic) return { ok: false, error: semantic }
  return { ok: true, value: r.data }
}

export async function generateJson<T>(cfg: AiConfig, call: JsonCall<T>): Promise<T> {
  let correction: string | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const payload = assemble(call as JsonCall<unknown>, correction)
    const sha = createHash('sha256').update(payload.json).digest('hex')
    const leaks = [
      ...call.guard.findLeaks(payload.text, call.candidate),
      ...call.guard.findLeaks(payload.json, []),
    ]
    if (leaks.length) {
      await cfg.audit({
        candidate_id: call.candidateId, purpose: call.purpose, model: cfg.model,
        payload: '[withheld: contained personal details]', payload_sha256: sha, pii_check: 'blocked',
      })
      console.error(`[ai] BLOCKED purpose=${call.purpose} candidate=${call.candidateId} leaks=${[...new Set(leaks)].join(',')}`)
      throw new AiError(`Blocked AI request: payload contained personal details (${[...new Set(leaks)].join(', ')})`)
    }
    await cfg.audit({
      candidate_id: call.candidateId, purpose: call.purpose, model: cfg.model,
      payload: payload.text, payload_sha256: sha, pii_check: 'passed',
    })
    console.log(`[ai] purpose=${call.purpose} candidate=${call.candidateId} model=${cfg.model} chars=${payload.text.length} sha256=${sha.slice(0, 12)} pii_check=passed attempt=${attempt + 1}`)

    const raw = await post(cfg, payload.json)
    const parsed = parse(call, raw)
    if (parsed.ok) return parsed.value
    console.warn(`[ai] invalid reply purpose=${call.purpose} attempt=${attempt + 1}: ${parsed.error}`)
    correction = `IMPORTANT: your previous reply was rejected (${parsed.error}). Reply again with only JSON that follows the schema and every rule above.`
  }
  throw new AiError(`AI returned invalid output twice for ${call.purpose}`)
}
