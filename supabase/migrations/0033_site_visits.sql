-- A page of the field-notes or meeting-notes book: one trip to the job (or one meeting), and
-- everything that came back from it.
--
-- A field report used to begin as a blank form. A visit begins on site: a pad written on by
-- hand, notes typed under the template's headings, photographs, and the observations made that
-- day. The report is written from the visit afterwards, and the visit goes on existing.
--
-- Observations are not copied or pointed at from here: a visit's observations are the ones seen
-- on its day, which is how the Observations page already groups them. The pad is its own record
-- (note_pads) and is linked, so deleting a visit never takes handwriting with it.

create table if not exists site_visits (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  -- Which notebook the page is in: a site visit, or a meeting (no photographs or observations).
  kind        text not null default 'visit' check (kind in ('visit', 'meeting')),
  visited_on  date not null default current_date,
  -- Arrival, as the clock on site read. Kept apart from the date so a visit can have a day
  -- and no time.
  visited_at  time,
  title       text,
  weather     text,
  -- Typed notes, as outline text beginning with the field report template's headings.
  notes       text,
  photos      text[] not null default '{}',
  cover_photo text,
  pad_id      uuid references note_pads(id) on delete set null,
  -- The field report written from this visit, once there is one.
  issued_id   uuid references issued_forms(id) on delete set null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists site_visits_project on site_visits (project_id, kind, visited_on desc);

alter table site_visits enable row level security;

drop policy if exists member_rows on site_visits;
create policy member_rows on site_visits for all
  using (is_member(project_id)) with check (is_member(project_id));

grant select, insert, update, delete on site_visits to authenticated;

notify pgrst, 'reload schema';
