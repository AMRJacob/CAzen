-- CAzen: a cap on CAzen file storage (Cloudflare R2), so a mistake or misuse can't run up a bill.
-- The "files" Edge Function enforces it. Admins change it in Settings (firms update policy).

alter table firms add column if not exists storage_cap_gb numeric not null default 9.5 check (storage_cap_gb > 0);
alter table firms add column if not exists max_file_mb   numeric not null default 100 check (max_file_mb > 0);

-- What's in the bucket. Counted by listing the bucket itself, so it stays right even after files
-- are removed in Cloudflare; uploads add to it between counts. Written only by the Edge Function
-- (service role); members can read it.
create table if not exists storage_usage (
  firm_id     uuid primary key references firms(id) on delete cascade,
  bytes       bigint not null default 0,
  objects     integer not null default 0,
  -- { "<project id>": { "bytes": n, "objects": n }, … } from the last count
  by_project  jsonb not null default '{}'::jsonb,
  counted_at  timestamptz
);
alter table storage_usage enable row level security;
create policy member_read on storage_usage for select using (is_firm_member(firm_id));

notify pgrst, 'reload schema';
