-- Filing a sheet under a discipline its number doesn't say.
--
-- A sheet's discipline is normally read from the letters in front of its number: A-101 is
-- architectural. That breaks for sheets numbered by something other than trade — a consultant's
-- own series, a detail book, a sheet numbered for the bid package it came in — and for those the
-- number cannot be changed, because the number is what is printed on the sheet and what everyone
-- on the job refers to. So filing is separated from numbering: filed_under, when set, decides
-- which discipline the sheet appears under, and the number is left exactly as issued.
alter table sheets add column if not exists filed_under text
  check (filed_under is null or filed_under ~ '^[A-Z]{1,3}$');

comment on column sheets.filed_under is
  'Discipline code this sheet is filed under, overriding the one read from its number. Null = use the number.';

create or replace view current_sheets with (security_invoker = true) as
select distinct on (s.id)
  s.id            as sheet_id,
  s.project_id,
  s.number,
  coalesce(r.title_at_rev, s.title) as title,
  s.discipline,
  s.is_void,
  r.id            as revision_id,
  r.revision_index,
  r.revision_label,
  r.file_path,
  i.kind          as issuance_kind,
  i.number        as issuance_number,
  i.issued_on,
  (select count(*) from sheet_revisions x where x.sheet_id = s.id) as revision_count,
  -- Last, because create-or-replace can only add view columns at the end.
  s.filed_under
from sheets s
join sheet_revisions r on r.sheet_id = s.id
join issuances i on i.id = r.issuance_id
order by s.id, i.issued_on desc, r.revision_index desc;

grant select on current_sheets to authenticated;

notify pgrst, 'reload schema';
