-- CAzen: a project's files can live in a folder on the user's computer (for example the
-- project's CA folder on a mapped shared drive) instead of CAzen's cloud storage.
-- Paths saved for those files start with "folder:" and are relative to the chosen folder.

alter table projects add column if not exists storage text not null default 'cloud'
  check (storage in ('cloud', 'folder'));
alter table projects add column if not exists folder_name text;   -- shown so everyone connects the same folder

notify pgrst, 'reload schema';
