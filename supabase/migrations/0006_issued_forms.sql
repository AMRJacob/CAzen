-- CAzen: every form issued from CAzen is kept with its project.
-- Gives a log per form type, the next number in sequence, and values to carry forward.

create table issued_forms (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null check (kind in ('submittal_cover','asi','rfi_response','pr','ccd','field_report')),
  number      text,                       -- e.g. ASI-004, 09 30 00 - 002
  title       text,                       -- subject / description, for the log
  values      jsonb not null default '{}'::jsonb,
  file_path   text,                       -- documents/{project_id}/forms/{id}.pdf
  issued_by   uuid references auth.users(id),
  issued_at   timestamptz not null default now()
);

create index issued_forms_project_kind_idx on issued_forms (project_id, kind, issued_at desc);

alter table issued_forms enable row level security;
create policy member_read on issued_forms for select using (is_member(project_id));
create policy member_add  on issued_forms for insert with check (is_member(project_id));
-- Issued documents are a record: no edits or deletes from the app.

notify pgrst, 'reload schema';
