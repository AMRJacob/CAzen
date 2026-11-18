-- When a change order was approved, so the G702 change order summary can tell
-- "approved in previous months" from "approved this month".
alter table sov_lines add column if not exists approved_on date;
comment on column sov_lines.approved_on is
  'For a change order line: the date the owner approved it. Null means it predates the applications.';
