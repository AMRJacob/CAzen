-- CAzen: title block templates remember the size of the sheet they were drawn on (points), so
-- the best-fit choice can favour templates drawn on sheets of the same size.
alter table titleblock_templates add column if not exists page_size jsonb;
notify pgrst, 'reload schema';

-- …and the fixed words printed around their boxes (firm names, labels), learned from the sheet
-- they were drawn on or confirmed on, so overlapping templates can be told apart.
alter table titleblock_templates add column if not exists anchors jsonb;
notify pgrst, 'reload schema';
