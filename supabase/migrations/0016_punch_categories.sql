-- CAzen: punch items are numbered within a category, and no two items share a number.
--
-- W-1 is "working 1" and C-1 is "closeout 1": the letter says what kind of item it is, the number
-- counts within that kind, and the pair is what gets written on a wall and quoted in an email. So
-- the number is allocated per category per project and never reused, and the categories themselves
-- are the firm's to name — the two seeded here are a starting point, not a fixed list.
--
-- Items accumulate on one running list per project and close one at a time; each carries the date
-- it was observed. The punch list document is a report drawn from that, filtered.

create table if not exists punch_categories (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references firms(id) on delete cascade,
  -- The letter in front of the number: W, C, LS…
  code       text not null,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (firm_id, code)
);
create index if not exists punch_categories_firm_idx on punch_categories (firm_id, sort);

alter table punch_categories enable row level security;
create policy firm_read on punch_categories for select using (is_firm_member(firm_id));
create policy firm_add  on punch_categories for insert with check (is_firm_member(firm_id));
create policy firm_edit on punch_categories for update using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy admin_drop on punch_categories for delete using (is_firm_admin(firm_id));

-- A starting pair for every firm already here. Adding more is a normal part of using it.
insert into punch_categories (firm_id, code, name, sort)
select f.id, c.code, c.name, c.sort
from firms f
cross join (values ('W', 'Working', 0), ('C', 'Closeout', 1)) as c(code, name, sort)
on conflict (firm_id, code) do nothing;

alter table punch_items add column if not exists category_id uuid references punch_categories(id);
alter table punch_items add column if not exists observed_on date not null default current_date;
alter table punch_items add column if not exists area text;
-- The list a walk produced was the old shape; items now live on one running list per project and
-- are numbered within their category instead.
alter table punch_items alter column punch_list_id drop not null;
alter table punch_items drop constraint if exists punch_items_punch_list_id_number_key;
create unique index if not exists punch_items_number_idx on punch_items (project_id, category_id, number);

/**
 * The next free number in a category on a project. Taken inside the insert so two people adding
 * items at the same time can't both be handed the same number.
 */
create or replace function next_punch_number(p_project uuid, p_category uuid)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(max(number), 0) + 1
  from punch_items
  where project_id = p_project and category_id = p_category
$$;

create or replace function add_punch_item(
  p_project uuid, p_category uuid, p_title text, p_detail text default null,
  p_sheet uuid default null, p_revision uuid default null, p_region jsonb default null,
  p_trade text default null, p_area text default null, p_observed date default current_date
)
returns punch_items
language plpgsql
security definer
set search_path = public
as $$
declare
  made punch_items;
begin
  if not is_member(p_project) then
    raise exception 'not a member of this project';
  end if;
  insert into punch_items (project_id, category_id, number, title, detail, sheet_id, revision_id,
                           region, trade, area, observed_on, created_by)
  values (p_project, p_category, next_punch_number(p_project, p_category), p_title, p_detail,
          p_sheet, p_revision, p_region, p_trade, p_area, p_observed, auth.uid())
  returning * into made;
  return made;
end;
$$;

notify pgrst, 'reload schema';

-- Neither of these is anything for a signed-out caller to reach. add_punch_item already refuses a
-- non-member, but next_punch_number would have answered anyone holding a project uuid with a count
-- of that project's punch items.
revoke execute on function public.next_punch_number(uuid, uuid) from anon;
revoke execute on function public.add_punch_item(uuid, uuid, text, text, uuid, uuid, jsonb, text, text, date) from anon;
