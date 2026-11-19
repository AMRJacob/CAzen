-- A firm's own issue tags, added to the built-in ones (src/lib/tags.ts). A tag is a trade and
-- a short label; its colour is the trade's unless one is given.
--
-- NOT YET APPLIED to production as of 2026-11-19: the confirmation was cancelled by the client
-- twice and then timed out unanswered. Until it is, the app offers the built-in tags only.
-- The same pending step adds where a notebook page was: a site visit's or a meeting's location.
alter table site_visits add column if not exists location text;

create table if not exists observation_tags (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references firms(id) on delete cascade,
  trade      text not null,
  label      text not null,
  colour     text,
  created_at timestamptz not null default now(),
  unique (firm_id, trade, label)
);
alter table observation_tags enable row level security;
drop policy if exists firm_read on observation_tags;
drop policy if exists firm_add on observation_tags;
drop policy if exists firm_edit on observation_tags;
drop policy if exists firm_drop on observation_tags;
create policy firm_read on observation_tags for select using (is_firm_member(firm_id));
create policy firm_add on observation_tags for insert with check (is_firm_member(firm_id));
create policy firm_edit on observation_tags for update using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy firm_drop on observation_tags for delete using (is_firm_member(firm_id));
grant select, insert, update, delete on observation_tags to authenticated;
notify pgrst, 'reload schema';
