-- Notebook pages grouped into one report (Jacob, 11/24: three UCA sites in one trip, one field
-- report). A group is the pages sharing a `group_id`, under the `group_name` each of them carries,
-- so grouping goes through the same offline path as any change to a page. Additive: two columns.
alter table site_visits add column if not exists group_id uuid;
alter table site_visits add column if not exists group_name text;
create index if not exists site_visits_group on site_visits (group_id) where group_id is not null;
notify pgrst, 'reload schema';
