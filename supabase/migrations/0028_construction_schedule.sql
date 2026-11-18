-- CAzen: the construction schedule.
--
-- The reason it is here is the pay application. A contractor asks to be paid for 62% of the
-- masonry; the question is whether the schedule agrees, and that question cannot be asked
-- unless both live in the same place. So the schedule is kept as activities with dates and a
-- percent complete, and each activity says which schedule-of-values lines it covers.
--
-- The mapping is many-to-many on purpose: a schedule activity rarely lines up one to one with
-- a schedule of values. "Masonry" in the schedule may be two SOV lines (block and brick), and
-- "General conditions" in the SOV runs under every activity there is.

create table if not exists schedule_activities (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  contract_id uuid references pay_contracts(id) on delete cascade,
  name        text not null,
  is_heading  boolean not null default false,
  starts_on   date,
  ends_on     date,
  percent     numeric(5,2) not null default 0 check (percent between 0 and 100),
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists schedule_activities_project on schedule_activities (project_id, sort);

-- Which schedule-of-values lines an activity covers. A line may be covered by several
-- activities and an activity may cover several lines.
create table if not exists schedule_activity_lines (
  activity_id uuid not null references schedule_activities(id) on delete cascade,
  sov_line_id uuid not null references sov_lines(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  primary key (activity_id, sov_line_id)
);

alter table schedule_activities enable row level security;
alter table schedule_activity_lines enable row level security;

drop policy if exists member_rows on schedule_activities;
drop policy if exists member_rows on schedule_activity_lines;
create policy member_rows on schedule_activities for all using (is_member(project_id)) with check (is_member(project_id));
create policy member_rows on schedule_activity_lines for all using (is_member(project_id)) with check (is_member(project_id));
