-- How sure we are of the candidate's name. Nothing is sent to the AI unless it is
-- 'confident' (corroborated by the file name, a profile/email handle, or the
-- contact-block layout) or 'confirmed' (saved by the founder on the candidate page).
alter table candidate_pii
  add column name_status text not null default 'unconfirmed'
  check (name_status in ('confident', 'unconfirmed', 'confirmed'));
