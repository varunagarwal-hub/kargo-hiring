-- Not fit for PM means not fit for SPM: a candidate is above the SPM line only if
-- they are also above the PM line. Applied when scores are recorded and whenever
-- the lines change in Settings. (The pipeline records PM before SPM.)

create or replace function record_scoring(
  p_candidate uuid, p_role text, p_rubric uuid, p_total numeric, p_model text, p_scores jsonb
) returns uuid
language plpgsql as $fn$
declare
  tid uuid;
  line numeric;
  above boolean;
begin
  select case p_role when 'pm' then pm_threshold else spm_threshold end into line from settings where id = 1;
  above := p_total >= line;
  if p_role = 'spm' then
    above := above and exists (
      select 1 from totals t, settings s
       where s.id = 1 and t.candidate_id = p_candidate and t.role = 'pm' and t.is_current and t.total >= s.pm_threshold
    );
  end if;
  update totals set is_current = false where candidate_id = p_candidate and role = p_role and is_current;
  insert into totals (candidate_id, role, rubric_id, total, above_line, model)
  values (p_candidate, p_role, p_rubric, p_total, above, p_model)
  returning id into tid;
  insert into scores (total_id, candidate_id, rubric_id, criterion_id, score, model_score, gated, reason)
  select tid, p_candidate, p_rubric, (s->>'criterion_id')::uuid, (s->>'score')::int,
         (s->>'model_score')::int, (s->>'gated')::boolean, s->>'reason'
  from jsonb_array_elements(p_scores) s;
  return tid;
end;
$fn$;

create or replace function recompute_lines() returns void
language plpgsql as $fn$
begin
  update totals t
     set above_line = t.total >= s.pm_threshold
    from settings s
   where s.id = 1 and t.is_current and t.role = 'pm';
  update totals t
     set above_line = t.total >= s.spm_threshold and exists (
           select 1 from totals p where p.candidate_id = t.candidate_id and p.role = 'pm' and p.is_current and p.above_line)
    from settings s
   where s.id = 1 and t.is_current and t.role = 'spm';
end;
$fn$;
