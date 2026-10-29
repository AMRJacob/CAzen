-- CAzen: security tidy-ups flagged by the Supabase advisor.

-- Pin search_path on helper functions.
alter function sheets_as_of(uuid, date) set search_path = public;
alter function next_ca_seq() set search_path = public;
alter function path_uuid(text) set search_path = public;

-- Signed-out visitors don't need the access-check helpers. Signed-in users do,
-- because the row-level security rules call them as that user.
revoke execute on function is_member(uuid) from public, anon;
revoke execute on function is_firm_member(uuid) from public, anon;
revoke execute on function is_firm_admin(uuid) from public, anon;
grant execute on function is_member(uuid) to authenticated;
grant execute on function is_firm_member(uuid) to authenticated;
grant execute on function is_firm_admin(uuid) to authenticated;

notify pgrst, 'reload schema';
