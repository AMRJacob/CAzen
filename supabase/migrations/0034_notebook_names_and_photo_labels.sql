-- A notebook page gains the two things its layout has a place for: who was there, and what each
-- photograph shows.
alter table site_visits add column if not exists names text;
alter table site_visits add column if not exists photo_labels jsonb not null default '{}'::jsonb;

comment on column site_visits.names is
  'Who was there, one to a line: Name | Company | Email, as the report templates take participants.';
comment on column site_visits.photo_labels is
  'What each photograph shows, keyed by its path in photos.';

notify pgrst, 'reload schema';
