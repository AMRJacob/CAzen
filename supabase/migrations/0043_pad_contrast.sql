-- A pad drawn "with contrast": every mark on it is drawn with a thin white edge, so ink stays
-- readable over a photograph or a busy drawing it was laid on. Additive; existing pads are off.
alter table public.note_pads add column if not exists contrast boolean not null default false;
