# CAzen — Build Log

A running record of what has been built, decided and learned, so progress can be tracked over
time and so any session (or any model) can pick the project up cold. Newest entry first.

Everything in an entry is drawn from the repository itself — commit history, the source tree,
the migration files — rather than from recollection, unless a line says otherwise.

This file lives in the repository at `docs/BUILD_LOG.md`; the project-knowledge copy is written
from it.

---

# Checkpoint — 2026-11-19, 16:20 CST

**Taking a project to the field is a press and hold** (Jacob, 14:25: the button was not working
well). On the project list, pressing and holding a project for about half a second — or
right-clicking it — brings its current sheets down straight away; the row fills as they
arrive. Once it is on the device the row is a **solid** green; while changes made on the device
have not reached the server it is **hatched**, and it says how many are waiting. Held again on
a project already on the device, it opens the panel that was behind the button (refresh, take
every revision, remove from the device). A plain tap still opens the project. The
"Take to the field" link is gone from the list; the panel is still under Edit on a desk.
`checks/t_hold.py`: hold → downloaded → solid; offline with one change queued → hatched, "1
change still to send"; back online → solid. (`checks/t_field.py` used the old button and is
stale.)

How the sending back works, as built (`src/lib/offline/outbox.ts`), for the record:
- A change made in the field is applied to the device's copy and put in a queue on the device.
- The queue is sent oldest first: when the app starts, when the browser reports it is back
  online, whenever another change is queued, and now every four seconds while the project list
  is open. It stops at the first failure that looks like the network and keeps the order.
- **What goes through the queue:** markups (add, edit, remove), observations (add, edit) and a
  sheet's scale. **What does not:** notebook pages, photographs, pad sketches, people, and
  everything on the desk side — those need a signal at the moment they are made. So "solid"
  means the queue is empty, not that nothing was lost by trying those offline.
- There is no background sync: nothing is sent while the app is closed.

---

# Checkpoint — 2026-11-19, 15:40 CST

**The schedule is one Gantt chart.** (`src/components/Gantt.tsx`, rewritten; the separate
Activities table is gone.)

- Columns the way a scheduling program prints them: **Line, Activity, Start, Finish, %**, then
  the bars on one time scale. Line is the row's place in the schedule, headings included, which
  is how MS Project numbers them (the contractor's 57 lines come out 1–57).
- **Headings are highlighted** and carry a summary bar and the dates spanning the activities
  under them, up to the next heading.
- **Right-click a line to change it**: it opens in place — name, start, finish, percent — with
  *Pay lines*, *Remove* and *Done*; Enter and Escape close it.
- **It fits its card.** The old chart's month rules and percent labels were offset 180 px past
  the right edge. Checked: the chart's edges sit inside the card and nothing scrolls sideways
  at 1440 px.
- **Zoom and pan through time**: drag the chart sideways, Ctrl + scroll (or a trackpad pinch) to
  zoom about the pointer, − / + / Fit. One zoom and one offset for every row, held as CSS
  variables. A two-finger pinch on a touch screen is not handled.
- **Milestones**: an activity with no length (start = finish) is drawn as a diamond.
- **Colour coding is not built.** Jacob noted another contractor may colour-code or add
  milestones. A colour per activity needs a column on `schedule_activities`.
- "Covers" (Jacob asked): which lines of the pay application's schedule of values an activity
  is paid under — it is what lets the page compare what the schedule says is done with what
  has been billed. In the chart it is now called *Pay lines* and lives in the row's editor.

**Re-read is now a button.** Jacob could not find it: it only appeared after Ctrl-clicking
rows. *Re-read titles and dates* sits on the Drawings toolbar beside *Sheet order*; it turns on
a mode where a plain click selects a sheet (Shift-click a run, *Select all*), then *Re-read
their title and date*. Ctrl-click and right-click still work without it.

**The sheet list on a phone runs as wide as its contents** (Jacob, 14:03). Number and title
each stay on one line, every column is kept (From, Date and History were hidden below 900 /
620 px), and the list slides sideways inside its own frame; the page itself does not get
wider. Measured at 402 px: table 862 px, one line per row. This reverses the earlier choice
recorded in the stylesheet ("side-scrolling a table one-handed on a ladder is no good").

**The phone menu stays open** (Jacob, 14:04) until something is chosen or the screen is
touched elsewhere; the 3.2 s / 1.4 s clocks are gone. *More* ran off the bottom: it now holds
ten items in three rows (two were added at 11:50) in a bar sized for two, and the bar grew
downward. It is sized by its rows and grows upward from the bottom edge. Measured at 402×874:
bar 706–864, lowest item ends at 859.

**A new title block template can be made while re-reading** (Jacob, 14:15). The re-read
dialog has *Read with* (whichever template fits each sheet, or one named template) and *New
template from these sheets…*, which opens the same template editor the upload uses on the
selected sheets. Saving it re-reads every selected sheet with the new template; rows corrected
by hand are left alone. Each sheet's file is fetched once and its words kept, so switching
templates fetches nothing. **Checked**: the editor opens on the selected sheets and returns.
**Not checked**: drawing boxes, saving, and the re-read that follows — the test sheet is a
blank dark page with no title block to draw on.

**The project manual's list on a phone, the same** (Jacob, 14:17): section number and title on
one line each, pages / from / date / history reached by sliding sideways. Measured at 402 px
with a 68-character title: table 847 px, page no wider than the screen.

**Sideways only on purpose** (Jacob, 14:18). On a phone the sheet list and the manual's list
would drift sideways under a thumb scrolling down. The browser is now given only the vertical
(`touch-action: pan-y`); `PanX` moves the list sideways only once a touch has gone more than
14 px across and more than 2.2 times as far across as down, and that touch then stays
sideways. A sideways slide is not taken as a tap on the row. No momentum after the finger
lifts. Tried in the test browser with synthetic touches: straight down and down-with-40%-drift
move the page only; a clearly sideways drag moves the list 220 px and the page not at all; an
exact 45° diagonal moved neither. Real fingers on iOS not tried.

**Drawings on a phone has one short row at the top** (Jacob, 14:23): *Sheets | Sets and
revisions*, a search button that opens a box to type in, and three dots. The dots are mine —
Jacob asked for only the first two — and show the rest of the toolbar (set as of, sheet
order, re-read, download) so those are not lost on a phone. The first sheet starts 236 px down
the screen. The desk page is unchanged, and so is the corner menu.
Before this Jacob asked for the corner menu to become contextual per page, then for the page's
controls to go under More, then cancelled both; that work was discarded unpushed.

**Sets and revisions columns can be resized**, with the same grips as the sheet list
(double-click a grip to give a column back to the table).

---

# Checkpoint — 2026-11-19, 15:00 CST

- **Re-read titles and dates on sheets already uploaded** (`src/components/SheetReread.tsx`).
  On Drawings → Current sheets, Ctrl- or Cmd-click and Shift-click choose rows (a plain click
  still opens the sheet). A bar appears with *Re-read titles and dates*; a right-click on a
  chosen row offers the same. Each chosen sheet's own PDF is opened and its title block read
  with the firm's title block templates as they are now (`readPage`, the same reader the upload
  uses). A table shows title and date on record beside what was read; the read values can be
  corrected; only ticked rows are changed. A row is pre-ticked only where something different
  was read *and* the number read matches the sheet's. Sheet numbers are never changed here.
  `setSheetDate`, `sheetDates` in `sheets.ts`. Right-click on a row with nothing chosen still
  renames it. **Checked** for selection, menu, and applying a corrected row
  (`checks/t_reread.py`); **not checked** that a real title block reads better the second
  time — the test sheet has no title block and no templates, so it read nothing.
- **The tagger's close button on a phone.** Jacob: on the iPhone, from an issue, he could not
  get back from the sheet. In *Tag to drawing* the bar had grown by three zoom buttons at
  12:25 and on a 402 px screen the × sat past the right edge. The zoom buttons are off on a
  phone (fingers zoom). I am inferring this is the screen he meant.
- **"Also remove the copies in the project folder on this computer"** (Jacob asked what it
  means). It is about the second copy of each PDF that CAzen writes into the project's own CA
  folder on an office computer where one has been linked. Reworded, with what happens either
  way, and now shown only on a computer that has that project's folder linked.
- **Sets show the subject of their change document.** A set uploaded as an ASI (or other
  change document) is linked to its entry in Change documents by `issued_forms.issuance_id`.
  Sets and revisions has a **Subject** column carrying that entry's subject (or the set's own
  title where there is no entry). In the database today the ten ASI sets are linked and none
  has a subject yet. A set that is all project manual now reads "116 project manual sections"
  rather than "0 sheets".
- **Right-click a change document to edit it**, as on the drawings and sets.

---

# Checkpoint — 2026-11-19, 14:25 CST

**The schedule reader, against a real scan.** Jacob sent the contractor's schedule (an MS
Project printout, scanned, one tabloid page, 57 lines) and what the app made of it: 39
activities and 13 headings, Mobilization missing, "Little Rock, …" as a heading. Reproduced
here: 36 and 12. After the changes below: **53 activities, 4 headings** — every line of the
schedule, each under its own number — with 4 cells in red.

What was wrong, found by reading what the reader actually saw (`__schedule`, left on the page
for checks):

- The rows *were* found by number (56 of 57 numbers read). **The dates were not read as
  dates**: the scan runs the weekday into the date ("Mon2/16/26") and the date pattern wanted a
  word break in front. A row with no dates is not an activity, so Mobilization went. Fixed in
  `datesIn`.
- The address is the sheet's own heading above the table; the bar chart's labels to the right
  ("Elec, HVAC", "Block") became headings too. Now: the table ends where its dates end, and
  everything right of that is not row text; where rows sit at an even pitch (they do), each
  word goes to its row by position, rows whose number was not read get their number from the
  pitch, and what is above line 1 or below the last line is dropped.
- Names: the chart repeats each name beside its bar, so it is used as a second reading — the
  name is kept as far as the two agree, unless the chart's copy was cut off by the page edge
  (`tidyScanned`). Stray one- and two-letter leavings and misread durations are trimmed.
- **Red cells** (Jacob: show where the app is unsure). Tried the reader's own confidence
  first: useless — it scored correct dates at zero. What is used instead is the line checking
  itself: a date that is not the weekday printed beside it; a pair that is not as long as the
  duration says (calendar or working days); only one date read; finish before start; a row
  placed by position; a date far from the rest. A cell clears when changed or clicked into.
  On this scan: line 24 (its start is under a mouse pointer in the scan) and line 22.
- Not checked line by line against the sheet by me beyond the names and a sample of dates.
  Lines 36–37 read 12/1/25–12/18/25, which is what the sheet prints.

**Delete set showed "[object Object]".** Two things. The confirmation printed the error object
instead of its message (`ConfirmDelete`, now `message(e)`). And the reason for the error: that
"Bid set · 0 sheets" is not empty — it is the upload that holds the **project manual, 116
section revisions**. The database refused to delete it. `deleteIssuance` now checks and says
so. Deleting such a set is not built; whether it should take the manual with it is Jacob's
call.

**Still not applied:** migration 0039 (schedule history).
**Asked, not built:** reading pay applications from the contractor's PDF with unsure cells in
red; re-reading titles and dates on sheets already uploaded; the iPhone cannot get back from a
tagged sheet to the observation.

---

# Checkpoint — 2026-11-19, 13:45 CST

**The schedule is read by its line numbers, and its issues are kept.**

- **Rows found by number** (`src/lib/scheduleRows.ts`, dependency-free). Jacob: recognition on a
  scan is unreliable; find the line numbers first, then read each number's row. The reader's
  words are taken with their positions (Tesseract's word boxes for a scan, pdf.js's for a
  printed PDF). The left-hand column of numbers is found — the numbers sharing an edge, and of
  those the longest run that climbs down the page, so a stray figure in the column drops out —
  and every other word goes to the number whose line it sits on. Words on no number's line are
  headings. A row whose number was not read, alone between two that differ by two, is given the
  one between. Activity IDs (A1010) count as numbers. A page with no such column is read line by
  line as before.
- **A Line column in the edit window**, for finding a row on the sheet; headings carry none.
  It is not saved with the activity.
- **Tried and taken out:** reading each row a second time on its own, enlarged. On the test scan
  it made names worse (a skewed row's strip cuts through its neighbours). Also tried 300 dpi in
  place of 250; it was worse on the same scan and was put back.
- **Not known:** how this does on Jacob's scan — I have not seen it. The test scan is one I
  made: it reads 11 of 11 activities with every date right, as it did before.
- **Issues of the schedule** (`scheduleDiff.ts`, `scheduleVersions.ts`, `History` in
  `Schedule.tsx`). Each read-in is an issue with a date and a name. What it changed is worked
  out against the schedule as it stood — moved (start/finish, by how many days), added, not in
  this issue (left in the schedule, never removed), new progress — and kept with the whole
  schedule as it stood after. The schedule page lists the issues, each opening to its changes
  and to the schedule as it stood, with how far the last finish moved. Matching is by name, so
  a renamed activity reads as one missing and one added.
- **Migration `0039_schedule_versions.sql` is NOT applied** — the confirmation went unanswered.
  Until it is, a read-in still updates the schedule and says the history is not being kept.
- `checks/schedule.test.ts` (25 cases), `checks/t_sched.py`, `checks/t_issues.py`.

---

# Checkpoint — 2026-11-19, 13:05 CST

- **Pad: select, right-click, text size.** A *Select* tool: click a stroke or text box, or drag
  a box round several; drag what is picked to move it. A bar at the top gives colour, line
  width (ink only), delete and done. A right-click picks what is under it with any tool in
  hand. Delete/Backspace removes the selection; Redo brings it back. Recolouring and moving
  are **not** undoable. Text boxes have a round **A** grip: drag up for larger type, down for
  smaller (`style.size`). `setMarkStyle` in `pads.ts`; `PadSurface` now redraws when a mark
  changes under the same id (its cache went by id alone). `checks/t_select.py`.
- **Close on a notebook did nothing — my regression from 11:50.** Close went to `/field-notes`,
  which since the Notebooks page was retired sends you straight back into the book. Close (and
  Escape on the contents page) now go to the main page.
- **A book's contents page has an exit button, not the CA menu** (Jacob, 12:13). The page
  already has *New page* and the list of pages, so the corner menu's only job there was the way
  out: a round × at the top right (`.nb-exit`). Inside a page the corner menu is unchanged. The
  paper setting is now reachable only from a page. `checks/t_notebook.py` still clicks the menu
  on the contents page and will fail there until it is updated.

---

# Checkpoint — 2026-11-19, 12:45 CST

**The change register can be corrected, and carries cost and time.** (`src/pages/CaLogs.tsx`,
`src/lib/issued.ts`; no schema change.)

- *Edit* on any row: number, subject, issued day, change to contract cost, change to contract
  time (days). Enter saves, Escape cancels. It corrects the register's record only — the PDF
  that was issued is not rewritten, and the row says so while editing.
- **Cost** and **Time** columns. Kept in the document's own `values` (`chg.cost`, `chg.days`);
  a proposal request's cost *is* its price (`pr.price`), one figure. A change order with no
  figure of its own shows the sum of the proposal requests it covers, in grey italics.
- **Totals at the top** of the register (Jacob asked for the bottom, then the top): *Change
  orders to date* — cost and days — and, beneath, *Proposal requests not yet in a change
  order* (not-accepted ones left out). They are separate lines because adding both would count
  a PR twice once it is rolled in. **This split is my reading**; Jacob asked only for "a total
  cost and time". Totals are over the whole project, not the filter.
- `checks/t_reg.py`.
- **Form templates, seen by someone who is not an admin** (Jacob's screenshot, 12:03): the page
  was squeezed into the 150 px tools column and the options overlapped it, because the grid
  kept three columns after the tools column was left out. `.editor.readonly` gives it two.
  Never seen before because every check signed in as the owner. The database shows why he saw
  it: the account signed in at 11:58 is a second address of his with the firm role `member`;
  the owner is his AMR address. Also fixed: the editor's Delete label was red on red.
- **Numbers are no longer in monospace** (Jacob: the zeros are harsh). Sheet, project and
  document numbers were set in the system monospace (Cascadia Mono / Consolas on Windows),
  whose zero is slashed or dotted. Ten rules now use the text face with tabular figures, so
  columns still align. Left alone: the outline text boxes (`textarea.mono-ish`), where the
  fixed width is what keeps indents lined up. Issued PDFs were never affected.

---

# Checkpoint — 2026-11-19, 12:25 CST

**Tag marks, tagging with pan and zoom, dots on the sheet, and invitations as a link.**

- **Tag marks** (`src/lib/tags.ts`, `src/components/TagMark.tsx`). A tag on a drawing is now a
  mark: colour for the trade, shape for the family of work (structure and site square,
  envelope and openings diamond, finishes round, MEP and fire hexagon, general triangle), and
  two letters — or a mark drawn by hand in place of the letters. Settings → Observation tags:
  click a trade's mark to change it for all its tags, or a tag to give it its own (shape,
  colour, up to three letters, or Sketch). A firm's row for a built-in tag restyles it; a row
  labelled `*` is the trade's mark. Migration `0038_tag_marks.sql` (three nullable columns on
  `observation_tags`) **applied with Jacob's confirmation**. An observation's mark is found from
  its trade and the tag its name contains (`markOf`) — still no tag column on observations.
- **Tag to drawing pans and zooms** (`SheetSpot.tsx`): drag, pinch, wheel, − / + / Fit; only a
  touch that did not move places the tag; past 2.2× a finer picture (5200 px) replaces the
  first. The tag shows as its mark at a constant size. Found while testing: *Tag it here*
  appearing made the bar taller and slid the sheet 24 px under the tag just placed — the button
  is now always there, disabled until a spot is chosen.
- **On a sheet, observations are dots** (`ObservationPins.tsx`, `.obs-dot`): 12 px in the
  mark's shape and colour; under the pointer the full mark and number; after 0.7 s the trade
  and what was seen. No hover on a touch screen: dots are a little larger there and a tap opens
  the observation, as before.
- **Invitations no longer send email.** `invite-user` v2 (deployed) uses
  `auth.admin.generateLink` — per Supabase's reference, it generates the link without sending
  it — and returns the link; Settings shows it with *Copy link*. Someone who has not signed in
  yet gets a fresh link from *New link* beside their name (a recovery-type link). **Not tried
  against production**: no real invitation has been made, and how long a link lasts was not
  looked up. Jacob also asked that people get access to projects they add: `create_project`
  already does this (checked in the database's function body).
- **The invitation is a whole email to paste** (Jacob, 11:49). After *Add and make a link*,
  Settings shows the email as it will paste — "You are invited to do CA the Zen way:", the CA
  mark with the link on it, a text link, and a line saying the link is theirs and works once —
  with *Copy the email* (rich and plain forms on the clipboard together) and *Copy just the
  link*. The mark is loaded from the live site's `icon-192.png`. Checked: the clipboard's HTML
  has the mark inside the link. **Not checked:** pasting into Gmail itself.
- `checks/t_marks.py`, `checks/t_access.py`.

---

# Checkpoint — 2026-11-19, 11:50 CST

(The 16:20 heading on the entry below was written from a clock that was wrong; Jacob's messages
for this entry are stamped 11:27–11:31 CST.)

**The pad's finger and menu, a photo table behind the field report, and the notebooks menu.**

- **Finger sketching and the pad's menu mark.** Jacob: the first finger motion does not
  register and the logo takes many taps. Cause found by reproduction, not on his phone: the pad
  calls any touch wider than 45 CSS px a palm (`PALM_ACROSS` in `ink.ts`), swallows it at the
  capture phase and then swallows the click. `checks/t_touch.py` sends touches 30 and 60 px
  across: before, at 60 px no stroke was kept and five taps never opened the menu; after, every
  stroke is kept and the first tap opens it. The size rule now applies only when a pen is how
  the person writes (`fingerDraws` off) and the contact is on the page, not on a button
  (`sized` in `isHandContact`). The pen-tail rule is unchanged. **Not known:** what width his
  iPhone actually reports — the reproduction shows the rule could do this, not that it did.
- **Photo table for the field report** (`src/lib/photoSheet.ts`, `photoSheetBytes.ts`,
  `templates/photoPages.ts`, `components/PhotoSheet.tsx`; wired into `IssueForm` via `photos`
  and `sheetKey`, passed from the notebook page). "Attach the photographs as a table" in the
  export: pages are previewed as they will print, from the same layout function that draws the
  PDF. Rows are chosen as a whole (not greedily) so each row's photographs share one height and
  fill the width; a page's rows give up to 16% so another row joins rather than leaving a gap.
  1–4 across. Click a photograph to crop (eight grips), caption, move earlier/later, or leave
  out; choices are remembered per page in `localStorage` (`cazen.photoSheet.<page id>`), not in
  the database. Captions print as "01 – CAPTION", taken from the firm's June 2026 Westrock
  report read from Google Drive; **the photo table in those reports was not seen** — the Drive
  text has only the "SITE PHOTOS" heading, so the table's look is mine, not copied.
  Includes the page's documentation photos and the day's observation photos.
  `checks/photos.test.ts` (layout rules), `checks/t_photos.py` (dialog → crop → issued PDF).
- **Notebooks menu.** Sidebar books shorter (54×68) with a soft shadow. The Notebooks page is
  gone: `/field-notes` opens the field notes; on a phone the bottom bar says "Field notes" and
  Meeting notes and Observations are under More.
- **Pad text.** Jacob could not see what he typed on the pad, though the thumbnail showed it.
  The text layer was laid out in page units — type 0.03 px high, scaled up by a transform —
  and a browser asked for type that small may draw nothing. The layer is now laid out ×1000
  (30 px type) and scaled down (`TEXT_UNIT`). **Not seen failing here:** the test browser drew
  the old text; the cause is inferred from his report and the 0.03 px size.
  The text tool now drags out a box (a tap still gives the usual width); typing wraps at the
  box's edge and the box grows downward; with the text tool chosen every box shows a side grip
  (wrap width) and a corner grip (width and height), saved by `setMarkGeometry`. The box is an
  editable block, not a textarea. The thumbnail wraps text to the box width, approximately.
  `checks/t_text.py`.
- **Redo in the pad**, beside undo: what undo removed goes back under the same id; anything
  new drawn empties it. On phones the bar's keys are 33 px so ten fit.
- **Notebook menu**: the mark fades away while the menu is open, as on the pad; a touch
  anywhere else closes it (it also still closes by itself after a few seconds).
- **Asked, not built: Google Photos behind Library.** Google's own documentation says the
  Library API now reaches only what an app itself created and that choosing from a person's
  library goes through the Photos Picker API (OAuth, a picking session, then download). It
  needs a Google Cloud OAuth client for the app, which does not exist yet.

---

# Checkpoint — 2026-11-19, 16:20 CST

**Project access, and inviting people from the app.** Jacob: invite by email as ArchMGMT did,
and to begin with, add and remove people from projects.

- **The rule changed** (migration `0037_project_access.sql`, applied with Jacob's confirmation):
  everyone in the firm used to see every project. Now `is_member(project)` is true for the firm's
  owners and admins, and for people in `project_members`. Firm membership still gives the firm
  itself (name, brand, templates). `create_project` puts its creator on the project.
  `project_members` gained admin read/add/change/remove policies. `firm_people(firm)` lists
  members with email and name, to admins only. `user_id_for_email` is callable by the service
  role alone.
- **`invite-user` edge function** (`supabase/functions/invite-user/index.ts`, deployed v1, JWT
  required). Checks the caller is a firm admin with the caller's own token, checks the projects
  belong to that firm, then with the service key: invites the email if it has no account, adds
  firm membership as `member`, and adds the chosen projects with the chosen project role.
- **Settings → People and access** (admins only; `Access` in `Settings.tsx`, `src/lib/access.ts`):
  invite with email, project role and projects; a table of everyone with their firm role
  (member / admin), the projects they are on as tick boxes, and Remove.
- Verified with `checks/t_access.py` against the stand-in: list, add to one project and remove
  from another, send an invitation with role and projects. **Not verified live**: the function
  has not been called in production, and no invitation email has been sent. Supabase's built-in
  mailer is rate-limited, and the app's address must be in the project's allowed redirect URLs
  for the link to land back in CAzen.

**Attendees did not add.** Jacob typed his own name and it was not kept. The API log shows no
write to `project_people` at all: the name was typed and the visible button, *Done*, was pressed —
which closed the list without keeping it; *Add to the list* sat lower, in a part of the page too
small to show it. The list is now its own sheet over the page, *Done* keeps a name that was typed,
and the signed-in person is always offered first ("you"), before anyone is on the project's list.

**Migration 0036 applied** (third attempt): page `location` and `observation_tags` exist, so the
Location line and custom tags in Settings are live.

**Sidebar notebooks**: three pocket-notebook covers side by side, 54 × 85 (the 3½ × 5½
proportion), initials only, no table behind them.

**Weather.** Jacob reported it not working. `json()` in `src/lib/weather.ts` sent a custom
`X-CAzen` header; a header of our own makes the browser ask the weather service's permission
first, which it does not give, so the request never left. The header is gone. A lookup asked for
by hand that finds nothing now says so. Not confirmed against the live service from here — the
workspace cannot reach it.

---

# Checkpoint — 2026-11-19, 15:40 CST

A run of requests from Jacob, all shipped to `main` except where a database step is waiting.

- **Attendees.** The Names part of a page is *Attendees*. *Add name* lists the people on this
  project, anyone written on the book's earlier pages, and people from the firm's other projects
  (`listPeopleElsewhere`; picking one puts them on this project); *Add name to list* takes
  someone new.
- **Meeting pages have no weather.** Both kinds of page have a **Location** line; ⌖ fills it from
  GPS — "Job site" and the project's address when the phone is within 400 m of the project's
  pin, otherwise a reverse lookup (OpenStreetMap). A new visit starts at the job site; a new
  meeting where the last one was. **The `location` column is in migration 0036, not applied**:
  `canHoldLocation()` probes for it once and the line is simply absent until it exists.
- **The observation form, to Jacob's markup.** The heading is the observation's name and can be
  clicked and typed into (it is the same text as "What was seen"); under it the date and
  *Discussed with (optional)*, offered from the project's people. Photos and *Tag to drawing* sit
  side by side; the tagged sheet shows as a tile with a crop of the drawing around the pin.
  "Discussed with" is kept as the last line of the detail (`Discussed with: …`) — no new column.
  One drawing tag per observation; the markup shows several, which needs a column.
- **Drop to upload** on the schedule's *Read from a PDF* and on Contracts → *Add a document*
  (`.drop-spot`); a dropped contract names itself from its file name.
- **Settings by category.** Five folding groups — firm, brand and account; forms and tags;
  drawings; file storage; requests and issues — remembered per device (`Group` in `Settings.tsx`).

**Waiting on Jacob**

- Migration `0036_observation_tags_and_page_location.sql` (custom tags table + page location).
  Two confirmations were cancelled by the client within half a second and a third timed out.
- **User access in Settings is not built.** `firm_members` already lets an admin change a role
  or remove someone, but the app cannot show who they are (emails live in `auth.users`) or invite
  anyone without a database function and an edge function with the service key. What ArchMGMT's
  version did, and which permissions are wanted, is not known here.
- The Westrock Landing field reports folder has still not been opened (dialog unanswered).

Verified: `t_notebook.py` (attendee groups, no weather on a meeting, location from GPS on the
stand-in, which has the column), `t_tag.py` (new form, tag, drawing tile, settings groups),
`t_sched.py` after the drop spot. The contracts drop spot was built and compiled, not driven.

---

# Checkpoint — 2026-11-19, 14:50 CST

**The notebooks are the sidebar menu.** Jacob marked up the Notebooks page: he does not need the
page, the table with the three books should be the menu. `Shelf` moved to its own small file
(`src/components/Shelf.tsx`, so the lazy notebook chunk is not pulled into the first screen) and
is rendered, small, in place of the three text links; the open book is lifted. The page at
`/field-notes` is still what the phone's menu opens, since a phone has no sidebar.

**Observations can be tagged to a drawing from the form.** *Tag to drawing* in `ObservationForm`
opens `SheetSpot` (`src/components/SheetSpot.tsx`): the project's sheets, searchable; then the
sheet, touched once where it was seen; *Tag it here*. It writes the same `sheet_id`,
`revision_id` and `region` a pin placed on the sheet does, so it shows as a pin in the viewer.
It can be moved or taken off.

**Issue tags by trade.** `src/lib/tags.ts`: seventeen trades, each with a fixed colour and a few
built-in issues (Glazing: sealant missing, glass damaged, hardware adjust…). Picking one sets the
observation's trade and names it if it has no name. A pin wears its trade's colour; a closed one
is faded. No new column: the tag is the trade plus the title.

**Custom tags in Settings** — built, waiting on the database. Settings → Observation tags lists
the built-in tags and adds the firm's own (trade, label, and a colour for a new trade), kept in
`observation_tags`. **Migration 0036 is not applied**: the confirmation was cancelled by the
client half a second after it was sent, twice. Until it is, the settings card says so and the
built-in tags work.

Verified with `checks/t_tag.py`: the three books in the sidebar; tag Glazing → Sealant missing;
tag to A-101 at a touched point; saved with trade, sheet and region; the pin appears on the sheet
at that point in the glazing colour; Settings shows the seventeen trades and the note.

---

# Checkpoint — 2026-11-19, 14:15 CST

**The still picture of a pad was wrong in two ways, both since the ink engine.** Jacob sent the
notebook's sketch preview: fat wedges on a blue ground. `PadStill` (`src/components/NotePad.tsx`)
is what every thumbnail and read-only pad uses, so the pad cards had it too.

1. `.ground-line { stroke-width: 1 }` in CSS overrides the attribute, and in an SVG whose view
   is about one unit across, 1 is the width of the page: the ruling flooded the picture with its
   colour. Now `1px` with `vector-effect: non-scaling-stroke`.
2. `Stroke` worked the outline out in the pad's units. The stroke maker pads a single-point
   stroke by one whole unit, so a tap became a wedge across the page and a highlighter dab a
   flood. It now scales the points to pixels (900 across the view), as `PadSurface` does, and
   draws the result back at the pad's scale.

The notebook's sketch frame also passes its own shape to the still, so it fills the frame
instead of sitting letterboxed. `checks/t_still.py`: a wave, a box, two taps and a highlighter
dab — the dab is 4% of the picture's width where it had covered all of it.

**Not done:** the Westrock Landing field reports have not been read for categories. The folder
dialog on Jacob's computer closed unanswered.

---

# Checkpoint — 2026-11-19, 13:55 CST

Six things from Jacob on the notebooks, all in `src/components/Notebook.tsx` unless said.

- **Text sits on the ruling.** The page-wide ruling could not line up with writing areas that
  start wherever the layout puts them. Ruling now belongs to the writing area itself
  (`.nb-ruled`): drawn at the text's own 32 px line height, scrolling with the text, lifted 6 px
  so the rule runs just under the baseline. Measured from screenshots at 1× and 3×: the gap from
  the bottom of the writing to the rule beneath is the same on every line (1 px with
  descenders, 4 px without; 0 and 3 at 3×).
- **Weather from GPS.** A visit page with no weather asks the device where it is
  (`navigator.geolocation`, six-second limit), falls back to the project's location, and looks
  up the observation nearest the page's time with the existing `weatherAt` (api.weather.gov —
  US only, last 6.5 days). The field stays editable; ↻ asks again.
- **People as project data.** `project_people` (name, company, phone, email; migration 0035,
  applied with Jacob's confirmation) and `src/lib/people.ts`. The Names part of a page picks
  from them; someone new is added once in a four-field row and is there on every page after.
  A page still stores its names as `Name | Company | Email` lines, which is what export takes.
- **Type as it comes; it files itself.** `QuickNote` above the organised notes: one box, the
  page's categories as chips. As words go in, `guessCategory` (`src/lib/noteSort.ts`) lights
  the category they point at — the heading's own words, plus the vocabulary of site, structure,
  envelope, interior, progress, submittals, payment. Enter files the note there. A chip tapped
  before Enter overrides the guess; tapped after, it moves the last note. Words that point
  nowhere go to a catch-all (the page's "Additional Notes", or a "General" category made when
  first needed and removed if emptied). The organised outline below stays editable.
- **The table.** `/field-notes` is a table top with three books lying on it — Fn, Mn, Ob, three
  colours — leading to field notes, meeting notes, and the observations list.
- **Paper.** Ruled, grid, dots or blank, per book, from the corner menu; kept per device
  (`cazen.pref.notebookPaper.<kind>`). It applies to the writing lines, not the whole sheet.

Verified: `checks/notes.test.ts` (16 cases: guesses, filing, moving, the catch-all);
`checks/t_notebook.py` on desk and phone with a mocked location and weather service — weather
filled from the device's coordinates, two people added and offered again on the next page, four
notes filed by their words, the last one moved by tapping a category, paper cycling through all
four. Not verified on the iPhone: the location prompt, and how the quick box feels to type in.

---

# Checkpoint — 2026-11-19, 13:10 CST

**Proposal requests, answered.** Each PR in the change register now carries, on its own line,
the contractor's price, the owner's decision (awaiting / approved / not accepted) and the change
order it is rolled into, chosen from the project's change orders. A strip above the register
says where the PRs stand in money: awaiting a price, priced and awaiting a decision, approved
but not yet in a change order, and in change orders. A change order's row totals the PRs it
covers. An approved PR with no change order is flagged.

- No schema change: price and decision are `pr.price` and `pr.decision` in the PR's own
  `issued_forms.values`; the link is the existing `issued_form_links` (`coverWith` / `uncover`),
  now also reachable from the PR's side. `prPrice`, `prDecision`, `setPrResponse`, `prStanding`
  in `src/lib/issued.ts`; `PrResponse` in `src/pages/CaLogs.tsx`.
- Not done: the price does not yet flow into the pay application's change-order lines or the
  contract sum — those are still entered on the pay application.

Verified with `checks/t_pr.py`: price two PRs (one a credit), approve one, decline one, roll the
approved one into CO-001; the strip and the CO row follow at each step.

---

# Checkpoint — 2026-11-19, 12:50 CST

**Notebooks, to Jacob's drawn layout.** He marked up a screenshot: the menu area is called
*Notebooks*; a book opens as a borderless full-screen page; one page per day or meeting, laid
out as — day and weather top left, names top right, then typed notes | sketch | documentation
photos over observations. He also asked for the binder holes to go, and for *New page* to live
in a collapsible corner menu like the phone's.

- `Page` in `src/components/Notebook.tsx` is a CSS grid in those areas (`.nb-page`), filling the
  screen; each part scrolls inside itself. Below 760 px it reads top to bottom instead. A
  meeting page is head | names over notes | sketch.
- Typed notes are one outline field with the existing `OutlineTools` (promote, demote, bullet,
  number, bold, italic, underline, caps), starting from the template's headings. The
  category-per-box editor from the previous checkpoint is gone; `parseSections` /
  `writeSections` remain in `visits.ts`, unused.
- Sketch opens the pad full screen. Photos are a gallery: thumbnails with their labels, a
  click-through viewer with previous/next, *Take a photo* and *Library*; a photograph just taken
  opens with its label box focused. Labels are `site_visits.photo_labels` (path → text).
- Observations use the same `ObservationForm` as the sheets and the Observations list, opened
  over the page, dated to the page's day. The Documentation | Observation camera slide from the
  previous checkpoint is removed — each part now has its own way in.
- Names is `site_visits.names`, one to a line, carried forward from the last page and exported
  as participants.
- `BookMenu`: the ensō in the corner opens to New page, Contents, Back, Forward, Close, and
  puts itself away.
- Migration `0034_notebook_names_and_photo_labels` (two nullable/defaulted columns) applied to
  production with Jacob's confirmation.

Verified with `checks/t_notebook.py` on desk and phone: paper flush to all four screen edges;
the five parts present (three for a meeting); names, typed notes, two labelled photos and an
observation saved; label box focused after a photo; gallery steps between photos; export
carries notes, observation and names. Not verified on the iPhone or with a real camera.

---

# Checkpoint — 2026-11-19, 12:10 CST

**Field notes is a notebook.** Jacob's direction, replacing the four-zone visit screen built two
hours earlier: field notes should feel like opening a small notebook and recording by sketch or
typing, with categories already on the page; the report in its title block is something the book
exports, not how it is used; a quick switch between *documentation* and *observation* that then
opens the camera; a meeting-notes book that is the same thing without photographs or
observations; and the menu item as a book you open and flip through, full screen.

- `/field-notes` is a shelf with two closed books (`Shelf`). Opening one is `Notebook`
  (`src/components/Notebook.tsx`), full screen: a contents page, then a ruled page a visit or a
  meeting, turned with the arrows in the bar, the arrow keys, or from the contents. Pages turn
  with a short 3-D flip (off under reduced motion).
- A page's typed notes are categories — heading and lines — from the firm's template starters
  (`fr.observations` for a visit, `mn.notes` for a meeting). They are stored as the same outline
  text the templates use (`parseSections` / `writeSections` in `src/lib/visits.ts`), so export
  needs no conversion. Categories can be renamed and added.
- The camera sits at the corner of a visit page behind a two-way slide, Documentation |
  Observation, which stays where it was left. Documentation adds the photograph to the page;
  Observation asks one thing — what does it show — and keeps it as an observation on that day
  (left blank, it is kept as a plain photograph).
- Sketch opens the existing pad full screen. *Make the field report* / *Make the meeting notes*
  opens the template form filled from the page.
- `site_visits` gained `kind` ('visit' | 'meeting') in migration 0033 before it was ever applied.
  `SiteVisits.tsx` (the four-zone screen) is removed.
- **Migration 0033 was applied to production on 2026-11-19 at about 10:13 CST**, with Jacob's
  confirmation, after two earlier prompts timed out. Checked in the database: 15 columns, row
  level security on, `member_rows` on `is_member(project_id)`, no rows. The books fall back to
  the old list page (`Book` → `Reports`) only on a database without the table.

**Panning and zooming stopped dropping frames.** Three causes in `src/lib/pdf/zoomPan.ts`: a
React re-render of the whole viewer per wheel notch (zoom state now follows 140 ms after the
movement), a layout read per pointer event (`getBoundingClientRect` after the transform write;
the box is now measured on resize), and a sharpen that kept drawing after the hand moved again
(cancelled through `View.onMove`). `checks/t_frames.py`, hatch-heavy sheet, quarter CPU: pan 94
of 306 frames dropped → 5 of 334; zoom out 91 of 141 → 5 of 122; zoom in unchanged, about 21 of
230, cause not found.

Verified: `checks/t_notebook.py` on desk and phone — shelf, new page, categories, typed notes
saved as outline text, a documentation photo, an observation photo with its note, export filled
with both, contents line, and the meeting book with no camera and no photo sections.

Not verified: any of it on the iPhone; the camera slide with a real camera. Pages still need a
signal to be created and photographs still upload at the moment they are taken.

---

# Checkpoint — 2026-11-19, 11:20 CST

**Zooming a dense sheet no longer blanks it.** Jacob reported C-101 going white for a second or
two on every zoom. Cause, in `src/lib/pdf/zoomPan.ts`: `usePageRender` re-drew the *whole page*
on every zoom change, and resizing a canvas empties it — so each step wiped the sheet and spent
seconds redrawing all of it, hatching and all, even when the new size was identical to the old.
Now the whole page is drawn once, at 1.5× what the screen needs at 100%, and not again for zoom.
Sharpness when zoomed in is the detail layer's alone; it draws only what is on screen, off
screen, and is swapped in whole, so the picture goes from soft to sharp and is never taken away.

Measured with `checks/t_zoom.py` on a D-size sheet of 26,880 hatch lines at a quarter CPU speed,
three zoom steps: the drawing was missing from the page for 2.1 s, 4.3 s and 1.9 s before, and
0 ms after. Longest frozen frame 947 ms → 436 ms. Time until the zoomed view is sharp is about
the same (1.5–1.8 s at that throttle) — that is pdf.js walking every hatch line, and is the next
thing to attack if it still feels slow on the device (a pre-rasterised tile pyramid for dense
sheets is the known answer). Not measured on C-101 itself or on the iPhone.

**Markup: Delete, and no more keep/scratch switch.** Delete or Backspace removes the selected
markup (Backspace used to go back a sheet). The bookmark toggle is gone; everything drawn is
kept, and leaving markup asks once in a bar at the foot — Keep / Discard — with Undo after a
discard or a delete (also Ctrl/Cmd+Z). `checks/t_markup.py`.

---

# Checkpoint — 2026-11-19, 10:35 CST

Two requests from Jacob after the first check-in, both shipped to `main`.

**The contractor's schedule, read from a PDF — scanned or not** (`7`th commit of the day).
*Read from a PDF* on the schedule page. A printed PDF's words are read with pdf.js; a scanned
page is drawn at 250 dpi and read by Tesseract in the browser (`src/lib/pdf/scheduleText.ts`),
its files served from the app's own address under `ocr/` and fetched only when a scan is opened —
they are not put on a phone ahead of time. `src/lib/scheduleRead.ts` turns lines into
activities: the first two dates are start and finish; ID, duration and percent come off the
name; a line of words above activities is a heading; in a scan, O/l/S/B are mended inside
date-shaped tokens only. Everything is previewed and editable before it is kept. A row whose
name is already in the schedule updates that activity, so next month's issue keeps its ties.

**Tying activities to pay lines by name.** Contractors do not schedule by their own pay lines,
so `suggestLines` matches on shared words with the trades' other names counted as the same
(drywall / gypsum board, mechanical / HVAC, footings / foundations). Offered in the import
preview and, for activities already there, from one link. The Covers column names the line.

**A field report begins as a site visit.** *New field report* starts a visit and opens it as one
page in four parts: sketch pad, typed notes beginning with the template's headings (the
`starter` of `fr.notes`), site photos, and that day's observations. Four on screen when wide,
one at a time behind a row of four on a phone. The list shows each visit as a page with cover
photo, day and time. *Write the field report* opens the form filled from the visit.
`src/lib/visits.ts`, `src/components/SiteVisits.tsx`, migration `0033_site_visits.sql`.

- A visit's observations are the ones seen on its day — no link table, so two visits on one day
  share them.
- **Migration 0033 is not applied to production.** The database asked for confirmation and none
  came. Until it is applied the Field reports page is exactly what it was (`VisitsNotSetUp`).

Verified: `checks/schedule.test.ts` (15 cases); `t_sched.py` reads a synthetic scan (skewed,
blurred, speckled, with bars) end to end — 11 activities, 3 headings, every date right, 7 tied;
`t_visit.py` runs a visit on desk and phone, and `t_visit.py missing` the fallback.

Not verified: a real contractor's scan; anything on the iPhone.

Found and not done: a visit is not kept offline (no outbox job yet); photographs still need a
signal at the moment they are taken (`keepPhoto` uploads first); the report written from a visit
is not linked back to it (`issued_id` is there for it); weather is typed, not looked up.

---

# Checkpoint — 2026-11-19, 09:40 CST

First stretch of the push toward a pilot-ready app. Jacob's direction for this push: site-visit
flow, polish of what exists, and desk paperwork; ship straight to `main`; additive schema changes
may go straight to production, anything that alters existing data waits for his OK; he tests on
the device at a couple of check-ins. No schema changes were needed in this stretch and nothing
was written to the production database.

## What changed (commits `1f43496` → `HEAD`, five commits)

**CAzen opens with no signal.** The largest gap found. "Field mode" held a project's rows and
drawings on the device, but the app itself was never there: no service worker, and the firm, the
project list and the sheet list came only from the network. A project taken to the field could
be read only in a tab that was already open.

- `vite.config.ts` writes `sw.js` at build time (it needs the hashed file names). The page is
  asked for network-first with a three-second limit, then from the device; everything else is
  fingerprinted and comes from the device. Old caches are dropped on activate.
- `storedSession()` in `src/lib/supabase.ts` reads the saved session without asking the server.
  supabase-js retries a refresh for up to thirty seconds offline and then answers "nobody"; the
  app now opens on the saved session and the library's answer replaces it. A sign-out still
  signs out, and clears what was remembered.
- `src/lib/remembered.ts`: the firm (`cazen.kept.firms`) and the project list
  (`cazen.kept.projects.<firm>`) are shown from the last good answer and refreshed behind it.
  This also takes two round trips off every ordinary start.
- `localCurrentSheets` / `localSheetRevisions` in `src/lib/sheets.ts` work the current set out
  from the field copy the same way the `current_sheets` view does. The Drawings list shows the
  device's copy at once and the server's when it answers, so one bar that never delivers is no
  worse than none.
- On a phone, "Take to the field" lived under Edit, and Edit is hidden on a phone. Each project
  in the list now carries it, and says when it is on the device.

**A punch walk without the back-and-forth.**

- On a phone, Observations and Meeting notes could not be reached at all. Field notes now opens
  on Observations (`/field-notes` with no part named), with the three parts as a row across the
  top wherever there is no sidebar.
- *Keep and add another* leaves the form open with type, area, trade and day still set. Enter in
  the title keeps it. Areas and trades already used on the project are offered. The type last
  used is remembered per device.
- The camera tile opened the camera and nothing else; *Library* sits beside it for photographs
  already taken.
- The corner mark no longer covers the last thing on a page; selects outside form blocks are
  drawn like the fields beside them.

**First screen 275 kB instead of 1,559 kB.** Pages are fetched when first opened
(`page()` in `src/App.tsx`); a page asked for by a stale copy after a release reloads once. The
service worker still puts everything on the device.

**A contract can be set up from the app.** A project with no contract showed "No contract set up
for this project yet" and nothing to press — the eight applications in the database had been put
there by hand. `ContractSetup` takes contractor, sum and retainage, and the schedule of values
is pasted from a spreadsheet or G703, read (`src/lib/sovPaste.ts`), shown with its total against
the contract sum, and kept in one request (`createContract`).

**Small things.** The submittal form ran off the right edge of a phone (`1fr` → `minmax(0, 1fr)`).
"1 current sheets".

## How it was verified

A harness now lives in `checks/`: the built app in headless Chrome at iPhone size (402×874 @3×)
with every Supabase request answered from fixtures, so nothing touches production.

- `t_offline.py` — load, cut the network, reload cold: project list in 0.14 s.
- `t_field.py` — take a project to the field from the phone list, cut the network, reload, open
  the project, the sheet list, and the sheet itself drawn from the device.
- `t_obs.py` — phone menu → Field notes lands on Observations; three observations kept in a row
  offline, listed at once, zero requests while offline, three sent when the signal returns; last
  type remembered.
- `t_pay.py` — paste a schedule, see the mismatch and the match against the contract sum, set
  up; the contract and four lines sent with the right figures.
- `sov.test.ts` — twelve cases for the schedule reader.
- A sweep of nine pages at phone width for anything running off the screen: only the submittal
  form, now fixed.

**Not verified, and only the device can:** that iOS keeps the service worker and field copy for
a home-screen app across a cold launch with no signal; the Camera and Library tiles on iOS; how
Keep and add another feels with the on-screen keyboard.

## Found and not yet done

- Observations and the pad read the network first when the device claims to be online; on a weak
  signal they wait on it. Drawings no longer do.
- Photographs taken offline: the path is cached, but the upload queue was not exercised here.
- Search across sheets is a server function and does nothing offline; `sheetText` is in the
  field copy and could answer it.
- The three open wishlist entries (contracts tabs, G702/G703, project manual) describe work that
  is built; their status in Requests & issues still reads "planned".
- Submittal register, resubmittals and consultant routing remain the largest unbuilt piece.
- No way to add a second contract to a project from the app (the set-up shows only when there
  is none).

---

# Checkpoint — 2026-11-19, 08:40 CST

Written at the point of handing the work over to Fable for a clean-up pass.

## Where it stands

The app is live, deployed, and in daily-usable shape across every area the executive summary
listed as core, including several it still shows as planned. 111 commits, ~16,300 lines of
TypeScript across 94 files, 32 database migrations, 33 tables and 10 database functions.

**Repository:** `AMRJacob/cazen` · **Live at:** GitHub Pages, built on every push to `main`
(CI build check plus a Pages deploy workflow) · **Backend:** Supabase (Postgres, Auth,
Realtime) · **File storage:** Cloudflare R2 · **Stack:** React 19 + TypeScript, Vite,
react-router, pdf.js + pdf-lib, perfect-freehand, Leaflet.

## History at a glance

| Day | Commits | What it was |
| --- | --- | --- |
| 2026-10-29 | 19 | Scaffold, schema, sign-in, projects, drawing upload with revision history, firms, CA logs, submittal covers |
| 2026-11-02 to 11-04 | 10 | Templates, firm branding, project folders, R2 storage, delete/archive, project location |
| 2026-11-17 | 13 | Sets and revisions, markups, punch list as a document, full-screen viewer, app icons |
| 2026-11-18 | 69 | Project manual, change documents, pay applications, observations and photos, construction schedule, contract library, the note pad, and the whole ink engine |

## What is built, area by area

**Drawings.** Sets uploaded in rounds, each with a name, date and revision mark; the name *is*
the revision label. Sheets split out of the set PDF with sheet numbers detected; the cover
comes in with its drawings as one event. Earlier revisions stay viewable and the set can be
read as of any date (`sheets_as_of`). Title block templates read number, title, revision mark
and the date on the sheet, one layout per consultant. Sheets sort by discipline order (firm
default, per-project override), can be filed somewhere other than where their number puts
them, and renamed after upload. Full-text search across every sheet (`search_sheets`). Sheet
numbers on a drawing link to that sheet, and links can also be drawn by hand. Zooming redraws
the sheet rather than stretching it; the sheet moves by transform, not by scrolling. Trades
show in the sheet list; columns are resizable. The index follows you, folds up, and lets a
sheet's name be fixed in place. A phone is told when the drawings it holds have been overtaken.

**Project manual.** Kept the way the drawings are kept — uploaded, split by CSI section number,
revisioned, searchable (`search_specs`). The splitter can be told where section numbers live,
reads footers to say whether a section arrived whole, treats END OF SECTION as the boundary,
and knows a cross-reference is not a section. Page-number reading scrubs dates and job numbers
first, and the checks never claim a page is missing from absent evidence — that was a real bug
and the fix was to make silence mean silence. Preview steps through pages with arrow buttons.

**Markups.** One tool for everything drawn on a sheet: freehand, arrows, boxes, revision clouds,
notes, dimensions, five colours, as a palette that can be moved where you want (a left rail on
desktop). Markups belong to the sheet, not the revision they were drawn on, so they survive a
reissue; the revision is kept as provenance, older marks are shown as older, and they can be
brought forward once checked. Scale is set per sheet by drawing along something of known
length, and every dimension reads from it. Measuring lands on the lines because the lines come
from the file. Anyone on the project may draw or retype a note; only the author may remove one.

**Punch list.** A document in its own right, not a kind of markup — numbered items with status,
trade, and a reference to the sheet and the rectangle of it they concern, so the document
carries a clip of the drawing beside each item. On a sheet they are a layer that turns on and
off.

**Field notes.** Its own section of the sidebar, in three parts:

- *Reports* — field reports and meeting notes, generated from the observations recorded against
  them, with photo pages. Meeting notes are their own document; roman sub-items line up.
- *Observations* — captured where they were seen, offline-first, with photographs (shrunk to a
  2000px JPEG on the way in), trades, and pins placed on the sheet. Three views: everything,
  one visit, or the punch list. Numbering is server-side and signed-in only.
- *Pads* — infinite-canvas note pads you write on with the Apple Pencil, saved as marks, live
  across devices through Supabase Realtime, and readable beside a form while typing the
  document up from them.

**Pay applications.** New application with a date and an editable auto number; the schedule of
values carries forward; this period entered against it; arithmetic checked against a real
application (eight of Jacob's own are in the database). Laid out graphically like the AIA G702,
with the G703 fitted to the screen. Stored material from the previous period is tracked so it
can be seen whether that work moved into work completed. Title lines can be added as you go,
for change orders. Retainage as milestone steps. A change order approved after the period end
no longer contradicts the contract sum — line 2 and the summary net are the same sum by
construction.

**Construction schedule.** Activities linked many-to-many to schedule-of-values lines, drawn as
a Gantt, with a comparison that expresses time and money as percentages of the same thing, so
the schedule can be read against a pay application.

**Change documents.** A register of what was issued and what it covers, including documents
issued but never filed. An ASI is an ASI whether or not it came with a cover page. Titles that
read. Numbers that aren't set numbers.

**Documents and forms.** Field reports, ASIs, PRs, RFI responses, CCDs — auto-numbered,
autofilled with override, CSI suggestions while typing, cover sheet joined to attachments as
one PDF. Form templates per type, startable from the firm's existing PDFs, with an outline
toolbar (promote, demote, bullet, number, bold, italic, underline, caps) and a renderer that
handles italics via oblique fonts and underline as a drawn rule. Headings come from position;
empty ones don't print. A downloaded set is named for the job, the day, and what it is.

**Contract library.** Tabs per contract kind; executed documents locked; the owner–contractor
tab shows contract sum plus change orders.

**Submittals.** Cover sheet with the firm's action stamp, spec section and division suggested.

**Field mode.** Take a project to the field and bring the changes back — an offline store, an
outbox, and a download path.

**Firm and settings.** One firm per deployment, branding editable (logo, letterhead, accent
colour, colours read from the logo). Form templates moved into Settings. Requests and issues
list with "Suggest or report" in the sidebar, which holds the wishlist. Project location with
address search, a map pin and Open in Maps. Weather lookup. Delete a set or revision, archive
or delete a project (admins only), daily project data backup to the project folder.

**Navigation.** The CAzen ensō is the menu: on a phone it opens a tab bar reading Drawings,
Project manual, Field notes, then gets out of the way. The page heading and the project
dropdown are the way back to the project list. Sidebar in order: project selection, documents,
field notes, settings.

## Data model

32 migrations, `0001_init` through `0032_pad_rule_ink`. Tables: firms, firm_members, projects,
sheets, current_sheets, sheet_revisions, sheet_text, sheet_links, sheet_markups, spec_sections,
current_specs, spec_revisions, spec_text, documents, doc_templates, templates,
titleblock_templates, issued_forms, issued_form_links, issuances, contract_documents, pay_apps,
pay_app_lines, pay_contracts, sov_lines, retainage_steps, schedule_activities,
schedule_activity_lines, observations, observation_types, note_pads, pad_marks, feedback.

Functions: `create_firm`, `join_firm`, `create_project`, `archive_project`, `delete_revision`,
`delete_issuance`, `search_sheets`, `search_specs`, `sheets_as_of`, `number_observation`.

Row-level security throughout, on project membership (`is_member(project_id)`). Realtime is on
for pads and marks.

## Conventions and decisions worth keeping

- **Money is formatted in one place.** `src/lib/money.ts` — `NOTHING = '—'` for absence, cents
  only when there are cents, and a `Money` component that pads whole figures with an invisible
  `.00` so decimal points line up down a column. Jacob's standing dislike of `$0.00`
  everywhere is the reason this exists.
- **No dummy or test records in the production database.** Everything written there is either
  real project data or nothing.
- **Optimistic writes.** Anything drawn or recorded appears immediately with a client-chosen
  UUID and reconciles afterwards; nothing waits on the database to show up.
- **Offline-first where it is used in the field** — observations, pads, field copies.
- **TypeScript with `erasableSyntaxOnly`; the React Compiler is on**, so refs are never written
  during render.
- **Checks never claim from absent evidence.** If a footer can't be read, the manual splitter
  says nothing rather than reporting a missing page.
- Repository on Jacob's personal GitHub; app on GitHub Pages; backend on Supabase; files on
  Cloudflare R2 inside the free allowance with a 9.5 GB cap, copies written to each project's
  CA folder.
- The architect uploads contractor submittals and RFIs for now; outside logins come later.
- Wishlist and bug reports live in the app, Settings → Requests & issues.
- Every commit ends with the Claude attribution and session lines.

## The note pad, and what it cost

Worth recording, because the same mistake was made four times and the evidence to catch it was
sitting in the database the whole while. The pen "wasn't drawing", and each diagnosis was wrong
until the last:

1. `touch-action` on child elements — real, but not the cause.
2. `onPointerLeave` combined with `setPointerCapture`. React fires leave on the whole ancestor
   chain when capture emits boundary events with a null `relatedTarget`, so strokes died three
   to five samples in. Removing the handler took stroke lengths from 5 points to 827.
3. The actual original cause: ink width was being quantised to a fixed quarter. At base 0.003
   and a constant Apple Pencil pressure of 0.24, the width came to 0.002136 and
   `Math.round(0.002136 * 4) / 4` is zero. **Every pressure-bearing stroke had been drawn at
   zero width since the pad was built.**
4. Then ink at 0.31 CSS pixels, because the home view zoomed to fit about three page widths.

What settled it each time was the saved stroke data — point counts, and a constant
`avg_pressure` of 0.240 — not reasoning about the input layer. The lesson, written down because
it was paid for: **when something drawn is wrong, read what was saved.**

The ink engine that came out of it:

- Two canvases, not SVG. Adding a path to an SVG layer holding thousands of points makes the
  browser rebuild its picture of the whole layer, which on a phone is long enough to watch —
  that was the blinking. One canvas holds what has been written and is added to a stroke at a
  time; the other holds the stroke under the nib. Verified: laying a stroke down leaves every
  other stroke's pixels byte-identical.
- The stroke in progress goes straight to the canvas. Routing a pen's 120+ points a second
  through React state was the lag.
- Stroke outlines are cached at the zoom they were built at, so a pan moves the canvas under
  them instead of rebuilding them: a 300-stroke page went from ~50ms a frame to inside one.
- Only the ink's own area is cleared each frame, not the canvas — clearing a screenful at 3×
  density sixty times a second to show one line was handing the compositor everything.
- The frame's position is measured once a stroke, not once a sample; a stroke grows in place
  instead of being copied per sample.
- Ink is a filled outline (perfect-freehand), so it swells under pressure and tapers on lift.
  Flow wanders slowly along the stroke. Pencil is filled with its own colour full of holes, so
  the paper's tooth shows through — graphite sits on the high points of a sheet. Punching the
  tooth out of the drawing instead bit through the ruling and through anything crossing
  underneath, so it is a pattern fill; verified a broad pencil stroke over existing ink and a
  ruled line takes nothing from either.
- Imperfections are seeded from the mark, so a stroke looks the same every redraw and nothing
  crawls when panning, and the mark is named before it is drawn so the wet ink and the saved
  ink are the same ink.
- The stroke is drawn about 18ms past its last known point along the line it is travelling, to
  cover the browser-to-display latency that can't be removed. The reach is cut by how sharply
  the stroke turns, and the guess is never saved.

**The hand.** One rule, in `src/lib/ink.ts` as `isHandContact` so it can be tested rather than
guessed at — it was got wrong more than once and the cost each time was writing that wouldn't
write or a page that wouldn't move. A contact is hand if it is palm-sized (>45px across) or if
it lands while the pen is writing or has only just stopped (300ms). A small contact joining a
gesture already under way is a second finger whatever the pen was doing. The question is asked
when the contact lands and the answer kept while it is down. Thirteen cases are checked,
including a device that reports no contact size at all. The earlier version of this rule — any
touch within 1200ms of a pen event, with a pen pointermove pushing the clock along — is what
killed panning and pinching after writing.

## How this work was verified

Numerically or in a real browser, not by eye alone: the money and percent formatters; the
change-order summary split; pay-app arithmetic against a real application; schedule comparison;
sixteen manual footer layouts read and five non-page footers correctly returning none; eight
outline-emphasis round trips; pinch-zoom holding the point under the fingers to the pixel at
five zoom levels; ink width across every nib at pressure 0 to 1; ruling contrast against paper
and ink; stroke isolation and the palm shield driven through a headless browser at 3× device
pixel ratio; and frame timing under 6× CPU throttling.

## Open items

- Firm sign-off on storing project documents in Supabase.
- AMR letterhead PDF, if a background letterhead is wanted.
- A pilot project.
- Relationship to ACC/BIM360 — standalone, or eventually pull sheets from ACC.
- Cloudflare R2 remains a prototype setup (see `docs/SETUP.md`); the move to paid R2 storage is
  the decision if the app is adopted.
- Submittal register, resubmittals and consultant routing are not built.
- AI access to project content is not built.
- 67 lint findings remain, all React Compiler advisories of the same families (purity on event
  handlers defined in the component body, ref writes from handlers, export shape) rather than
  defects.
- The 18ms ink prediction is the one thing in the pad best judged on the device; it is a single
  constant in `src/lib/nib.ts`.
