-- Anyone on the project may remove a markup.
--
-- Until now only the person who drew a markup could remove it (author_drop). Two things were
-- wrong with that. A markup saved with no author recorded could be removed by nobody, and the
-- refusal was silent, so it vanished on the device that removed it and stayed for everyone
-- else. And Jacob's decision (2026-11-19) is that anyone may remove anything, after being
-- warned that it was drawn by someone else — the warning is the app's; this is the permission.
--
-- A markup that arrives with no author is also given the person sending it.
-- Nothing existing is changed or deleted by this migration.

alter table sheet_markups alter column created_by set default auth.uid();

drop policy if exists author_drop on sheet_markups;
create policy member_drop on sheet_markups for delete using (is_member(project_id));
