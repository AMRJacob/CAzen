-- The date printed on a sheet, where the sheet carries one.
--
-- A set has one issue date, and most sheets take it. But sheets reissued with a change document
-- — an ASI sketch, a PR attachment — are often dated individually in their own title block, and
-- that date is what gets referred to on site. It belongs to the revision rather than the sheet:
-- each issue of a sheet carried whatever date was printed on it that day.
alter table sheet_revisions add column if not exists sheet_date date;

comment on column sheet_revisions.sheet_date is
  'The date printed in this sheet''s own title block, where it has one. Null = the set''s issue date stands.';

notify pgrst, 'reload schema';
