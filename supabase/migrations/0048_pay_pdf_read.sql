-- What was read off the contractor's own application, kept so CAzen's arithmetic can be set against it:
-- {"file","read_at","application","g702":{...},"total":{...},"lines":{"<sov_line_id>":{"C":..,"I":..}}}
alter table public.pay_apps add column if not exists pdf_read jsonb;
