-- Applied to production on 2026-11-23 as "0046_observation_ref_and_places"; renumbered here
-- because another 0046 (schedule outline) landed on main the same afternoon.
-- Observations numbered once per project (Jacob, 11/23: "Gl · 14" — a permanent project number,
-- the trade's letters beside it). A new column, `ref`, so the old per-type `number` is left as it
-- was: existing observations are given refs in the order they were made.
--
-- And the other places an observation is listed, beyond the page it was made on (0045):
-- further field-notes pages (`also_on`) and the punch list (`on_punch`, apart from its type).
-- Additive: three new columns; the numbering function also fills `ref`.
alter table observations add column if not exists ref int;
alter table observations add column if not exists also_on uuid[] not null default '{}';
alter table observations add column if not exists on_punch boolean not null default false;

with r as (
  select id, row_number() over (partition by project_id order by created_at, id) as n
    from observations
)
update observations o set ref = r.n from r where o.id = r.id and o.ref is null;

create unique index if not exists observations_ref_idx on observations (project_id, ref) where ref is not null;

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

  -- The old count within its type, still kept so a copy of the app from before this goes on working.
  if it.number is null then
    perform pg_advisory_xact_lock(hashtext(it.project_id::text || coalesce(it.type_id::text, '')));
    select coalesce(max(number), 0) + 1 into n
      from observations where project_id = it.project_id and type_id is not distinct from it.type_id;
    update observations set number = n, updated_at = now() where id = p_item;
  else
    n := it.number;
  end if;

  -- The project number: once, never reissued.
  if it.ref is null then
    perform pg_advisory_xact_lock(hashtext(it.project_id::text || ':ref'));
    update observations set ref = (select coalesce(max(ref), 0) + 1 from observations where project_id = it.project_id)
     where id = p_item;
  end if;
  return n;
end;
$$;
revoke execute on function public.number_observation(uuid) from public;
grant execute on function public.number_observation(uuid) to authenticated;

notify pgrst, 'reload schema';
