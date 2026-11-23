-- The notebook page an observation was made on, when it was made on one. Observations made in
-- the Observations book, or on a sheet, have none ("General"). Additive: one nullable column;
-- a page torn out leaves its observations in place with the link cleared.
alter table observations add column if not exists visit_id uuid references site_visits(id) on delete set null;
create index if not exists observations_visit on observations (visit_id) where visit_id is not null;
notify pgrst, 'reload schema';
