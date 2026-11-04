-- CAzen: requests and issues, kept in the app (Settings → Requests & issues).
-- Anyone in the firm can add one and see the list; the person who added an item can edit its
-- wording; firm admins can change anything, including status and notes. Claude works on the list
-- through the Supabase connection.

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  kind        text not null default 'request' check (kind in ('request', 'issue')),
  title       text not null check (length(trim(title)) > 0),
  details     text,
  status      text not null default 'new' check (status in
                ('new', 'under_review', 'planned', 'in_progress', 'complete', 'infeasible', 'duplicate', 'wont_do')),
  notes       text,                      -- the reply: what was done, or why not
  page        text,                      -- where in the app it was reported from
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists feedback_firm_idx on feedback (firm_id, status, created_at desc);

alter table feedback enable row level security;
create policy member_read on feedback for select using (is_firm_member(firm_id));
create policy member_add  on feedback for insert with check (is_firm_member(firm_id) and created_by = auth.uid());
-- Your own item, while it's still open: you can reword it. Admins: anything.
create policy own_edit    on feedback for update
  using ((created_by = auth.uid() and status in ('new', 'under_review')) or is_firm_admin(firm_id))
  with check (is_firm_member(firm_id));
create policy admin_drop  on feedback for delete using (is_firm_admin(firm_id));

-- Non-admins may reword their own items but not change status or notes.
create or replace function feedback_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  if new.status in ('complete', 'infeasible', 'duplicate', 'wont_do') and old.status not in ('complete', 'infeasible', 'duplicate', 'wont_do') then
    new.closed_at := now();
  elsif new.status not in ('complete', 'infeasible', 'duplicate', 'wont_do') then
    new.closed_at := null;
  end if;
  if auth.uid() is not null and not is_firm_admin(new.firm_id)
     and (new.status is distinct from old.status or new.notes is distinct from old.notes) then
    raise exception 'Only firm admins can change the status or notes.';
  end if;
  return new;
end $$;
drop trigger if exists feedback_guard on feedback;
create trigger feedback_guard before update on feedback for each row execute function feedback_guard();

notify pgrst, 'reload schema';
