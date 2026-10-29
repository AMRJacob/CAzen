-- CAzen: one firm per deployment.
-- The first person to sign in sets up the firm and becomes its owner.
-- Everyone invited after that joins the same firm automatically as a member.
-- Rebranding = editing the firm in Settings; nothing else changes.

create or replace function create_firm(
  p_name text,
  p_address_line1 text default null,
  p_city_state_zip text default null,
  p_phone text default null,
  p_website text default null
) returns firms
language plpgsql security definer set search_path = public as $$
declare f firms;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- Serialise so two first-time users can't both create a firm.
  perform pg_advisory_xact_lock(hashtext('cazen.create_firm'));
  if exists (select 1 from firms) then raise exception 'This CAzen site already has a firm'; end if;
  insert into firms (name, address_line1, city_state_zip, phone, website)
  values (p_name, p_address_line1, p_city_state_zip, p_phone, p_website)
  returning * into f;
  insert into firm_members (firm_id, user_id, role) values (f.id, auth.uid(), 'owner');
  return f;
end $$;

-- Called on every sign-in: returns the site's firm, adding the caller as a member if needed.
-- Returns null only before the firm has been set up.
create or replace function join_firm() returns firms
language plpgsql security definer set search_path = public as $$
declare f firms;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into f from firms order by created_at limit 1;
  if f.id is null then return null; end if;
  insert into firm_members (firm_id, user_id, role) values (f.id, auth.uid(), 'member')
  on conflict (firm_id, user_id) do nothing;
  return f;
end $$;

revoke execute on function join_firm() from public, anon;
grant execute on function join_firm() to authenticated;

notify pgrst, 'reload schema';
