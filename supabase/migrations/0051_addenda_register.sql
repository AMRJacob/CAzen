-- Addenda kept in the change documents register (issued forms and their templates). Widens the
-- allowed kinds; no row changes.
alter table public.issued_forms drop constraint if exists issued_forms_kind_check;
alter table public.issued_forms add constraint issued_forms_kind_check check (kind = any (array['submittal_cover','asi','rfi_response','pr','ccd','field_report','meeting_notes','change_order','addendum']));
alter table public.doc_templates drop constraint if exists doc_templates_kind_check;
alter table public.doc_templates add constraint doc_templates_kind_check check (kind = any (array['general','submittal_cover','asi','pr','rfi_response','ccd','field_report','transmittal','meeting_notes','change_order','addendum']));
