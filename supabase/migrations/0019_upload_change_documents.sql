-- CAzen: one upload, one event.
--
-- An ASI, a PR or a CCD arrives as a package: the cover sheet that says what changed, and the
-- revised drawings it changed. CAzen had those as unrelated chores — upload the drawings here,
-- write the document there, and nothing afterwards says the two were the same event. Someone
-- back-filling a year of a project does both twice and still has no link.
--
-- So an upload can carry its cover: pages flagged as the document rather than as drawings become
-- the change document's file, and the issuance and the document point at each other.

-- 'pr' joins the upload categories: a proposal request is issued exactly this way.
alter table issuances drop constraint if exists issuances_kind_check;
alter table issuances add constraint issuances_kind_check check (kind in
  ('bid_set','conformed_set','addendum','asi','bulletin','ccd','change_order','pr','other'));

-- The set this document was issued with, when it came in on an upload.
alter table issued_forms add column if not exists issuance_id uuid references issuances(id) on delete set null;
create index if not exists issued_forms_issuance_idx on issued_forms (issuance_id);

-- For categories that aren't change documents — an addendum, a conformed set — the cover still
-- shouldn't be filed as a drawing, so it is kept with the set itself.
alter table issuances add column if not exists cover_path text;
comment on column issuances.cover_path is 'Cover or narrative pages uploaded with the set, as one PDF.';

notify pgrst, 'reload schema';
