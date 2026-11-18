-- CAzen: the clarifications and changes issued during construction, as one tracked set.
--
-- ASIs, RFI responses, proposal requests, CCDs and change orders are one story told in five
-- documents, and the thing nobody can find later is which of them led to which. A change order
-- carries several proposal requests; the PRs are where the money was priced and the CO is where
-- it was signed. So they are linked, rather than related only by a number written in a field.
--
-- Also fixes two check constraints that never learned about meeting notes, which would have
-- rejected one on save.

alter table issued_forms  drop constraint if exists issued_forms_kind_check;
alter table issued_forms  add  constraint issued_forms_kind_check check (kind in
  ('submittal_cover','asi','rfi_response','pr','ccd','field_report','meeting_notes','change_order'));

alter table doc_templates drop constraint if exists doc_templates_kind_check;
alter table doc_templates add  constraint doc_templates_kind_check check (kind in
  ('general','submittal_cover','asi','pr','rfi_response','ccd','field_report','transmittal',
   'meeting_notes','change_order'));

-- What a change document gathers up. Parent is the one that contains (a change order); child is
-- the one contained (a proposal request). A PR can only be in one change order, which is what
-- makes the money add up; a change order holds as many as it was issued with.
create table if not exists issued_form_links (
  parent_id  uuid not null references issued_forms(id) on delete cascade,
  child_id   uuid not null references issued_forms(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (parent_id, child_id),
  unique (child_id),
  check (parent_id <> child_id)
);
create index if not exists issued_form_links_parent_idx  on issued_form_links (parent_id);
create index if not exists issued_form_links_project_idx on issued_form_links (project_id);

alter table issued_form_links enable row level security;
create policy member_read on issued_form_links for select using (is_member(project_id));
create policy member_add  on issued_form_links for insert with check (is_member(project_id));
create policy member_drop on issued_form_links for delete using (is_member(project_id));

notify pgrst, 'reload schema';
