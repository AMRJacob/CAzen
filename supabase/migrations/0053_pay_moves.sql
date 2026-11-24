-- Money a contractor moved between lines on one application, as the person checking it linked it:
-- [{ "from": sov line id, "to": sov line id, "amount": number }]. An explanation only; no figure is
-- worked out from it.
alter table public.pay_apps add column if not exists moves jsonb not null default '[]'::jsonb;
