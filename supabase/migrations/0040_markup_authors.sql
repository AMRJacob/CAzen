-- Markups with no author could be removed by nobody.
--
-- Only the person who drew a markup may remove it (author_drop). A markup saved while the app
-- could not reach the sign-in service went in with created_by null, and null is nobody: the
-- removal was refused silently, so it vanished on the device that removed it and stayed for
-- everyone else.
--
-- 1. A markup that arrives with no author is given the person sending it.
-- 2. One that already has no author may be removed by any member of the project — there is
--    nobody else who could.
-- Nothing existing is changed or deleted by this migration.

alter table sheet_markups alter column created_by set default auth.uid();

drop policy if exists author_drop on sheet_markups;
create policy author_drop on sheet_markups for delete
  using (is_member(project_id) and (created_by = auth.uid() or created_by is null));
