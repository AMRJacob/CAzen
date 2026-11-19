# Checks

The app driven in a real browser against a stand-in backend: every Supabase request is answered
from fixtures in `common.py`, so nothing here reads or writes the production database.

    ./serve.sh                 # build against the stand-in and serve on :4173
    python3 t_offline.py       # cold start with the network cut
    python3 t_field.py         # take a project to the field, go offline, open a sheet
    python3 t_obs.py           # a run of observations kept offline and sent on reconnect
    python3 t_pay.py           # set a contract up from a pasted schedule of values
    python3 t_notebook.py      # the field-notes and meeting-notes books on desk and phone
    python3 t_frames.py 4      # dropped frames while zooming and panning a hatch-heavy sheet
    python3 t_markup.py        # Delete, undo, and the question on leaving markup
    python3 t_zoom.py 4        # zoom a hatch-heavy sheet at a quarter CPU speed: how long the drawing is gone, time to sharp
    python3 t_pr.py            # price a proposal request, decide it, roll it into a change order
    python3 t_tag.py           # issue tags by trade, and tagging an observation to a drawing
    python3 t_access.py        # people and access: list, per-project access, invite
    python3 t_sched.py         # read a scanned schedule (scan.pdf), tie it to pay lines, keep it
    node --experimental-strip-types notes.test.ts      # where a typed note is filed
    node --experimental-strip-types schedule.test.ts   # the schedule reader and the tie suggestions
    node --experimental-strip-types sov.test.ts   # the schedule-of-values reader

Needs Python Playwright and Chrome. Screenshots are written beside the scripts and are not kept.
