-- Template: publish a new rubric version for ONE role.
-- Copy to db/migrations/000N_rubric_<role>_v<N>.sql, edit, then run `npm run migrate`.
-- Old scores keep pointing at the old version; re-score candidates from their page
-- to score them on the new one.
--
-- `npm run migrate` runs each file in one transaction and the weight check fires at
-- commit: if the new criteria do not sum to exactly 100, nothing changes.


-- 1. Retire the current version for this role.
update rubrics set active = false where role = 'pm' and active;

-- 2. Insert the new version (bump the number).
with r as (
  insert into rubrics (role, version, active, scoring_guide)
  values ('pm', 2, true,
$g$0 = No instance
1 = Instance claimed but missing the named party or the stated result
2 = Meets the "strong" description
3 = Meets the "strong" description more than once, in different contexts

To score an SPM candidate on a criterion, first check they meet the PM description in full. Then apply the additional SPM bar.$g$)
  returning id
)
-- 3. Its criteria. spm_extra_bar is null for PM, and required for SPM.
insert into criteria (rubric_id, position, name, source_evidence, strong_description, weak_description, spm_extra_bar, weight)
select r.id, c.position, c.name, c.source_evidence, c.strong_description, c.weak_description, c.spm_extra_bar, c.weight
from r, (values
  (1, 'Criterion one name',   $t$source lines$t$, $t$strong description$t$, $t$weak description$t$, null::text, 34),
  (2, 'Criterion two name',   $t$source lines$t$, $t$strong description$t$, $t$weak description$t$, null::text, 27),
  (3, 'Criterion three name', $t$source lines$t$, $t$strong description$t$, $t$weak description$t$, null::text, 24),
  (4, 'Criterion four name',  $t$source lines$t$, $t$strong description$t$, $t$weak description$t$, null::text, 15)
) as c(position, name, source_evidence, strong_description, weak_description, spm_extra_bar, weight);


-- Weight-only change (keeping the text)? Same pattern: copy the current rows with
-- new weights:
--   insert into criteria (...) select new_rubric_id, position, name, ..., <new weight>
--   from criteria where rubric_id = <old id>;
-- Note on SPM: its criteria are matched to PM criteria by position for the SPM gate.
