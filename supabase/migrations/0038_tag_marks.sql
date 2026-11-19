-- What a tag looks like on a drawing: its shape, the few letters on it, or a mark drawn by hand.
-- Additive: three nullable columns on the firm's own tags. A row whose label is '*' is the
-- trade's own mark, which its tags wear unless they have one of their own; a row with the same
-- trade and label as a built-in tag restyles that tag for this firm.
-- Applied to production 2026-11-19 with Jacob’s confirmation.
alter table observation_tags add column if not exists shape text;
alter table observation_tags add column if not exists mark  text;
alter table observation_tags add column if not exists glyph jsonb;
notify pgrst, 'reload schema';
