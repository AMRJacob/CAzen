-- The people on a job, kept once: who signs in at a site visit or sits in a meeting is mostly
-- the same handful every time, so they are chosen from here and not retyped.
create table if not exists project_people (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  company     text,
  phone       text,
  email       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists project_people_project on project_people (project_id, name);

alter table project_people enable row level security;
drop policy if exists member_rows on project_people;
create policy member_rows on project_people for all
  using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on project_people to authenticated;

notify pgrst, 'reload schema';
