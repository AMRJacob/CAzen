-- CAzen: projects can keep their files in CAzen file storage (Cloudflare R2), reached through the
-- "files" Edge Function. New projects use it by default; existing projects keep their setting.

alter table projects drop constraint if exists projects_storage_check;
alter table projects add constraint projects_storage_check check (storage in ('cloud', 'folder', 'r2'));
alter table projects alter column storage set default 'r2';

notify pgrst, 'reload schema';
