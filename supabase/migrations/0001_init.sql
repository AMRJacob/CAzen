-- CAzen — initial schema
-- Core rule: uploaded files are never overwritten or deleted.
-- A "sheet" or "spec section" is a slot; each upload adds a new revision row.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Projects and people
-- ---------------------------------------------------------------
create table projects (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,          -- AMR project number, e.g. 2025-014
  name            text not null,
  owner_name      text,
  contractor_name text,
  address         text,
  status          text not null default 'active' check (status in ('active','closed','archived')),
  created_at      timestamptz not null default now()
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','architect','consultant','contractor','owner')),
  primary key (project_id, user_id)
);

-- Outside companies/contacts (consultants, subs) — no login required in MVP
create table contacts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  company    text not null,
  name       text,
  email      text,
  discipline text            -- structural, MEP, civil, GC, owner...
);

-- ---------------------------------------------------------------
-- Document control: sets, sheets, spec sections, revisions
-- ---------------------------------------------------------------

-- An "issuance" is the event that brought revisions in: bid set, addendum, ASI, bulletin, CCD...
create table issuances (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null check (kind in ('bid_set','conformed_set','addendum','asi','bulletin','ccd','change_order','other')),
  number      text,                 -- "Addendum 2", "ASI-007"
  title       text,
  issued_on   date not null default current_date,
  source_file text,                 -- storage path of the original combined PDF
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- Drawing sheet slot (e.g. A-201). Current revision = latest by issued_on/revision_index.
create table sheets (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  number      text not null,        -- A-201
  title       text,                 -- FLOOR PLAN - LEVEL 2
  discipline  text,                 -- derived from prefix: A, S, M, E, P, C...
  is_void     boolean not null default false,   -- sheet deleted from the set (kept for history)
  unique (project_id, number)
);

create table sheet_revisions (
  id             uuid primary key default gen_random_uuid(),
  sheet_id       uuid not null references sheets(id) on delete cascade,
  issuance_id    uuid not null references issuances(id),
  revision_index int  not null,     -- 0 = original, 1, 2...
  revision_label text,              -- what the titleblock says: "1", "A", "Δ2"
  title_at_rev   text,
  file_path      text not null,     -- storage: documents/{project}/sheets/{sheet}/{rev}.pdf
  page_count     int not null default 1,
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (sheet_id, revision_index)
);

-- Project manual: one slot per spec section (e.g. 08 71 00)
create table spec_sections (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  number      text not null,        -- 08 71 00
  title       text,                 -- DOOR HARDWARE
  division    text generated always as (left(number, 2)) stored,
  is_void     boolean not null default false,
  unique (project_id, number)
);

create table spec_revisions (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references spec_sections(id) on delete cascade,
  issuance_id    uuid not null references issuances(id),
  revision_index int not null,
  file_path      text not null,
  page_start     int,               -- pages in the original manual, for reference
  page_end       int,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (section_id, revision_index)
);

-- "What was current on date X" — the conformed set as of any day
create or replace function sheets_as_of(p_project uuid, p_date date)
returns table (sheet_number text, sheet_title text, revision_index int, file_path text, issued_on date)
language sql stable as $$
  select distinct on (s.id)
         s.number, coalesce(r.title_at_rev, s.title), r.revision_index, r.file_path, i.issued_on
  from sheets s
  join sheet_revisions r on r.sheet_id = s.id
  join issuances i on i.id = r.issuance_id
  where s.project_id = p_project and i.issued_on <= p_date
  order by s.id, i.issued_on desc, r.revision_index desc
$$;

-- ---------------------------------------------------------------
-- Contract library
-- ---------------------------------------------------------------
create table contract_documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null check (kind in ('owner_contractor','owner_architect','general_conditions','supplementary_conditions','bond','insurance','other')),
  title       text not null,
  executed_on date,
  file_path   text not null,
  is_locked   boolean not null default true,   -- read-only once executed
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- CA documents: ASI, PR, RFI, CCD, CO, field reports, punch lists...
-- ---------------------------------------------------------------
create table ca_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  kind         text not null check (kind in ('rfi','asi','pr','ccd','co','field_report','punch_list','substantial_completion','other')),
  seq          int  not null,                  -- auto-numbered per project + kind
  title        text not null,
  status       text not null default 'draft' check (status in ('draft','open','issued','answered','closed','void')),
  question     text,                           -- RFI question / PR description
  response     text,                           -- architect response
  received_on  date,
  due_on       date,
  issued_on    date,
  from_contact uuid references contacts(id),
  cost_impact  text,
  time_impact  text,
  issuance_id  uuid references issuances(id),  -- an ASI that revises sheets links here
  output_file  text,                           -- generated AMR-branded PDF
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (project_id, kind, seq)
);

-- Which sheets/sections a CA document references or revises
create table ca_document_refs (
  ca_document_id uuid not null references ca_documents(id) on delete cascade,
  sheet_id       uuid references sheets(id),
  section_id     uuid references spec_sections(id),
  check (sheet_id is not null or section_id is not null)
);

create table ca_attachments (
  id             uuid primary key default gen_random_uuid(),
  ca_document_id uuid not null references ca_documents(id) on delete cascade,
  file_path      text not null,
  label          text,
  created_at     timestamptz not null default now()
);

-- Auto-number ca_documents per project + kind
create or replace function next_ca_seq() returns trigger language plpgsql as $$
begin
  if new.seq is null then
    select coalesce(max(seq), 0) + 1 into new.seq
    from ca_documents where project_id = new.project_id and kind = new.kind;
  end if;
  return new;
end $$;
create trigger ca_documents_seq before insert on ca_documents
  for each row execute function next_ca_seq();

-- ---------------------------------------------------------------
-- Submittals
-- ---------------------------------------------------------------
create table submittals (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  section_id   uuid references spec_sections(id),
  number       text not null,           -- 08 71 00-001
  title        text not null,
  type         text check (type in ('product_data','shop_drawings','samples','calcs','closeout','other')),
  status       text not null default 'pending' check (status in ('pending','in_review','returned','closed')),
  created_at   timestamptz not null default now(),
  unique (project_id, number)
);

-- Each receipt (original or resubmittal) is a cycle: 001, 001.1, 001.2
create table submittal_cycles (
  id             uuid primary key default gen_random_uuid(),
  submittal_id   uuid not null references submittals(id) on delete cascade,
  cycle          int  not null,          -- 0 = original, 1 = first resubmittal...
  received_on    date not null default current_date,
  due_on         date,
  returned_on    date,
  action         text check (action in ('no_exceptions','exceptions_noted','revise_resubmit','rejected','for_record')),
  comments       text,
  reviewer       uuid references auth.users(id),
  received_file  text not null,          -- contractor's PDF as received
  returned_file  text,                   -- cover sheet + stamped package returned
  unique (submittal_id, cycle)
);

-- Consultant routing for a cycle
create table submittal_reviews (
  id          uuid primary key default gen_random_uuid(),
  cycle_id    uuid not null references submittal_cycles(id) on delete cascade,
  contact_id  uuid not null references contacts(id),
  sent_on     date,
  due_on      date,
  returned_on date,
  action      text,
  comments    text,
  file_path   text
);

-- ---------------------------------------------------------------
-- Branding templates (letterhead, cover sheet, form layouts)
-- ---------------------------------------------------------------
create table templates (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null unique check (kind in ('letterhead','titleblock','submittal_cover','asi','pr','rfi_response','field_report')),
  file_path  text not null,      -- storage: templates/{kind}.pdf
  field_map  jsonb not null default '{}'::jsonb,   -- where each field prints (x, y, size)
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('documents', 'documents', false),
  ('templates', 'templates', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Row-level security: members see only their projects (MVP = AMR staff)
-- ---------------------------------------------------------------
alter table projects           enable row level security;
alter table project_members    enable row level security;
alter table contacts           enable row level security;
alter table issuances          enable row level security;
alter table sheets             enable row level security;
alter table sheet_revisions    enable row level security;
alter table spec_sections      enable row level security;
alter table spec_revisions     enable row level security;
alter table contract_documents enable row level security;
alter table ca_documents       enable row level security;
alter table ca_document_refs   enable row level security;
alter table ca_attachments     enable row level security;
alter table submittals         enable row level security;
alter table submittal_cycles   enable row level security;
alter table submittal_reviews  enable row level security;
alter table templates          enable row level security;

create or replace function is_member(p_project uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from project_members where project_id = p_project and user_id = auth.uid())
$$;

create policy member_projects on projects for all using (is_member(id));
create policy own_membership  on project_members for select using (user_id = auth.uid());
create policy member_rows on contacts           for all using (is_member(project_id));
create policy member_rows on issuances          for all using (is_member(project_id));
create policy member_rows on sheets             for all using (is_member(project_id));
create policy member_rows on spec_sections      for all using (is_member(project_id));
create policy member_rows on contract_documents for all using (is_member(project_id));
create policy member_rows on ca_documents       for all using (is_member(project_id));
create policy member_rows on submittals         for all using (is_member(project_id));
create policy member_rows on sheet_revisions for all
  using (is_member((select project_id from sheets where id = sheet_id)));
create policy member_rows on spec_revisions for all
  using (is_member((select project_id from spec_sections where id = section_id)));
create policy member_rows on ca_document_refs for all
  using (is_member((select project_id from ca_documents where id = ca_document_id)));
create policy member_rows on ca_attachments for all
  using (is_member((select project_id from ca_documents where id = ca_document_id)));
create policy member_rows on submittal_cycles for all
  using (is_member((select project_id from submittals where id = submittal_id)));
create policy member_rows on submittal_reviews for all
  using (is_member((select s.project_id from submittals s join submittal_cycles c on c.submittal_id = s.id where c.id = cycle_id)));
create policy signed_in_read on templates for select using (auth.uid() is not null);

-- Revisions are append-only: no updates to file paths, no deletes
create policy no_delete on sheet_revisions as restrictive for delete using (false);
create policy no_delete on spec_revisions  as restrictive for delete using (false);

-- Storage: signed-in AMR staff can read and add files; nobody deletes through the app
create policy staff_read on storage.objects for select to authenticated
  using (bucket_id in ('documents','templates'));
create policy staff_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('documents','templates'));

-- Make the API see new tables and functions immediately
notify pgrst, 'reload schema';
