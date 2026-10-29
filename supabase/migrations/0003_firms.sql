-- CAzen: multiple firms
-- Each firm has its own people, projects, files and branding. Nothing is shared between firms.
-- Run after 0001_init.sql and 0002_phase1.sql.

-- ---------------------------------------------------------------
-- Firms and their people
-- ---------------------------------------------------------------
create table firms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  address_line1   text,
  address_line2   text,
  city_state_zip  text,
  phone           text,
  email           text,
  website         text,
  license_text    text,                                   -- e.g. state certificate of authority
  accent_color    text not null default '#1f4e79' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path       text,                                   -- storage: templates/{firm_id}/logo.png
  letterhead_path text,                                   -- optional full-page PDF background
  created_at      timestamptz not null default now()
);

create table firm_members (
  firm_id    uuid not null references firms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);

create or replace function is_firm_member(p_firm uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from firm_members where firm_id = p_firm and user_id = auth.uid())
$$;

create or replace function is_firm_admin(p_firm uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from firm_members where firm_id = p_firm and user_id = auth.uid() and role in ('owner','admin'))
$$;

-- ---------------------------------------------------------------
-- Projects belong to a firm. Everyone in the firm can see its projects;
-- project_members stays for outside parties (consultants, contractors) later.
-- ---------------------------------------------------------------
alter table projects add column firm_id uuid references firms(id) on delete cascade;
delete from projects where firm_id is null;  -- none exist yet; keeps NOT NULL safe
alter table projects alter column firm_id set not null;
alter table projects drop constraint if exists projects_number_key;
alter table projects add constraint projects_firm_number_key unique (firm_id, number);
create index projects_firm_idx on projects (firm_id);

create or replace function is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.id = p_project and is_firm_member(p.firm_id))
      or exists (select 1 from project_members where project_id = p_project and user_id = auth.uid())
$$;

-- Projects: read/update by members; created only through create_project(); never deleted from the app.
drop policy if exists member_projects on projects;
create policy member_read   on projects for select using (is_member(id));
create policy member_update on projects for update using (is_member(id)) with check (is_firm_member(firm_id));

-- ---------------------------------------------------------------
-- Document templates: per-firm wording for each document type.
-- Branding (logo, letterhead, colour, address) lives on firms and applies to every document.
-- ---------------------------------------------------------------
drop table if exists templates;
create table doc_templates (
  firm_id    uuid not null references firms(id) on delete cascade,
  kind       text not null check (kind in ('general','submittal_cover','asi','pr','rfi_response','ccd','field_report','transmittal')),
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (firm_id, kind)
);

alter table firms         enable row level security;
alter table firm_members  enable row level security;
alter table doc_templates enable row level security;

create policy firm_read   on firms for select using (is_firm_member(id));
create policy firm_update on firms for update using (is_firm_admin(id)) with check (is_firm_admin(id));

create policy members_read   on firm_members for select using (is_firm_member(firm_id));
create policy members_add    on firm_members for insert with check (is_firm_admin(firm_id));
create policy members_change on firm_members for update using (is_firm_admin(firm_id)) with check (is_firm_admin(firm_id));
create policy members_remove on firm_members for delete using (is_firm_admin(firm_id) and user_id <> auth.uid());

create policy templates_read  on doc_templates for select using (is_firm_member(firm_id));
create policy templates_write on doc_templates for insert with check (is_firm_admin(firm_id));
create policy templates_edit  on doc_templates for update using (is_firm_admin(firm_id)) with check (is_firm_admin(firm_id));

-- ---------------------------------------------------------------
-- Creating a firm makes the creator its owner.
-- ---------------------------------------------------------------
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
  insert into firms (name, address_line1, city_state_zip, phone, website)
  values (p_name, p_address_line1, p_city_state_zip, p_phone, p_website)
  returning * into f;
  insert into firm_members (firm_id, user_id, role) values (f.id, auth.uid(), 'owner');
  return f;
end $$;

-- Projects are now created inside a firm.
drop function if exists create_project(text, text, text, text, text);
create or replace function create_project(
  p_firm_id uuid,
  p_number text,
  p_name text,
  p_owner_name text default null,
  p_contractor_name text default null,
  p_address text default null
) returns projects
language plpgsql security definer set search_path = public as $$
declare new_project projects;
begin
  if not is_firm_member(p_firm_id) then raise exception 'Not a member of this firm'; end if;
  insert into projects (firm_id, number, name, owner_name, contractor_name, address)
  values (p_firm_id, p_number, p_name, p_owner_name, p_contractor_name, p_address)
  returning * into new_project;
  return new_project;
end $$;

revoke execute on function create_firm(text, text, text, text, text) from public, anon;
revoke execute on function create_project(uuid, text, text, text, text, text) from public, anon;
grant execute on function create_firm(text, text, text, text, text) to authenticated;
grant execute on function create_project(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------
-- Files: scoped by the first folder of the path.
--   documents/{project_id}/…   → that project's members
--   templates/{firm_id}/…      → that firm's members (read), admins (write)
-- ---------------------------------------------------------------
create or replace function path_uuid(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

drop policy if exists staff_read on storage.objects;
drop policy if exists staff_insert on storage.objects;

create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and is_member(path_uuid(name)));
create policy documents_add on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and is_member(path_uuid(name)));

create policy branding_read on storage.objects for select to authenticated
  using (bucket_id = 'templates' and is_firm_member(path_uuid(name)));
create policy branding_add on storage.objects for insert to authenticated
  with check (bucket_id = 'templates' and is_firm_admin(path_uuid(name)));
create policy branding_replace on storage.objects for update to authenticated
  using (bucket_id = 'templates' and is_firm_admin(path_uuid(name)))
  with check (bucket_id = 'templates' and is_firm_admin(path_uuid(name)));
create policy branding_remove on storage.objects for delete to authenticated
  using (bucket_id = 'templates' and is_firm_admin(path_uuid(name)));

-- Make the API see new tables and functions immediately
notify pgrst, 'reload schema';
