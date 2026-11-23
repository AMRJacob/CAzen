-- Single cells of an application rounded differently from their column: {"<sov_line_id>":{"I":"up","G":"exact"}}.
alter table public.pay_apps add column if not exists rounding jsonb not null default '{}'::jsonb;
