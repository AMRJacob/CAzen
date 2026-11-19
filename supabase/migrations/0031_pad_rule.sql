-- What the paper looks like: ruled lines, a grid, dots, or nothing. Kept on the pad because
-- it is a property of the page somebody chose to write on, not a setting of the app.
alter table note_pads add column if not exists rule text not null default 'lines';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'note_pads_rule_check') then
    alter table note_pads add constraint note_pads_rule_check
      check (rule in ('lines', 'grid', 'dots', 'blank'));
  end if;
end $$;
