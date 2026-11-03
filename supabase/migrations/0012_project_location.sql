-- CAzen: where a project is, from the Location map on the project form.
alter table projects add column if not exists latitude  double precision check (latitude  between -90 and 90);
alter table projects add column if not exists longitude double precision check (longitude between -180 and 180);
notify pgrst, 'reload schema';
