# Kargo Hiring

Internal hiring dashboard for one founder. Upload a CV → it is scored against the PM **and** SPM rubrics, the top N per role get an interview brief, every candidate gets a draft email (invite if above the line for the role they applied to, warm rejection otherwise), and one click sends it.

Stack: Next.js 16 (App Router, TypeScript) on Vercel · Neon (Postgres 18 + private Object Storage bucket `mesa`) · Google Gemini · Resend · single-password login.

---

## How it works

| Step | What happens | Where |
|---|---|---|
| 0 | CV text extracted (PDF/DOCX, text only; photos are never extracted). Name, email, phone, LinkedIn, GitHub, personal URLs and home address are detected **without AI** and stored in `candidate_pii`. Every occurrence of the name (incl. possessives, `ananya.iyer`, `ananyaiyer` handles) becomes `[CANDIDATE]`; emails/phones/URLs/address become tokens. Original file goes to the private Neon bucket `mesa` (`lib/storage.ts`); downloads use 60-second presigned URLs. | `lib/pii/*`, `lib/extract.ts` |
| 1 | Two AI calls (PM rubric, SPM rubric) return strict JSON: per criterion a 0–3 score and a one-line reason quoting the CV (or "No instance found."). Validated with zod + rule checks; one retry if malformed. **SPM gate** in code: if the PM score on a criterion is < 2 (PM bar not met), the SPM score is capped at the PM score. **Totals in code**: Σ score/3 × weight. Every score row references the rubric version and model. | `lib/scoring.ts` |
| 2 | Top N per role (ranked by that role's total; ties → earlier upload) get a three-sentence brief: strongest evidence, weakest criterion, one probing question. Recomputed after every upload/re-score/settings change. | `lib/writing.ts`, `syncBriefs` |
| 3 | Draft email written with `{{first_name}}`; server substitutes the real first name and appends the signature from Settings. Never mentions scores (validated). | `lib/writing.ts`, `ensureDraft` |
| 4 | Dashboard: PM/SPM ranking toggle, scores, above/below line, "clears other role's line" flag, email status. Candidate page: reasons, briefs, editable draft, **Send**. | `app/` |

### Personal details never reach the AI
- AI modules only accept redacted text; the only file that reads `candidate_pii` and calls the AI is `lib/pipeline.ts`, and it passes a *guard*, not the details.
- `lib/ai/gemini.ts` checks every outgoing payload with the guard (name, name parts/handles, email, phone digits in any format, URLs, address) and **blocks** the request if anything is found.
- If no name was detected, scoring **does not run** (the name can't be redacted if it's unknown); the candidate shows an error asking you to enter it.
- Every request is logged in `ai_requests` (redacted payload, SHA-256, `pii_check`), and in Vercel logs as `[ai] purpose=… pii_check=passed`.
- Verify: Neon console → SQL Editor (or `neon sql`) → `select purpose, pii_check, left(payload, 300) from ai_requests order by created_at desc;`
- Tests: `tests/no-pii-in-ai.test.ts` intercepts every HTTP request to the AI and asserts none contains the name, email, phone, LinkedIn URL or address; and that a leaky payload is blocked before any request is made.

### Sending
One click saves the on-screen draft and sends it. Double sends are impossible: atomic `draft → sending` claim, a unique index allowing one sent email per candidate, and a Resend idempotency key. Resend failures show on the page and the draft stays editable. Re-scoring regenerates brief + draft but never touches a sent email (and no new draft is made once one is sent).

---

## Setup and deploy (≈20 minutes)

**1. Neon** (already done for project `cold-dream-62091040`, branch `production`)
1. `neon link --project-id cold-dream-62091040 --branch production -y`: writes `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and the `AWS_*` bucket credentials into `.env.local`.
2. `neon deploy`: applies `neon.ts` (the private `mesa` bucket).
3. `npm run migrate`: creates the tables and the weight check, and seeds rubric v1 (uses the direct URL; safe to re-run).
4. Optional: `npm run smoke` runs one sample CV through the real pipeline against Neon + Gemini.

**2. Resend**
1. resend.com → Domains → add your domain (e.g. `kargo.in`), add the DNS records it shows, wait for **Verified**.
2. API Keys → create a key with "Sending access".
3. Pick a from address on that domain, e.g. `hiring@kargo.in`.

**3. Gemini**: aistudio.google.com/apikey → create a key.

**4. Vercel**
1. Push this folder to a private GitHub repo.
2. vercel.com → Add New → Project → import the repo (framework auto-detected).
3. Settings → Environment Variables: add every variable in `.env.example`:
   `GEMINI_API_KEY`, `GEMINI_MODEL`, `DATABASE_URL` (pooled), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` (copy these five from `.env.local`), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_PASSWORD`, `SESSION_SECRET` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. Settings → Functions: make sure **Fluid compute** is on (default for new projects). The upload route takes ~1–3 min per CV (149 s in the Neon smoke test) (`maxDuration = 300`).
5. Deploy. Open the URL, sign in with `APP_PASSWORD`.

**5. First run**: Settings → set reply-to, sender name, signature, invite next step, and paste the two JDs (used only for email/brief context, never scoring). Upload a CV.

Local development: `neon link …` (or `neon env pull`) fills the Neon variables in `.env.local`; add the rest from `.env.example`, then `npm install` and `npm run dev`.

---

## Changing the threshold and top N
Settings page. Saving re-derives above/below for every candidate, regenerates briefs for the new top N (and removes briefs outside it), and regenerates unsent drafts whose type flipped (invite ↔ rejection). Sent emails are never touched.

## Changing the rubric
Rubrics are versioned; scores always point at the version that produced them.
1. Copy `db/templates/new_rubric_version.sql` to `db/migrations/0002_…sql`.
2. Edit the role, version number, and the four criteria (name, source lines, strong, weak, SPM extra bar for SPM, weight).
3. `npm run migrate`. Each file runs in one transaction; if the weights don't sum to exactly 100 nothing changes.
4. New uploads use the new version. Existing candidates keep their old scores (labelled "Rubric v1") until you click **Re-score**.

SPM criteria are paired with PM criteria by position (1–4) for the "PM bar first" gate. Keep positions aligned.

To change the model: set `GEMINI_MODEL` in Vercel and redeploy. Each score records the model used.

---

## Tests and test run
```bash
npm test          # 20 tests: redaction, PII-free AI payloads, JSON retry, totals, SPM gate, migration (runs the real SQL in PGlite)
npm run test-run  # live Gemini run on 3 generated sample CVs → test-run/REPORT.md + test-run/ai-requests.jsonl
```

## Decisions made (the [DECIDE]s)
- **AI provider:** Google Gemini (key supplied), model `gemini-3.1-pro-preview` (`gemini-2.5-pro` is no longer offered to new keys). Temperature 0.
- **Personal details separated:** name, email, phone, LinkedIn, GitHub, personal URLs in the CV header, home address. Photos: never extracted (text-only extraction), so never sent.
- **Top N:** 5 per role. **Lines:** 60/100 for both roles. Both editable.
- **Sender:** display name, reply-to, signature editable in Settings; from address = `RESEND_FROM_EMAIL` on your verified domain.

## Known limitations
- **Name detection is heuristic** (first short line of capitalised words). Check the Personal details box on each candidate; saving a correction re-redacts and re-scores. CVs where no name is found are held back, not sent.
- **Scores can vary by one point on borderline criteria between runs**, even at temperature 0 (seen in the test run: 0 vs 1 on "user interviews"). Near the line, re-scoring can flip above/below. If this matters, the next step is scoring each rubric 3× and taking the per-criterion median (3× cost).
- **Scanned (image-only) PDFs** are rejected with a clear message; there is no OCR.
- The model is a *preview* model; Google may retire it. Change `GEMINI_MODEL` if calls start failing.
