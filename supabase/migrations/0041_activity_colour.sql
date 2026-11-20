-- A colour for a schedule activity, for a contractor's colour coding. Additive: one nullable column.
alter table schedule_activities add column if not exists color text;
notify pgrst, 'reload schema';
