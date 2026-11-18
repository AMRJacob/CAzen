-- CAzen: notes pads.
--
-- A page you write on by hand during a meeting or a site visit, before there is a document to
-- write. The typed meeting notes or field report come later and are written from it; the
-- handwriting stays, because what somebody actually wrote in the room is the record of the
-- room and a typed summary is not a substitute for it.
--
-- A pad is several pages, and a page holds marks: strokes of ink and boxes of typed text.
-- Every mark is its own row, which is what lets two people write on the same pad at once —
-- they are never editing the same row, so there is nothing to merge.

create table if not exists note_pads (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null check (kind in ('meeting_notes', 'field_report')),
  title       text,
  noted_on    date not null default current_date,
  pages       integer not null default 1 check (pages between 1 and 200),
  issued_id   uuid references ca_documents(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists note_pads_project on note_pads (project_id, kind, noted_on desc);

create table if not exists pad_marks (
  id         uuid primary key default gen_random_uuid(),
  pad_id     uuid not null references note_pads(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  page       integer not null default 1,
  kind       text not null check (kind in ('ink', 'highlight', 'text')),
  geometry   jsonb not null,
  style      jsonb not null default '{}'::jsonb,
  body       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pad_marks_pad on pad_marks (pad_id, page, created_at);

alter table note_pads enable row level security;
alter table pad_marks enable row level security;

drop policy if exists member_rows on note_pads;
drop policy if exists member_rows on pad_marks;
create policy member_rows on note_pads for all using (is_member(project_id)) with check (is_member(project_id));
create policy member_rows on pad_marks for all using (is_member(project_id)) with check (is_member(project_id));

-- So several people see each other's ink as it is drawn.
alter publication supabase_realtime add table pad_marks;
