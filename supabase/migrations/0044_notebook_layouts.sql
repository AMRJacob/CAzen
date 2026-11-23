-- Each person's arrangement of a notebook page: one per book (field notes, meeting notes) and per
-- kind of screen (desktop, tablet, phone). Only the person themself can read or change theirs.
-- Additive: one new table, and one new column on site_visits with an empty default.
create table if not exists notebook_layouts (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('visit', 'meeting')),
  device      text not null check (device in ('desktop', 'tablet', 'phone')),
  -- {v: 1, blocks: [{id, kind, x, y, w, h, title?}]} (src/lib/pageLayout.ts)
  layout      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind, device)
);
alter table notebook_layouts enable row level security;
drop policy if exists own_rows on notebook_layouts;
create policy own_rows on notebook_layouts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on notebook_layouts to authenticated;

-- What a page's added text boxes and checklists hold, keyed by the block's id.
alter table site_visits add column if not exists widgets jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
