-- CAzen Phase 1: project creation, membership, sheet register helpers
-- Run once in Supabase SQL Editor after 0001_init.sql.

-- A new project's creator must become its admin in the same step, otherwise
-- row-level security hides the project from them. This function does both.
create or replace function create_project(
  p_number text,
  p_name text,
  p_owner_name text default null,
  p_contractor_name text default null,
  p_address text default null
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  new_project projects;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  insert into projects (number, name, owner_name, contractor_name, address)
  values (p_number, p_name, p_owner_name, p_contractor_name, p_address)
  returning * into new_project;

  insert into project_members (project_id, user_id, role)
  values (new_project.id, auth.uid(), 'admin');

  return new_project;
end $$;

grant execute on function create_project(text, text, text, text, text) to authenticated;

-- Current revision of every sheet, plus how many revisions it has.
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
  (select count(*) from sheet_revisions x where x.sheet_id = s.id) as revision_count
from sheets s
join sheet_revisions r on r.sheet_id = s.id
join issuances i on i.id = r.issuance_id
order by s.id, i.issued_on desc, r.revision_index desc;

grant select on current_sheets to authenticated;
