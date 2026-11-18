-- The project manual: the specifications, kept the way the drawings are kept.
-- (Applied in two parts; see 0023 and 0024 in the Supabase migration history.)
alter table spec_revisions add column if not exists revision_label text;
alter table spec_revisions add column if not exists title_at_rev text;
alter table spec_revisions add column if not exists pages int;
alter table spec_revisions add column if not exists bytes bigint;
alter table spec_sections add column if not exists sort_key text;
update spec_sections set sort_key = number where sort_key is null;

create table if not exists spec_text (
  revision_id  uuid primary key references spec_revisions(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  body         text not null,
  tsv          tsvector generated always as (to_tsvector('english', body)) stored
);
create index if not exists spec_text_tsv_idx on spec_text using gin (tsv);
create index if not exists spec_text_project_idx on spec_text (project_id);
alter table spec_text enable row level security;
create policy member_read on spec_text for select using (is_member(project_id));
create policy member_add  on spec_text for insert with check (is_member(project_id));
create policy member_edit on spec_text for update using (is_member(project_id)) with check (is_member(project_id));
