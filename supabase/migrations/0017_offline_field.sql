-- CAzen: taking a project to the field.
--
-- Two things the field needs that the office never did.
--
--  * A size to show before a download. A set is hundreds of megabytes and the decision to pull it
--    is usually made on a phone on LTE, so "Current set (298 MB)" has to be on the button. The
--    bytes are recorded as each file is uploaded; the files Edge Function can list a project's
--    prefix to backfill what was uploaded before this.
--
--  * A punch item that was written down with no signal. Numbers are allocated per category per
--    project and can't be handed out by a server that isn't there, so an item observed offline
--    arrives with no number and gets one when it syncs. Until then it is a real item with a real
--    record — it just can't be quoted by number yet, which is the honest state of affairs.

alter table sheet_revisions add column if not exists bytes bigint check (bytes is null or bytes >= 0);
comment on column sheet_revisions.bytes is 'Size of file_path, recorded at upload; null until backfilled.';

-- An item made in the field carries the device's own id for it, so replaying the queue twice
-- can't make it twice, and number stays null until it is allocated.
alter table punch_items alter column number drop not null;
alter table punch_items add column if not exists made_offline_at timestamptz;

-- The unique index must not treat two un-numbered items as a clash.
drop index if exists punch_items_number_idx;
create unique index if not exists punch_items_number_idx
  on punch_items (project_id, category_id, number) where number is not null;

/**
 * Give an item its number, once it has reached the server. Separate from add_punch_item so an
 * item made offline can be inserted first and numbered second, and so replaying a queue that
 * already succeeded doesn't move a number that is now written on a wall.
 */
create or replace function number_punch_item(p_item uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  it punch_items;
  n  int;
begin
  select * into it from punch_items where id = p_item;
  if it.id is null then raise exception 'no such punch item'; end if;
  if not is_member(it.project_id) then raise exception 'not a member of this project'; end if;
  if it.number is not null then return it.number; end if;

  -- Hold the project's items for this category while the next number is worked out, so two
  -- devices syncing at once can't be handed the same one.
  perform pg_advisory_xact_lock(hashtext(it.project_id::text || coalesce(it.category_id::text, '')));
  select coalesce(max(number), 0) + 1 into n
    from punch_items
   where project_id = it.project_id and category_id is not distinct from it.category_id;
  update punch_items set number = n, updated_at = now() where id = p_item;
  return n;
end;
$$;

revoke execute on function number_punch_item(uuid) from anon;

notify pgrst, 'reload schema';
