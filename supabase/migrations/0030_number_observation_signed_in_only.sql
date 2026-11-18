-- Numbering an observation allocates a code that is never reissued, so it should not be
-- callable by anybody who has not signed in. EXECUTE is granted to PUBLIC by default, which
-- is where anon was getting it.
revoke execute on function public.number_observation(uuid) from public;
grant execute on function public.number_observation(uuid) to authenticated;
