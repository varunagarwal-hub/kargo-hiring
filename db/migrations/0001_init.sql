-- Kargo hiring dashboard: schema + rubric v1 seed (from rubric.txt).
-- Postgres on Neon. Only the server (DATABASE_URL, never sent to the browser) reads or
-- writes. Original CV files live in the private Neon Object Storage bucket "mesa" (neon.ts).


-- ---------------------------------------------------------------------------
-- Rubric
-- ---------------------------------------------------------------------------
create table rubrics (
  id            uuid primary key default gen_random_uuid(),
  role          text not null check (role in ('pm', 'spm')),
  version       int  not null,
  active        boolean not null default false,
  scoring_guide text not null,
  created_at    timestamptz not null default now(),
  unique (role, version)
);
-- At most one active rubric per role.
create unique index rubrics_one_active_per_role on rubrics (role) where active;

create table criteria (
  id                 uuid primary key default gen_random_uuid(),
  rubric_id          uuid not null references rubrics (id) on delete restrict,
  position           int  not null check (position between 1 and 10),
  name               text not null,
  source_evidence    text not null,
  strong_description text not null,
  weak_description   text not null,
  spm_extra_bar      text,            -- only for SPM rubrics
  weight             int  not null check (weight > 0 and weight <= 100),
  unique (rubric_id, position)
);

-- Each rubric's weights must sum to exactly 100. Deferred so a rubric and its
-- criteria can be inserted in one transaction.
create or replace function check_rubric_weights() returns trigger
language plpgsql as $fn$
declare
  rid uuid;
  total int;
begin
  if tg_table_name = 'rubrics' then
    rid := coalesce(new.id, old.id);
  else
    rid := coalesce(new.rubric_id, old.rubric_id);
  end if;
  if not exists (select 1 from rubrics where id = rid) then
    return null;
  end if;
  select coalesce(sum(weight), 0) into total from criteria where rubric_id = rid;
  if total <> 100 then
    raise exception 'Rubric % weights sum to %, must be exactly 100', rid, total;
  end if;
  return null;
end;
$fn$;

create constraint trigger criteria_weights_sum_100
  after insert or update or delete on criteria
  deferrable initially deferred
  for each row execute function check_rubric_weights();

create constraint trigger rubric_weights_sum_100
  after insert or update on rubrics
  deferrable initially deferred
  for each row execute function check_rubric_weights();

-- ---------------------------------------------------------------------------
-- Candidates. candidate_pii is the ONLY place personal details live.
-- ---------------------------------------------------------------------------
create table candidates (
  id               uuid primary key default gen_random_uuid(),
  role_applied     text not null check (role_applied in ('pm', 'spm')),
  redacted_cv_text text,
  cv_file_path     text,
  cv_file_name     text,
  status           text not null default 'processing'
                   check (status in ('processing', 'ready', 'error')),
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Server-only. Never read by the AI modules (see lib/pii, lib/ai/guard).
create table candidate_pii (
  candidate_id uuid primary key references candidates (id) on delete cascade,
  name         text,
  email        text,
  phone        text,
  linkedin_url text,
  github_url   text,
  other_urls   text[] not null default '{}',
  address      text,
  raw_cv_text  text not null,           -- unredacted extraction, for re-redaction after edits
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Scoring. One "totals" row per scoring run per role; old runs are kept
-- (is_current = false) so history stays traceable to the rubric version.
-- ---------------------------------------------------------------------------
create table totals (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  role         text not null check (role in ('pm', 'spm')),
  rubric_id    uuid not null references rubrics (id),
  total        numeric(5,1) not null check (total between 0 and 100),
  above_line   boolean not null default false,
  is_current   boolean not null default true,
  model        text not null,
  created_at   timestamptz not null default now()
);
create unique index totals_one_current on totals (candidate_id, role) where is_current;
create index totals_ranking on totals (role, total desc) where is_current;

create table scores (
  id           uuid primary key default gen_random_uuid(),
  total_id     uuid not null references totals (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  rubric_id    uuid not null references rubrics (id),
  criterion_id uuid not null references criteria (id),
  score        int  not null check (score between 0 and 3),
  model_score  int  not null check (model_score between 0 and 3), -- before the SPM gate
  gated        boolean not null default false,
  reason       text not null,
  unique (total_id, criterion_id)
);

create table briefs (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  role         text not null check (role in ('pm', 'spm')),
  total_id     uuid not null references totals (id) on delete cascade,
  text         text not null,
  created_at   timestamptz not null default now(),
  unique (candidate_id, role)
);

-- ---------------------------------------------------------------------------
-- Emails. At most one open draft and at most one sent email per candidate —
-- the second index makes a double-send impossible at the database level.
-- ---------------------------------------------------------------------------
create table emails (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  type         text not null check (type in ('invite', 'rejection')),
  subject      text not null,
  body         text not null,
  status       text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  sent_at      timestamptz,
  resend_id    text,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index emails_one_draft on emails (candidate_id) where status = 'draft';
create unique index emails_one_sent on emails (candidate_id) where status in ('sending', 'sent');

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table settings (
  id               int primary key default 1 check (id = 1),
  pm_threshold     numeric(5,1) not null default 60 check (pm_threshold between 0 and 100),
  spm_threshold    numeric(5,1) not null default 60 check (spm_threshold between 0 and 100),
  top_n            int not null default 5 check (top_n between 0 and 50),
  company_name     text not null default 'Kargo',
  sender_name      text not null default 'Kargo Hiring',
  reply_to         text not null default 'founder@example.com',
  signature        text not null default E'Best,\nFounder, Kargo\nMumbai',
  invite_next_step text not null default 'Please reply with two or three 45-minute slots that work for you over the next week, and we will send a calendar invite.',
  jd_pm            text not null default 'Product Manager at Kargo (logistics software, Mumbai). Owns product for freight and customs workflows; works directly with carriers, customs brokers, ports and client operations teams; ships features that keep shipments moving.',
  jd_spm           text not null default 'Senior Product Manager at Kargo (logistics software, Mumbai). Owns a product area end to end across freight, customs and client operations; leads outside-party relationships, sets up processes that outlast incidents, and mentors PMs.',
  updated_at       timestamptz not null default now()
);
insert into settings (id) values (1);

-- ---------------------------------------------------------------------------
-- AI request audit log: what was sent (redacted), and the PII check result.
-- ---------------------------------------------------------------------------
create table ai_requests (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid references candidates (id) on delete set null,
  purpose        text not null,
  model          text not null,
  payload        text not null,
  payload_sha256 text not null,
  pii_check      text not null check (pii_check in ('passed', 'blocked')),
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Functions (called from lib/pipeline.ts)
-- ---------------------------------------------------------------------------

-- Atomically retire the previous scoring run for (candidate, role) and record
-- the new one. above_line is derived from the current threshold.
create or replace function record_scoring(
  p_candidate uuid, p_role text, p_rubric uuid, p_total numeric, p_model text, p_scores jsonb
) returns uuid
language plpgsql as $fn$
declare
  tid uuid;
  line numeric;
begin
  select case p_role when 'pm' then pm_threshold else spm_threshold end into line from settings where id = 1;
  update totals set is_current = false where candidate_id = p_candidate and role = p_role and is_current;
  insert into totals (candidate_id, role, rubric_id, total, above_line, model)
  values (p_candidate, p_role, p_rubric, p_total, p_total >= line, p_model)
  returning id into tid;
  insert into scores (total_id, candidate_id, rubric_id, criterion_id, score, model_score, gated, reason)
  select tid, p_candidate, p_rubric, (s->>'criterion_id')::uuid, (s->>'score')::int,
         (s->>'model_score')::int, (s->>'gated')::boolean, s->>'reason'
  from jsonb_array_elements(p_scores) s;
  return tid;
end;
$fn$;

-- Re-derive above_line for all current totals after a threshold change.
create or replace function recompute_lines() returns void
language sql as $fn$
  update totals t
     set above_line = t.total >= case t.role when 'pm' then s.pm_threshold else s.spm_threshold end
    from settings s
   where s.id = 1 and t.is_current;
$fn$;

-- ---------------------------------------------------------------------------
-- Seed: rubric v1 (rubric.txt)
-- ---------------------------------------------------------------------------
do $seed$
declare
  guide text := $g$0 = No instance
1 = Instance claimed but missing the named party or the stated result
2 = Meets the "strong" description
3 = Meets the "strong" description more than once, in different contexts

To score an SPM candidate on a criterion, first check they meet the PM description in full. Then apply the additional SPM bar.$g$;
  pm uuid;
  spm uuid;
begin
  insert into rubrics (role, version, active, scoring_guide) values ('pm', 1, true, guide) returning id into pm;
  insert into rubrics (role, version, active, scoring_guide) values ('spm', 1, true, guide) returning id into spm;

  -- PRODUCT MANAGER ---------------------------------------------------------
  insert into criteria (rubric_id, position, name, source_evidence, strong_description, weak_description, spm_extra_bar, weight) values
  (pm, 1, 'Got a yes from someone they couldn''t instruct',
$t$- Sunita: "Liaised with Customs Preventive and Audit teams during two shipment-level inspections; both closed without penalties."
- Lavanya: "renegotiated rates with 2 underperforming carriers based on data."
- Meghna: "coordinated directly with the CHA and customs officer through the night to resolve before the client became aware."
- Rohan: "Coordinated daily with shipping lines, ICD terminal operators, port authorities, and customs officials on clearance timelines and holds."
- Aditya: handled "invoice disputes, berth allocation escalations, container detention negotiations" directly with clients.$t$,
$t$At least one bullet contains all three of these parts:
1. A named outside organisation that is neither the candidate's employer nor a vendor they pay, such as customs, a carrier, a port, a regulator or a client's department.
2. What the candidate asked that organisation for.
3. What the organisation did as a result, such as a hold cleared, a rate cut, an inspection closed without penalty, or a dispute settled.
Example: "Renegotiated rates with 2 underperforming carriers using scorecard data."$t$,
$t$The outside contact is only information-gathering, or the other party is internal or paid:
- Vikram: "40+ user interviews across 6 enterprise accounts." These were research conversations; no one had to agree to anything.
- Vikram: "managed competing stakeholder priorities across customer success, sales, and engineering." These are internal colleagues.
- Rahul: "external agency management." He was paying and directing them.
A bullet that says "liaised with" or "coordinated with" an outside party but states no result scores 1, not 2.$t$,
  null, 34),

  (pm, 2, 'Stayed the named contact until closure',
$t$- Meghna: "wrote the internal bug report, coordinated with PM and engineering, and managed customer communication throughout the 6-week resolution cycle."
- Lavanya: "coordinated across the client's procurement, warehousing, and finance teams over 8 weeks; first shipment on time."
- Sunita: "scoped the project, managed the vendor relationship, ran staff training, and monitored the first 30 days of go-live."$t$,
$t$A bullet that gives all three of these:
1. How long the episode ran, such as "over 8 weeks" or "throughout the 6-week cycle."
2. The end point, such as "first shipment on time," "resolved" or "first 30 days of go-live."
3. The candidate's own contact role across that whole period, for example "managed customer communication throughout" or "monitored."$t$,
$t$Bullets that describe only the start or only the output, with no duration and no closing event. Examples are "Led onboarding for new accounts" and "Took full ownership of 4 features from spec to release." Vikram's line has an end point but no outside party kept informed throughout, so it scores 1.$t$,
  null, 27),

  (pm, 3, 'Caught the disruption before the customer felt it',
$t$- Sunita: "When the company's FMS vendor changed their data export format without notice, independently redesigned the team's documentation intake and filing workflow over a weekend to ensure no disruption."
- Meghna: resolved a 7pm customs hold "before the client became aware - shipment departed on schedule."
- Rohan: "Led migration from a legacy third-party data vendor after identifying reliability issues - completed under time pressure with no data loss."$t$,
$t$A bullet with two parts:
1. An unplanned trigger, such as "without notice," a hold, an outage, a departing colleague or a volume spike.
2. The result phrased as harm avoided for someone downstream, such as "no disruption," "before the client became aware," "no data loss," "no churn during that period" or "departed on schedule."$t$,
$t$- All planned work. Vikram's and Rahul's CVs contain only features, redesigns and campaigns.
- An unplanned fix whose result is stated only as an internal number. Preetham wrote "patched and deployed within 48 hours" and "average time-to-resolve for P1 incidents: 22 minutes." Neither line says what merchants or customers were spared. This scores 1.$t$,
  null, 24),

  (pm, 4, 'Fixed it with what was already in the room',
$t$- Rohan: 18 months of higher documentation volume, "no additional headcount added, managed through process redesign."
- Meghna: "Covered for a departing CSM's book of 8 additional accounts for 3 months without additional headcount - no churn during that period."
- Sunita: redesigned the workflow "over a weekend."$t$,
$t$An unplanned-disruption bullet, the kind that meets Criterion 3, that also says one of these things:
- No headcount was added.
- The fix happened outside planned time, such as "over a weekend" or "through the night."
- The problem was handled by changing how existing people worked, such as "managed through process redesign."$t$,
$t$- The response involved adding resources. Rahul wrote "hired and onboarded a content lead, a growth analyst, a designer, and an events manager." That is a strong line for other purposes but the opposite of this criterion.
- A disruption bullet that says nothing about how it was resourced. This scores 1.$t$,
  null, 15);

  -- SENIOR PRODUCT MANAGER --------------------------------------------------
  insert into criteria (rubric_id, position, name, source_evidence, strong_description, weak_description, spm_extra_bar, weight) values
  (spm, 1, 'Got a yes from someone they couldn''t instruct',
$t$The PM sources, plus:
- Lavanya: "Ran a quarterly carrier performance review process for the first time at the branch - developed scorecard methodology... and renegotiated rates." She set up the conversation herself. No one had assigned a renegotiation.
- Sunita: "Conducted a DGFT compliance audit... ahead of a departmental inspection - identified and resolved four documentation gaps in advance; client passed inspection without any observations raised." A bad outcome would have been a regulatory finding against the client.$t$,
$t$Everything in the PM version, plus all of the following:
1. At least two such episodes with different outside organisations.
2. In at least one episode, the CV shows the candidate created the occasion, with wording such as "for the first time," "ahead of" or "after identifying."
3. The CV names what failure would have cost, such as a penalty, a lost client or a missed shipment window.
Example: Lavanya's scorecard leading to a carrier renegotiation.$t$,
$t$- One strong episode that happened because of the job, such as an inspection they were assigned to handle or a renewal that came due. This scores 2 at most.
- Any of the PM weak forms. These score 0 to 1.$t$,
$t$1. At least two such episodes with different outside organisations.
2. In at least one episode, the CV shows the candidate created the occasion, with wording such as "for the first time," "ahead of" or "after identifying."
3. The CV names what failure would have cost, such as a penalty, a lost client or a missed shipment window.$t$,
  26),

  (spm, 2, 'Stayed the named contact until closure',
$t$The PM sources, plus:
- Lavanya: "Drafted and sent the post-mortem after a 4-hour platform outage - wrote the internal and customer-facing versions, ran the retrospective, and owned the follow-up action items to closure."
- Meghna: "wrote the internal bug report, coordinated with PM and engineering, and managed customer communication throughout."
In both cases the same person handled the internal fix and the outside party's communication, then closed the follow-ups.$t$,
$t$Everything in the PM version, plus both of the following in the same episode:
1. The candidate personally handled both sides. They ran the internal work (a bug report, retrospective or engineering coordination) and wrote or delivered the communication to the customer or outside party.
2. The bullet ends on a closing act the candidate did after the main event, such as "owned the follow-up action items to closure," "monitored the first 30 days" or "retained permanently."$t$,
$t$- One side only. The candidate did only the internal fix or only the customer communication. Preetham's P1 on-call resolution is an example.
- An episode that ends at launch or resolution with no follow-up. Vikram's "Managed QA handoff, release communication, and post-launch tracking" covers both sides but is internal only, so it scores 1.$t$,
$t$Both of the following in the same episode:
1. The candidate personally handled both sides. They ran the internal work (a bug report, retrospective or engineering coordination) and wrote or delivered the communication to the customer or outside party.
2. The bullet ends on a closing act the candidate did after the main event, such as "owned the follow-up action items to closure," "monitored the first 30 days" or "retained permanently."$t$,
  35),

  (spm, 3, 'Caught the disruption before the customer felt it',
$t$- Sunita: the vendor changed its format "without notice."
- Meghna: a customs hold arose at 7pm before a critical shipment window.
- Rohan: a third-party data vendor had reliability issues.
In all three, the cause sat outside the candidate's own company.$t$,
$t$Everything in the PM version, where the bullet names an outside origin such as a vendor, customs, a carrier or a port. The stated harm avoided must also be to a named downstream party, such as a client, a shipment or a team.$t$,
$t$- The disruption came from inside the candidate's own team or system. Lavanya's outage post-mortem and Preetham's coupon bug are examples. These score 2 at most.
- An assigned on-call response. This scores 1 at most.$t$,
$t$The bullet names an outside origin such as a vendor, customs, a carrier or a port. The stated harm avoided must also be to a named downstream party, such as a client, a shipment or a team.$t$,
  21),

  (spm, 4, 'Fixed it with what was already in the room',
$t$- Sunita: "the updated process was retained permanently by the team."
- Rohan: "no additional headcount added, managed through process redesign" across 18 months, not a single night.
The workaround became the way the team worked from then on.$t$,
$t$Everything in the PM version, plus the bullet says the no-added-resource fix outlasted the incident. Wording to look for includes "retained permanently," "adopted," or a period longer than the incident itself, such as "over 18 months" or "for 3 months."$t$,
$t$A one-off heroic fix with no statement of what happened afterwards. An example is Meghna's overnight customs fix taken on its own, which scores 2. It would score 3 only if paired with a sustained line like her 3-month account cover.$t$,
$t$The bullet says the no-added-resource fix outlasted the incident. Wording to look for includes "retained permanently," "adopted," or a period longer than the incident itself, such as "over 18 months" or "for 3 months."$t$,
  18);
end;
$seed$;
