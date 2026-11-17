-- CAzen: markups, and the beginnings of punch lists.
--
--  * Markups belong to the SHEET, not to the revision they were drawn on. A note about a detail is
--    about that detail, and it should still be there when the sheet is reissued. The revision it
--    was drawn on is recorded alongside, so it can be said when a markup predates what is on screen
--    and so a markup can be carried forward deliberately rather than by accident.
--
--  * Geometry is kept as fractions of the page (0–1 from the top left), the same as sheet_links and
--    the title block templates. A sheet reissued at a different paper size still puts the markup
--    where it belongs, and nothing has to be redrawn when the viewer zooms.
--
--  * Scale is per sheet: two points picked on the drawing and the real distance between them. That
--    is what a dimension tool measures against, and it is a property of the drawing rather than of
--    any one markup.
--
--  * Punch items are a separate thing that happens to live on sheets. They are numbered within a
--    list, they carry a status, and they keep the rectangle of the sheet they are about so the
--    document can show a clip of it. They are deliberately not markups: a punch item is a record
--    with a life of its own, and it shows on a sheet as a layer that can be turned off.

create table if not exists sheet_markups (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references sheets(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  -- The revision it was drawn on: provenance, and what "copy forward" copies from.
  revision_id  uuid references sheet_revisions(id) on delete set null,
  -- ink | line | arrow | rect | cloud | text | dimension
  kind         text not null,
  -- Shape-dependent, all in page fractions:
  --   ink        { "points": [[x,y], …] }
  --   line/arrow { "from": [x,y], "to": [x,y] }
  --   rect/cloud { "x":…, "y":…, "w":…, "h":… }
  --   text       { "x":…, "y":…, "w":…, "h":… }
  --   dimension  { "from": [x,y], "to": [x,y] }
  geometry     jsonb not null,
  -- { "colour": "#c0392b", "width": 2 }
  style        jsonb not null default '{}'::jsonb,
  body         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sheet_markups_sheet_idx   on sheet_markups (sheet_id);
create index if not exists sheet_markups_project_idx on sheet_markups (project_id);

alter table sheet_markups enable row level security;
create policy member_read on sheet_markups for select using (is_member(project_id));
create policy member_add  on sheet_markups for insert with check (is_member(project_id));
-- Anyone on the project may move or retype a markup; only its author may remove it, so one person
-- cannot quietly delete another's note about a problem.
create policy member_edit on sheet_markups for update using (is_member(project_id)) with check (is_member(project_id));
create policy author_drop on sheet_markups for delete using (is_member(project_id) and created_by = auth.uid());

-- Two points on the sheet and what the distance between them really is, so a dimension can be read
-- in feet and inches rather than in page fractions.
alter table sheets add column if not exists scale jsonb;
comment on column sheets.scale is
  'How long the drawing really is: { "from": [x,y], "to": [x,y], "inches": 240 } in page fractions.';

create table if not exists punch_lists (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  observed_on date not null default current_date,
  closed      boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists punch_lists_project_idx on punch_lists (project_id, observed_on desc);

create table if not exists punch_items (
  id            uuid primary key default gen_random_uuid(),
  punch_list_id uuid not null references punch_lists(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  number        int  not null,
  -- Where it is. A punch item without a sheet is still an item; it just has no clip to show.
  sheet_id      uuid references sheets(id) on delete set null,
  revision_id   uuid references sheet_revisions(id) on delete set null,
  -- The piece of the sheet the document shows as a clip, in page fractions.
  region        jsonb,
  title         text not null,
  detail        text,
  -- open | ready | accepted | rejected
  status        text not null default 'open',
  trade         text,
  due_on        date,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (punch_list_id, number)
);
create index if not exists punch_items_list_idx  on punch_items (punch_list_id, number);
create index if not exists punch_items_sheet_idx on punch_items (sheet_id);

alter table punch_lists enable row level security;
alter table punch_items enable row level security;
create policy member_read on punch_lists for select using (is_member(project_id));
create policy member_add  on punch_lists for insert with check (is_member(project_id));
create policy member_edit on punch_lists for update using (is_member(project_id)) with check (is_member(project_id));
create policy admin_drop  on punch_lists for delete using (is_member(project_id));

create policy member_read on punch_items for select using (is_member(project_id));
create policy member_add  on punch_items for insert with check (is_member(project_id));
create policy member_edit on punch_items for update using (is_member(project_id)) with check (is_member(project_id));
create policy member_drop on punch_items for delete using (is_member(project_id));

notify pgrst, 'reload schema';
