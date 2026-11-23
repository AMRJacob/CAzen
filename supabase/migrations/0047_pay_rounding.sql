-- Columns of the continuation sheet the contractor rounds, and which way: {"I":"nearest","G":"down"}.
alter table public.pay_contracts add column if not exists rounding jsonb not null default '{}'::jsonb;
