-- How strongly the ruling is drawn, nought to a hundred. Ink that is thinner than the lines
-- it sits on is ink nobody can read, and how heavy those lines want to be depends on the
-- screen, the room and the person.
alter table note_pads add column if not exists rule_ink integer not null default 40;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'note_pads_rule_ink_check') then
    alter table note_pads add constraint note_pads_rule_ink_check check (rule_ink between 0 and 100);
  end if;
end $$;
