-- The CSI divisions a schedule-of-values line or a schedule activity is filed under, set on the
-- trade board (src/components/TradeBoard.tsx). Each is two digits, '01'–'49'. A list, because a
-- schedule activity such as "Rough-in plumbing, electrical, HVAC" is three trades' work.
--   null — never placed; the board shows its guess from the words
--   {}   — placed outside every division on purpose
-- It lets the schedule be read against the pay application trade by trade when the two are not
-- broken down the same way. Additive: no existing row changes.
-- (Applied 2026-11-20 as 0042_trade_divisions, a single text column, then replaced within
-- minutes by this list as 0042b, before anything was written to it.)
alter table public.sov_lines add column if not exists divisions text[]
  check (divisions is null or array_to_string(divisions, ',') ~ '^([0-9]{2}(,[0-9]{2})*)?$');
alter table public.schedule_activities add column if not exists divisions text[]
  check (divisions is null or array_to_string(divisions, ',') ~ '^([0-9]{2}(,[0-9]{2})*)?$');
