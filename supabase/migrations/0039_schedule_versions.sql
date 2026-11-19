-- Each issue of the contractor's schedule, kept: what the schedule said once that issue was
-- read in, and what it changed from the one before. Additive — one new table.
create table if not exists schedule_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  label       text,
  issued_on   date not null default current_date,
  -- The whole schedule as it stood after this issue: [{name, is_heading, starts_on, ends_on, percent}]
  snapshot    jsonb not null default '[]'::jsonb,
  -- What this issue changed: [{name, kind, ...}] (src/lib/scheduleVersions.ts)
  changes     jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists schedule_versions_project on schedule_versions (project_id, issued_on desc, created_at desc);
alter table schedule_versions enable row level security;
drop policy if exists member_rows on schedule_versions;
create policy member_rows on schedule_versions for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on schedule_versions to authenticated;
notify pgrst, 'reload schema';
