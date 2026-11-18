-- A schedule-of-values line can be a change order before anybody has linked it to the
-- change document in the register, so the flag stands on its own.
alter table sov_lines add column if not exists is_change_order boolean not null default false;
