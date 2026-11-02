-- CAzen: deleting and archiving, for firm admins only.
--
-- Before this, revisions could never be deleted (good), but any member could delete a *sheet*,
-- which silently removed all its revisions by cascade, and nobody could delete a project.
-- Now every delete of drawings, issuances, projects and issued forms needs a firm admin, and
-- goes through the functions below, which delete in the right order and return the file paths so
-- the app can remove the files from storage.

create or replace function is_project_admin(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.id = p_project and is_firm_admin(p.firm_id))
$$;
revoke execute on function is_project_admin(uuid) from public, anon;
grant execute on function is_project_admin(uuid) to authenticated;

-- Deletes need an admin, on top of whatever else allows them (restrictive policies).
drop policy if exists no_delete on sheet_revisions;
drop policy if exists no_delete on spec_revisions;
create policy admin_delete on sheet_revisions as restrictive for delete
  using (is_project_admin((select project_id from sheets where id = sheet_id)));
create policy admin_delete on spec_revisions as restrictive for delete
  using (is_project_admin((select project_id from spec_sections where id = section_id)));
create policy admin_delete on sheets         as restrictive for delete using (is_project_admin(project_id));
create policy admin_delete on spec_sections  as restrictive for delete using (is_project_admin(project_id));
create policy admin_delete on issuances      as restrictive for delete using (is_project_admin(project_id));
create policy admin_delete on projects       for delete using (is_project_admin(id));
create policy admin_delete on issued_forms   for delete using (is_project_admin(project_id));

-- Undo one upload round: its revisions, any sheets left with no revision, then the round itself.
-- Sheets it revised fall back to their previous revision. Returns the deleted files' paths.
create or replace function delete_issuance(p_issuance uuid) returns setof text
language plpgsql security invoker set search_path = public as $$
declare v_project uuid; v_sheets uuid[];
begin
  select project_id into v_project from issuances where id = p_issuance;
  if v_project is null then raise exception 'That set no longer exists.'; end if;
  if not is_project_admin(v_project) then raise exception 'Only firm admins can delete sets.'; end if;
  select array_agg(distinct sheet_id) into v_sheets from sheet_revisions where issuance_id = p_issuance;
  return query delete from sheet_revisions where issuance_id = p_issuance returning file_path;
  delete from sheets s where s.id = any(coalesce(v_sheets, '{}'))
    and not exists (select 1 from sheet_revisions r where r.sheet_id = s.id);
  delete from issuances where id = p_issuance;
end $$;

-- Delete one revision of a sheet; the sheet goes too if it was its only revision.
create or replace function delete_revision(p_revision uuid) returns setof text
language plpgsql security invoker set search_path = public as $$
declare v_sheet uuid; v_project uuid;
begin
  select r.sheet_id, s.project_id into v_sheet, v_project from sheet_revisions r join sheets s on s.id = r.sheet_id where r.id = p_revision;
  if v_sheet is null then raise exception 'That revision no longer exists.'; end if;
  if not is_project_admin(v_project) then raise exception 'Only firm admins can delete revisions.'; end if;
  return query delete from sheet_revisions where id = p_revision returning file_path;
  delete from sheets s where s.id = v_sheet and not exists (select 1 from sheet_revisions r where r.sheet_id = s.id);
  -- An upload round left with nothing in it goes too.
  delete from issuances i where i.project_id = v_project
    and not exists (select 1 from sheet_revisions r where r.issuance_id = i.id)
    and not exists (select 1 from spec_revisions r where r.issuance_id = i.id);
end $$;

-- Archive: once every file has been copied to the project folder, point the records at those
-- copies ("r2:{project}/CAzen/…" → "folder:CAzen/…") and mark the project archived. The app then
-- removes the files from cloud storage.
create or replace function archive_project(p_project uuid) returns void
language plpgsql security definer set search_path = public as $$
declare prefix text := 'r2:' || p_project || '/';
begin
  if not is_project_admin(p_project) then raise exception 'Only firm admins can archive projects.'; end if;
  update sheet_revisions r set file_path = 'folder:' || substr(r.file_path, length(prefix) + 1)
    from sheets s where s.id = r.sheet_id and s.project_id = p_project and r.file_path like prefix || '%';
  update issued_forms set file_path = 'folder:' || substr(file_path, length(prefix) + 1)
    where project_id = p_project and file_path like prefix || '%';
  update projects set status = 'archived', storage = 'folder' where id = p_project;
end $$;

revoke execute on function delete_issuance(uuid), delete_revision(uuid), archive_project(uuid) from public, anon;
grant execute on function delete_issuance(uuid), delete_revision(uuid), archive_project(uuid) to authenticated;

notify pgrst, 'reload schema';
