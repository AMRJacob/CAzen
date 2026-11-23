-- A schedule's outline, as the contractor's program prints it: each activity's level (0 at the
-- top; a row with deeper rows under it is a summary) and its ID as printed, so a row can be found
-- on the sheet and matched when the next issue is read. Additive. Applied 2026-11-23.
alter table public.schedule_activities add column if not exists level smallint not null default 0 check (level between 0 and 20);
alter table public.schedule_activities add column if not exists ref text;
