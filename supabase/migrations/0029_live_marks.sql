-- Two people on the same sheet, or walking the same building, should see each other's work.
--
-- Both tables are append-mostly: a markup and an observation are their own rows and are never
-- rewritten except deliberately, so there is nothing to merge — whatever arrives is drawn.
alter publication supabase_realtime add table sheet_markups;
alter publication supabase_realtime add table observations;
