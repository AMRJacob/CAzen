-- CAzen: observations.
--
-- One object for everything noticed on site: a non-conforming detail, something needing
-- clarification, a progress photo, a punch item. They are the same thing — a place on a drawing,
-- a description, a date, photos, a status — and the only difference is what kind it is and where
-- it ends up being read.
--
-- That matters for the documents. If a punch item were a separate table, pulling observations
-- into a punch list would mean copying them, and the two would disagree the first time anybody
-- edited one. As one object, a punch list is a view of the open observations of punch types and
-- a field report is a view of the ones observed that day. Nothing is copied, so nothing drifts.
--
-- The code is a name, not a classification. It is allocated once from the type the observation
-- was raised under and never reissued, because the moment N-7 is written on a wall it has to
-- stay N-7 — including when it later appears on a closeout list.

alter table punch_categories rename to observation_types;
alter table punch_items      rename to observations;
alter table punch_lists      rename to observation_sets;

alter table observation_types rename column sort to position;
alter table observation_types add column if not exists is_punch boolean not null default false;
comment on column observation_types.is_punch is 'Belongs on a punch list, as opposed to a field report only.';

alter table observations rename column category_id to type_id;
alter table observations rename column punch_list_id to set_id;
alter table observations add column if not exists photos jsonb not null default '[]'::jsonb;
comment on column observations.photos is 'Stored file paths, in the order they were taken.';

-- Open, being dealt with, done.
alter table observations drop constraint if exists observations_status_check;
update observations set status = 'open' where status not in ('open', 'in_progress', 'closed');
alter table observations alter column status set default 'open';
alter table observations add constraint observations_status_check
  check (status in ('open', 'in_progress', 'closed'));

-- The kinds of thing worth writing down on a site visit. All editable by the firm; codes are
-- what the numbers are built from, so they are short.
insert into observation_types (firm_id, code, name, position, is_punch)
select f.id, t.code, t.name, t.position, t.is_punch
from firms f
cross join (values
  ('N', 'Non-conforming',      0, false),
  ('Q', 'Needs clarification', 1, false),
  ('P', 'Progress',            2, false),
  ('W', 'Working punch',       3, true),
  ('C', 'Closeout punch',      4, true)
) as t(code, name, position, is_punch)
on conflict (firm_id, code) do update
  set name = excluded.name, position = excluded.position, is_punch = excluded.is_punch;

-- Indexes and functions follow the new names.
alter index if exists punch_items_number_idx  rename to observations_number_idx;
alter index if exists punch_items_list_idx    rename to observations_set_idx;
alter index if exists punch_items_sheet_idx   rename to observations_sheet_idx;
alter index if exists punch_categories_firm_idx rename to observation_types_firm_idx;
alter index if exists punch_lists_project_idx rename to observation_sets_project_idx;

drop function if exists next_punch_number(uuid, uuid);
drop function if exists add_punch_item(uuid, uuid, text, text, uuid, uuid, jsonb, text, text, date);
drop function if exists number_punch_item(uuid);

/**
 * Give an observation its code, once it has reached the server.
 *
 * Separate from making one so that an observation written with no signal can be inserted first
 * and numbered second, and so that replaying a queue that already succeeded doesn't move a
 * number that is now written on a wall.
 */
create or replace function number_observation(p_item uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  it observations;
  n  int;
begin
  select * into it from observations where id = p_item;
  if it.id is null then raise exception 'no such observation'; end if;
  if not is_member(it.project_id) then raise exception 'not a member of this project'; end if;
  if it.number is not null then return it.number; end if;

  perform pg_advisory_xact_lock(hashtext(it.project_id::text || coalesce(it.type_id::text, '')));
  select coalesce(max(number), 0) + 1 into n
    from observations
   where project_id = it.project_id and type_id is not distinct from it.type_id;
  update observations set number = n, updated_at = now() where id = p_item;
  return n;
end;
$$;

revoke execute on function number_observation(uuid) from anon;

notify pgrst, 'reload schema';
