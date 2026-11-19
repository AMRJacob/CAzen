# Checks

The app driven in a real browser against a stand-in backend: every Supabase request is answered
from fixtures in `common.py`, so nothing here reads or writes the production database.

    ./serve.sh                 # build against the stand-in and serve on :4173
    python3 t_offline.py       # cold start with the network cut
    python3 t_field.py         # take a project to the field, go offline, open a sheet
    python3 t_obs.py           # a run of observations kept offline and sent on reconnect
    python3 t_pay.py           # set a contract up from a pasted schedule of values
    python3 t_visit.py         # a site visit on desk and phone; "t_visit.py missing" for a database without the table
    python3 t_sched.py         # read a scanned schedule (scan.pdf), tie it to pay lines, keep it
    node --experimental-strip-types schedule.test.ts   # the schedule reader and the tie suggestions
    node --experimental-strip-types sov.test.ts   # the schedule-of-values reader

Needs Python Playwright and Chrome. Screenshots are written beside the scripts and are not kept.
