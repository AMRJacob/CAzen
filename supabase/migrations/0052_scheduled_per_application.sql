-- A scheduled value set on one application. Each application uses the value from the latest
-- application at or before it that set one, and the schedule of values' own value before that, so a
-- contractor moving money between lines changes the application it happened on and those after it,
-- never the ones before.
alter table public.pay_app_lines add column if not exists scheduled numeric(14,2);
