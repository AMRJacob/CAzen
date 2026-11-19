-- Project access. Applied to production 2026-11-19 with Jacob's confirmation.
--
-- Until now everyone in the firm saw every project. From here, the firm's owners and admins see
-- every project and everyone else sees the projects they have been put on (project_members).
-- Firm membership still gives the firm itself — its name, brand and templates — which a form
-- cannot be drawn without.

drop policy if exists admin_read on project_members;
drop policy if exists admin_add on project_members;
drop policy if exists admin_change on project_members;
drop policy if exists admin_remove on project_members;
create policy admin_read on project_members for select using (is_project_admin(project_id));
create policy admin_add on project_members for insert with check (is_project_admin(project_id));
create policy admin_change on project_members for update using (is_project_admin(project_id)) with check (is_project_admin(project_id));
create policy admin_remove on project_members for delete using (is_project_admin(project_id));
grant select, insert, update, delete on project_members to authenticated;

create or replace function public.is_member(p_project uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from projects p where p.id = p_project and is_firm_admin(p.firm_id))
      or exists (select 1 from project_members where project_id = p_project and user_id = auth.uid())
$$;

create or replace function public.create_project(p_firm_id uuid, p_number text, p_name text, p_owner_name text default null, p_contractor_name text default null, p_address text default null)
returns projects language plpgsql security definer set search_path to 'public' as $$
declare new_project projects;
begin
  if not is_firm_member(p_firm_id) then raise exception 'Not a member of this firm'; end if;
  insert into projects (firm_id, number, name, owner_name, contractor_name, address)
  values (p_firm_id, p_number, p_name, p_owner_name, p_contractor_name, p_address)
  returning * into new_project;
  insert into project_members (project_id, user_id, role) values (new_project.id, auth.uid(), 'architect')
  on conflict (project_id, user_id) do nothing;
  return new_project;
end $$;

create or replace function public.firm_people(p_firm uuid)
returns table (user_id uuid, email text, full_name text, role text, joined_at timestamptz, last_seen timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_firm_admin(p_firm) then raise exception 'Only firm admins can see who has access'; end if;
  return query
    select fm.user_id, u.email::text, (u.raw_user_meta_data->>'full_name')::text, fm.role, fm.created_at, u.last_sign_in_at
    from firm_members fm join auth.users u on u.id = fm.user_id
    where fm.firm_id = p_firm order by u.email;
end $$;
revoke all on function public.firm_people(uuid) from public, anon;
grant execute on function public.firm_people(uuid) to authenticated;

-- For the invite-user edge function only.
create or replace function public.user_id_for_email(p_email text) returns uuid
language sql stable security definer set search_path to 'public' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function public.user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.user_id_for_email(text) to service_role;

notify pgrst, 'reload schema';
