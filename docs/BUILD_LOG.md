# CAzen — Build Log

A running record of what has been built, decided and learned, so progress can be tracked over
time and so any session (or any model) can pick the project up cold. Newest entry first.

Everything in an entry is drawn from the repository itself — commit history, the source tree,
the migration files — rather than from recollection, unless a line says otherwise.

This file lives in the repository at `docs/BUILD_LOG.md`; the project-knowledge copy is written
from it.

---

# Checkpoint — 2026-11-19, 16:35 CST

**A notebook page's corner menu adds to the page** (Jacob, 16:33: the sketch, photo and
observation buttons must be obvious on a phone; use the CA menu — take out the browsing
arrows, the ruled-sheet button and Contents, and put in the adds). The menu on a page is now
**Note, Sketch, Photo, Observation, New page, Close**; a meeting page has Note, Sketch, New
page, Close. Note puts the cursor in the note box; Sketch opens the pad; Photo opens the
camera; Observation opens the observation form. **Close on a page now goes to the book's
contents** (it left the notebook altogether); the contents page's own × leaves the book. That
is mine: with Contents taken out there was otherwise no way from a page to the other pages
but the arrow keys. The paper setting (ruled / grid / dots / blank) has no button any more
and stays as each device last had it. Driven on a phone: each of the four adds does what it
says; the bar fits a 402 px screen.

**Opened from the home screen, the page runs under the camera** (Jacob, 16:29 and 16:34: the
outer screen of the iPhone Duo keeps a margin under the camera; he uses Chrome and opens the
app from the home screen). The home-screen status bar setting is changed from "default" to
"black-translucent", which is what lets a page lay out from the top of the glass; ordinary
pages start their content below the clock, and a soft shade sits behind the clock because the
phone draws it in white. **None of this could be seen from here**: no Duo, no iPhone. It
applies to every iPhone, not the Duo alone. The setting is read when the icon is added, so
**it changes nothing until the icon is removed from the home screen and added again**. Whether
an icon added from Chrome on iOS honours this setting the way one added from Safari does was
not looked up.

Jacob, 16:36: **the wheel zooms in the title block template editor**, about the pointer, and
the wheel pressed down drags the sheet (it was Ctrl + scroll to zoom; plain scroll moved the
sheet). Space-and-drag still pans; a trackpad's swipe still moves the sheet and its pinch
zooms. The hint under the zoom buttons says so. `t_template.py` wheels in over the title
block and middle-drags.

Jacob, 16:38: **on the Drawings page at a desk, the search row and the column headings stay
at the top while the list scrolls.** The row with search, *Set as of*, *Sheet order* and
*Re-read titles and dates* sticks to the top of the window; the selection bar, when it is up,
sticks under it; the column headings stick under those. The headings' offset is measured from
the rows above them. The table's `overflow: hidden` had to become `clip`, or the headings
stuck to the table rather than the window. Above 760 px only; the phone layout is untouched.
`checks/t_sticky.py`, 120 sheets, scrolled 3,000 px: search row at 0, headings at 63, and at
110 with the selection bar between. Sets and revisions, and the project manual's list, were
not given the same treatment.

---

# Checkpoint — 2026-11-19, 16:30 CST

**The notes board on a phone: topics are bubbles, notes are full width** (Jacob, 16:28: he
likes the dragging and its speed; the text is cramped on an ordinary phone). Below 620 px:

- The topics are a row of **bubbles** under the tray, each with a count of what is in it. A
  card is dropped on a bubble to file it — a short drag to a large target. Subcategories that
  hold something get a smaller, dashed bubble. Tapping a bubble scrolls to its notes.
- The bubbles stay at the top of the screen while the notes section is on it (`position:
  sticky`), so a card picked up far down the list still has every topic within reach.
- Under them the notes are listed by topic in **one column at full width**: a card is 302 px
  of a 402 px screen where it was about 150. Topic names are small capitals; a topic with
  nothing in it is one line.
- The desk layout is unchanged (a grid of boxes, no bubbles).
- `checks/t_board.py`, phone, by touch: two cards dropped on the Structure and Envelope
  bubbles file there and the bubbles then read 1 each.

**Asked, not changed — the outer screen of the iPhone Duo** (16:29: the app leaves the margin
under the camera open; can it be fixed for this phone). The page already asks for the whole
screen (`viewport-fit=cover`) and keeps its controls clear of the camera with the safe-area
insets. As a home-screen app it is set to the "default" status bar, which keeps a band at the
top for the clock; "black-translucent" would let the page run under it, at the cost of white
status text over a light page on every iPhone, and takes effect only after the icon is
removed and added again. Which of these he is seeing — Safari or the home-screen app, and
which way up — is not known, and there is no way from here to see that screen. Apple's
guidance for the Duo was found but not read in detail. Nothing was changed.

---

# Checkpoint — 2026-11-19, 16:23 CST

**A page's notes are cards and boxes** (Jacob, 16:11: forget tagging while typing and the
bulleted list on the page; a board of topics, each typed item a box dragged into the category
or subcategory it belongs in; keep the bullet list for the preview / PDF page).
`src/components/NoteBoard.tsx`, `src/lib/noteBoard.ts`; the Tag/Add box built at 15:56 and the
outline box on the page are both gone from the notebook page.

- A note is typed and becomes a card in a tray. The page's categories are boxes. A card is
  dragged into a box; **+** on a box makes a subcategory inside it; a card dropped on another
  card makes that card a box; a box is dragged with everything in it; a card dragged back to
  the tray is unfiled. Double-click changes words; × removes (asking first if anything is
  under it); *+ Category* adds a box. Works with a mouse and with a finger.
- **Nothing about what is stored changed.** The notes are still the numbered outline the report
  prints — the board reads it as a tree and writes it back (1. / a. / i.) — so the report page
  shows the bullet list as before, and pages written before today open as boxes with their
  lines as cards. What is still in the tray is stored under a heading "Unsorted", which
  **prints as a heading in the report** while anything is in it.
- **It is a board, not a free canvas**: boxes sit in a grid and cards stack inside them; there
  is no panning, zooming or placing things where you like. "Make it like its own pad" could
  mean that; positions would need somewhere to be stored, and this needed nothing new.
- An empty subcategory looks like a box only until the page is reopened; after that it is a
  card until something is dropped on it (the outline cannot tell an empty heading from a line).
- Bold / italic / underline and the outline keys are no longer on the notebook page; they are
  on the report's page. The guess at a category from the words is no longer used.
- `checks/board.test.ts` (11 cases), `checks/t_board.py` (desk with a mouse, phone with touch).

**Tearing out a page takes its sketch and photographs with it** (Jacob, 16:13: they are not
reachable anywhere else; offer to delete or keep the observations). `src/lib/tearOut.ts`. The
question is now a sheet saying what goes; if observations were made on the page, a box —
unticked — offers to delete them too. Used by *Tear out* on the page and by the contents
page's right-click. The photograph files are deleted from storage at once, which needs a
connection; with none they are removed from the device only. `checks/t_tear.py`.

**On a phone each section of a notebook page is its own box** (Jacob, 16:15): head, attendees,
notes, sketch, photographs, observations — white, rounded, the same inset, 12 px apart, below
760 px wide. Measured: six boxes, each 354 px of a 402 px screen.

**The outbox left the last change unsent** — found by the tear-out check, which saw the sketch
deleted and the page not. A change queued while a send was already running was not on that
run's list and nothing came back for it until some later change or the project list's timer.
Present since the outbox was written; it would have held back the last stroke of a quick
sketch or the second of two quick edits. `drain` now goes round again until a round finds
nothing new.

With no signal, a project that is not on the device but has changes waiting now says how many
will be sent when there is a connection. (It is still greyed and cannot be opened — which
means **notebooks work with no signal only in a project that has been downloaded**, a
narrowing of what was built at 14:39 that follows from the 15:49 instruction.)

---

# Checkpoint — 2026-11-19, 16:10 CST

**Each project has a front page** (Jacob, 16:01: a landing page with a project summary, to
land on when leaving a notebook or choosing a project). `src/pages/Overview.tsx`, at
`/project`; *Overview* is first under Documents in the sidebar and first under More on a
phone.

- Choosing a project on the projects page, choosing one in the sidebar's switcher, and closing
  a notebook all arrive here. (They went to Drawings, stayed put, and went to the projects
  page.)
- It shows: number, name, owner, contractor, site address; **Contract** — the contract sum,
  with original, change orders and balance to finish; **Progress** — percent complete with
  completed-and-stored, and which pay application it is as of; **Observations** — the last
  three made, with how many are open; **Last issued** — the most recent change order, CCD,
  proposal request, ASI, RFI response, field report and meeting notes, with cost where one is
  recorded. Each leads to its page. Nothing is entered here.
- "Budget amount" was taken as the contract sum and "current progress" as the latest pay
  application's percent complete (the G702's own figures, via `figure`). The schedule's
  progress is not shown. A project with no contract or no application says so.
- Each part loads and fails separately. `checks/t_overview.py`, desk and phone: a $1,000,000
  contract with two applications reads 45%, $450,000, balance $550,450; the three latest
  observations; one row per kind of document.
- The existing checks clicked a project and expected Drawings; they now go there explicitly.

**The projects page no longer tints the project last opened** (Jacob, 16:08: green is for
download status; a bounce to show the tap). The `selected` class is gone from that list; a
tapped row dips and springs back (0.22 s, off under reduced motion) and then opens. This is
also the answer to 15:48's "the same landing page… with the simpler view", which was not
understood then: the page gone back to had the last project highlighted.

**A notebook's error notice** (16:06: the weather warning was over the way out) is at the
bottom of the page, goes when touched, and clears itself after seven seconds. The weather
complaint is made only when the lookup was asked for by hand.

**Asked, not started — the field report's edit / preview page** (16:05, with a screenshot):
make it look as it will print, with each part editable in place when clicked. This is a
rebuild of `IssueForm`'s layout, not a restyle, and has not been begun.

---

# Checkpoint — 2026-11-19, 16:06 CST

Three on the notebook page (Jacob, 15:58–16:03).

- **The notes box keeps the outline going** (`src/lib/outline.ts`, used by the notebook's
  notes and by every outline field on a form). Enter starts the next item at the same level
  with the next number or letter; Enter on an item with nothing in it steps back out a level,
  and at the top level ends the list. Tab / Shift+Tab and the toolbar's in and out buttons
  give the line the marker of the level it lands on — **1. then a. then i.**, then the same
  with brackets — and a plain line moved in under a list joins it. After any of these the
  numbering around it is put right. Bullets (-) stay bullets; plain lines are never numbered
  by Enter. Before: Enter gave a bare new line, and in/out moved the indent and left "2."
  sitting a level down.
  **The 1. / a. / i. order was taken from the app's own templates and renderer, not from
  Jacob's old meeting notes, which he pointed to and which were not opened.**
  `checks/outline.test.ts` (20 cases), and typed for real in `checks/t_page.py`. The caret is
  now placed in the same step as the text (it was a frame later, and a letter typed quickly
  landed in the wrong place — found by that check).
- **Observations on a page** (Jacob: they show on every field note — is it because they are
  not marked complete? No: a page listed everything observed on its *day*, and his four pages
  are all today's). A page now lists what was made while it was the page being written —
  from the page's own start time until the next page was started — and then, under a line
  reading **Previous observations**, everything made before that which is not closed, newest
  first, each with its day. There is still no link in the database between an observation and
  a page; it goes by time. The contents page's counts and the exported report still go by
  day, unchanged.
- **Right-click a page in a notebook's contents → Open / Delete this page** (asks first; the
  page's sketch, photographs and observations are kept, as with *Tear out* on the page).

---

# Checkpoint — 2026-11-19, 16:01 CST

**The pad at a desk** (Jacob, 15:56).

- **Text can be moved.** A text box's own pointer handling kept every press for typing, so
  Select never saw it. Two ways now: with *Select*, a text box is picked up and dragged like a
  stroke; with the text tool in hand (or while typing), each box has a round ✥ grip at its top
  left to drag it by.
- **The wheel zooms, about the pointer; the wheel pressed down drags the paper** — as on a
  sheet. Before, the wheel moved the paper up and down and only Ctrl + wheel zoomed. A
  trackpad's two-finger swipe still moves the paper and its pinch still zooms; a swipe is told
  from a wheel by arriving in small steps (under 40) or sideways. **That threshold is a
  guess** and was tried only with a synthetic wheel. The listener is now attached directly so
  Ctrl + wheel no longer zooms the whole browser page as well. Only the main mouse button
  draws.
- **Right-click menu on the pad**: on a mark — Cut, Copy, Paste, Duplicate, Delete; on bare
  paper — Paste, when something has been copied. Paste puts the copy's top-left corner where
  the menu was opened. Ctrl/Cmd + X, C, V, D do the same. What is copied is kept for as long
  as the app is open, so it can be pasted onto another pad; it is not the system clipboard.
  Pasted and duplicated marks arrive selected, with Select in hand, ready to be placed, and
  Undo removes them.
- `checks/t_padmenu.py` (1440 px): wheel in and back out returns to the same scale; middle
  drag of 80, 50 moves the view by exactly that and draws nothing; the menu's five actions
  change the mark count 1 → 2 → 3 → 2 → 3 → 2 with the server told each time; a text box
  dragged by its grip, and by its body with Select, is saved at its new place.

---

# Checkpoint — 2026-11-19, 15:56 CST

**The note box on field notes and meeting notes: words, then Tag and Add** (Jacob, 15:55, with
a sketch: the entry section is busy on a phone; put a Tag button at the right of the box
instead of every tag showing). `QuickNote` in `Notebook.tsx`.

- The row of category chips is gone. The box is the words, and at its bottom right **Tag**
  and **Add**, in that order, as drawn.
- **Tag** opens the page's categories as a list; choosing one closes it. Touching anywhere
  else closes it too.
- The guess from the words still happens. Where the note is going is said in a few grey words
  at the bottom left — "Under Structure" while typing, "Filed under Structure" after — rather
  than by a lit chip. That line is mine; the sketch has only the two buttons.
- With the box empty after adding, **Tag** moves the note just added (as tapping a chip did).
  Enter still adds.
- `checks/t_quick.py`, phone size: no chips; Tag then Add at the right; pick Envelope → filed
  under Envelope; Tag afterwards → moved to Structure; Enter adds with the guessed category.
  `t_notebook.py` (already stale) looks for the chips and will fail there.

---

# Checkpoint — 2026-11-19, 15:52 CST

Four more from Jacob on the phone (15:44–15:50).

- **Field notes "isn't even loading"**, then "it did after a refresh". Not reproduced. The
  likely cause is the pace of today's releases: a copy of the app opened before a release asks
  for a page file that the release replaced. The app reloads itself once when that happens;
  that it did not here is **not explained**. One related thing changed: a copy of the app
  still open in another tab no longer blocks a newer copy from upgrading the device's
  database (`onversionchange` closes the old connection).
- **Sketch pad, drawing with a finger: two fingers pan and zoom.** With "a finger draws" on,
  every touch drew, so a second finger started a second stroke. Now the second finger landing
  drops whatever the first had begun — unsaved — and the two move and pinch the paper; one
  finger alone draws as before. `checks/t_twofinger.py`: one stroke kept; a two-finger spread
  and drag keeps no stroke and changes zoom and position; the next single finger draws again.
- **No signal: projects not on the device are greyed and cannot be opened** (project list).
  They read "Not on this device — needs a connection". Downloaded ones are unaffected; when
  the signal returns the grey goes. `t_keep.py`.
- **Signal lost while inside a project that is not on the device**: a notice across the top
  of every screen, the sheet viewer and notebooks included — "Not connected to the internet.
  Connect to the internet to keep working." It goes when the connection is back. A downloaded
  project shows nothing and carries on. `checks/t_notice.py`. It is a notice, not a lock: the
  screen underneath can still be touched.
- **Not done — "when traveling back to the projects page in the phone app it needs to be the
  same landing page and the original page with the simpler view"** (15:48). The page shown on
  arriving and the page gone back to are the same page in the code; what differed on his
  phone is not known, and nothing was changed for it.

---

# Checkpoint — 2026-11-19, 15:42 CST

**Markups can be moved, and notes reshaped** (Jacob, 15:40–15:41: drag an item to move it,
handles to reshape; reshaping already worked for shapes but not notes, and moving not at all).
With *Select* chosen in the markup palette:

- Press on a markup and drag: it moves — boxes, clouds, lines, arrows, dimensions, areas,
  freehand ink, and notes. It stops at the edge of the sheet. A press that does not travel
  only selects; nothing is saved.
- Notes are now selectable like everything else: four corner handles resize the box, and a
  **double-click** changes the words (a single click used to; in Select it now picks the note
  up). A note that points at something keeps pointing at the same spot when it is moved or
  resized.
- Freehand ink still has no handles — it moves, it does not reshape.
- Someone else's markup can be selected but not moved or reshaped, as before.
- While a dimension or area is being dragged its figure stays where it was and jumps to the
  new place on release.

`checks/t_move.py`: each of box, ink, arrow and note dragged by a tenth of the sheet's width
and saved shifted by exactly that; a click saves nothing; a corner drag resizes the box and
the note; the note's pointer is kept; double-click opens the note's words.

Jacob, 15:42: **notes are sized by the sheet, not the screen.** A note's words were 13 px on
every screen, so on a phone, where the whole sheet is under 400 px wide, they were enormous
against the drawing. The words, their box's padding and least size, and the dimension figures
are now a fraction of the sheet's width (1.08% — what 13 px is on a 1200 px sheet), via
container units on the page. Measured: the same note's text takes 4.0–4.1% of the sheet's
height at 1440, 1920 and 402 px wide (it is 4 px tall on the phone at fit, and is read by
zooming in). A browser without container units keeps 13 px. iOS's own text enlargement is
switched off for the layer; **not seen on the iPhone**.

Jacob, 15:43: **the sheet went blank under the pointer while placing an observation.** The
layer that takes the tap is a button the size of the sheet, and every button's hover colour
is opaque (`button:hover` outranks the layer's own faint tint), so hovering painted the sheet
over. It now keeps its tint at rest, hovered and pressed — read back from the browser in all
three states — and a tap still places the pin and opens the form.

---

# Checkpoint — 2026-11-19, 15:36 CST

**Anyone on the project may remove a markup, after a warning** (Jacob, 15:34: "allow anyone to
delete things, but only after there's a warning that it was created by someone else").

- **Migration `0040_markup_authors.sql` applied**, on that instruction: the delete rule on
  `sheet_markups` is now project membership (`member_drop`), replacing `author_drop`; a
  markup arriving with no author is given the sender's. No existing rows changed. (The
  narrower version written at 15:28 — authorless only — was never applied and is replaced by
  this.) The two authorless markups on G001 can now be removed from the app.
- In the viewer, Delete or the eraser on a markup someone else drew raises a bar: "Someone
  else drew this. Remove it for everyone?" — *Remove* / *Leave it*. Removed, it says so and
  offers Undo. One's own marks, and marks with no author recorded, go as before, without the
  question. The bar says "someone else", not who: the app has their id, not their name.
- `checks/t_theirs.py`: warning shown and nothing sent; *Leave it* keeps it; *Remove* sends
  the delete; own mark removed with no warning.
- "Things" was taken as markups on sheets — the only place the database held deletion to its
  author. Pad sketches, notebook pages and observations had no such rule and have no warning.

Jacob, 15:37: **Mark up in the phone's ⋯ menu is centred** (it was laid out as a flex box by
the "shown only when narrow" rule, so its words sat at the left; measured, every button's
label is now on its button's centre). **Add link is gone** from the menu on phone and desk.
The code that draws and follows links is left in place: sheet numbers on a drawing still link
by themselves. There were no hand-drawn links in the database, so nothing is stranded.

Jacob, 15:38: **the viewer's ⋯ menu closes when anything else is touched** — the drawing, the
rest of the bar. Its own buttons and the ⋯ button behave as before.

---

# Checkpoint — 2026-11-19, 15:28 CST

**A markup deleted on the web was still on the phone — and the phone was right** (Jacob,
15:25). In the database the two ink markups on G001 (Code info / life safety plan), drawn at
15:07, are still there, and both have **no author** (`created_by` null). The removal rule is
"only the person who drew it" (`author_drop`: `created_by = auth.uid()`), and null is nobody,
so the server removed nothing and reported no error. The web app had already taken them off
its own screen; the phone, reading the server, showed them. Not a syncing delay.

- Why no author: `saveMarkup` asked the server who was signed in (`auth.getUser()`) and filed
  nobody when that came back empty. Why it came back empty on his desktop is **not known**.
  The author now comes from the session the device holds (`whoAmI` in `supabase.ts`), for
  markups, observations and sheet links. Checked with the sign-in service blocked: the markup
  is sent with its author.
- A removal the server does not carry out is now noticed: the outbox asks for the removed row
  back, and if nothing was removed and the markup is still there, the viewer puts it back and
  says it could not be removed for everyone.
- **Not applied — migration `0040_markup_authors.sql`**: lets any project member remove a
  markup that has no author, and gives new markups the sender as author by default. The tool
  that applies migrations refused it in this session. **Until it is applied the two markups
  on G001 cannot be removed from the app by anyone.**

**Re-read: the window no longer asks which sheets** (Jacob, 15:26, confirming). The tick
boxes are gone. Every selected sheet that something was read from is changed; the window is
for choosing, making, renaming or re-drawing the template, and for correcting a value before
it goes in. A sheet whose title block read as another sheet's number is still changed, and is
counted in a line by the button. Sheets with nothing read are left as they are.

---

# Checkpoint — 2026-11-19, 15:22 CST

**Re-read: making a template** (Jacob, 15:19: "still isn't allowing me to apply / create a new
sheet template"). **Not reproduced as a hard failure.** Driven end to end for the first time,
on a sheet made with a real title block (`checks/t_template.py`, `checks/tb.pdf`): open the
re-read, *New template from these sheets…*, drag boxes round number, title and date, name it,
save, and the selected sheets are read again with it — that worked. Two things found on the
way that could each look like "it won't let me", both changed:

- *New template…* was greyed out until **every** selected sheet had been fetched and read, one
  after another. With a long selection that is a long wait with nothing to say why. It is now
  ready as soon as one sheet is open, and sheets still arriving are read with whatever
  template has been chosen or made in the meantime.
- In the template editor "Fit" was the sheet's width, so the bottom of the sheet — where the
  sheet number is — was below the edge of the pane and had to be scrolled to. The number box
  is required before *Save template* is enabled. Fit is now the whole sheet.

Which of these, if either, was what he hit is not known.

Jacob, 15:22: the re-read is working now. **Renaming a template from the re-read dialog**
(his next ask): with a template chosen in *Read with*, *Rename* turns its name into a box
(Enter saves, Escape cancels) and *Change its boxes…* opens the same editor on that template.
The table of read values stays as it is while renaming. `t_template.py` renames the template
it has just made and checks the server, the list and the rows. *Change its boxes…* was
compiled, not driven.

Jacob, 15:23, two more on the same screen:
- **Select a whole discipline.** While selecting, a discipline's heading selects every sheet
  under it (again to let them go); with Ctrl held it works outside selecting mode too.
  `t_shift.py`.
- **"I don't think I need an in between window that required me to reselect the sheets."**
  Read as: the re-read table arrived with most rows unticked, so the sheets had to be chosen a
  second time. Rows are now ticked whenever anything was read from the sheet, whether or not it
  differs from the record. Still left unticked: a sheet whose title block read as a different
  sheet's number (the wrong box or the wrong sheet), and the line by the button now says how
  many and why. The table itself is kept — it is where the template is chosen and where what
  was read can be seen before it replaces anything. **If he meant the table should go
  altogether, this is not that.**

---

# Checkpoint — 2026-11-19, 15:19 CST

Four things from Jacob while testing on the phone (15:12–15:18).

- **A border on the left and bottom of a sheet when panning.** The viewer kept clear of the
  camera cut-out and the home bar by padding the whole screen, so the drawing stopped short of
  those edges and bare background showed. The drawing area now runs to every edge; only the
  toolbar and the sheet list keep inside the safe area. **Not seen here**: the test browser
  has no cut-out, so its insets are zero — this is from reading the stylesheet, checked only
  to the extent that the drawing area reaches the right and bottom edges and nothing else
  moved.
- **The page behind an open sheet can no longer scroll or be pinch-zoomed** (`html`/`body`
  `overflow: hidden` while the viewer is up; a pinch anywhere outside the drawing is stopped).
  Done in answer to "I can see the drawings browser at the bottom of the page and it messes up
  the panning and zooming". Which thing he saw is not known — it may instead have been the
  sheet list that runs along the bottom on a near-square screen (620–1099 px wide, 700+ tall),
  which is unchanged.
- **Asked for, then withdrawn; built and set aside, not shipped:** hiding the sheet list
  entirely when a phone is upright, opening it from the sheet's title, and the left-hand list
  on small phones held sideways. Jacob: "never mind — I like how it's working now". The work
  is in no commit. He also said going between sheets "seems inconsistent"; what is
  inconsistent has not been pinned down.
- **Markups deleted on one device stayed on another** (Jacob: deleted on the desktop, still on
  the phone). A sheet that is open listens for changes live, but the listener for deletions
  was filtered by sheet, and Supabase's Realtime documentation says delete events can only be
  filtered when the table's replica identity is full — a delete carries the row's id and
  nothing to match a filter with. `sheet_markups` and `pad_marks` are both at the default, so
  **deletions were never delivered**; additions and edits were. The delete listeners are now
  unfiltered (`watchSheet`, `watchPad`) and remove by id. Also: an open sheet re-reads its
  markups when the app comes back to the front or finds signal, since a phone in a pocket is
  not listening. Not tried between two real devices. A sheet that is not open is read fresh
  each time it is opened.
- **Shift-click selected one sheet, not the run** (re-read selection on Drawings). The last
  sheet clicked was read inside a state updater that runs after it had been overwritten with
  the new one. `checks/t_shift.py`: Ctrl-click 1st then Shift-click 5th → 5 selected; in
  re-read mode click 2nd, Shift-click 6th → 5; Shift-click back to the 1st → 6. The earlier
  check clicked rows one at a time and never held Shift.

---

# Checkpoint — 2026-11-19, 15:11 CST

**The sheet-turning buttons no longer move** (Jacob, 15:09: on the desktop the buttons for
changing pages shift when a page has versions; confusing). In the sheet viewer ‹ › sat among
the tools on the right, and the revision stepper (⟨ label ⟩ current) appears beside them only
on sheets with more than one revision, so they slid sideways from one sheet to the next. They
are now at the left edge of the bar, before the sheet number, where nothing beside them comes
and goes (`.sv-step` in `SheetViewer.tsx`). The zoom button keeps one width whatever the
percentage. The project manual's preview had the same fault from its "Page N of M" group; its
‹ › are at the left too, with a fixed-width label. Phones are unchanged (there the buttons are
under ⋯). `checks/t_steady.py`: at 1440 and 1000 px, the buttons are at the same x on a sheet
with a revision stepper and on one without. The manual preview was compiled, not driven.

---

# Checkpoint — 2026-11-19, 14:57 CST

**Downloading a real project to a device failed, and had since field mode was built.** Jacob,
14:55, testing: "Failed to store record in an IDBObjectStore: Evaluating the object store's key
path did not yield a value." The words on each sheet (`sheet_text`) have no `id` column on the
server — they are keyed by `revision_id` — and the device's store is keyed by `id`, so the
write was refused and the download stopped before the project was noted as held. Every check
passed because no fixture had any sheet text. Fixed in `rows()` (`download.ts`): the
revision's id stands in, and the search-index column is no longer brought down.
`checks/t_hold.py` now carries sheet text; it fails on the build before the fix and passes
after. This is the likely cause of "the take to the field button isn't working very well"
earlier today — inferred, not confirmed. Checked against the live schema for the other tables
the device stores: all have `id`.

**Projects page**: the description and the colour key are under the list (Jacob, 14:55: the
top as clean as possible).

---

# Checkpoint — 2026-11-19, 14:49 CST

**A project on a phone keeps itself current, says when it is not, and can be removed** (Jacob,
14:45: someone may have downloaded weeks ago and go to a site meeting with an old version;
updating must be automatic; a download must be removable; hatched if downloaded but not
connected and updated).

- `src/lib/offline/keepCurrent.ts`, started from `main.tsx`. Whenever CAzen is open with
  signal — 2.5 s after it starts, when the browser reports it is back online, when the app is
  brought to the front, and every 15 minutes — each project held on the device is checked
  against the server (`behind`). If any current sheet is missing, or the last full pull was
  over 6 hours ago, the same routine as a download runs (new sheets fetched, superseded ones
  dropped for a "current sheets" copy, rows and notebooks pulled again). Otherwise the copy is
  only stamped as checked. Not asked about again within 10 minutes.
- It does not run when: signed out; anything written on the device for that project is still
  unsent (the pull would replace those rows on screen — the queue is pushed first); or the
  server answers with no sheets for a project the device holds sheets of (read as a lapsed
  permission or bad connection, not as a job whose drawings were deleted).
- **It cannot run while the app is closed.** A web app is given no way to. What it does instead
  is say so:
- **Hatched now also means "not matched to the office in the last 24 hours"** (`STALE`, one
  constant). The row reads "On this device · not updated since 3 weeks ago". Solid means
  matched within the day and nothing waiting to send. The 24 hours is my choice; Jacob gave no
  figure.
- `Held.checked` records when a copy was last matched. Copies made before today have none and
  go by their download time.
- **Holding a project that is already on the device** opens a sheet: when it was last matched,
  *Update it now*, *Download every revision* (if only current sheets are held), *Remove from
  this device*. Removing clears its drawings and rows; changes not yet sent, unsent photographs
  and notebook pages stay. The panel that used to open under the row on a phone is gone (it is
  still under Edit on a desk).

`checks/t_keep.py`, phone size: download → solid "up to date"; copy aged three weeks, a new
sheet and a new revision issued, app reopened with no signal → hatched "not updated since 3
weeks ago"; signal back, nothing pressed → both new files fetched, the superseded one dropped,
solid; hold → the three choices; remove → no files, sheets or held note left. `t_hold` and
`t_offline_notes` still pass. Not tried on the iPhone.

---

# Checkpoint — 2026-11-19, 14:39 CST

**Notebooks work with no signal** (Jacob: "I need all field notes, meeting notes, etc to be
saved locally until I am back on the internet to be uploaded… anything I am doing with the
notebooks functionality"). Commit `a0755a9`.

- What is kept on the device now, in four new IndexedDB stores (`visits`, `pads`, `padMarks`,
  `people`; database version 3): notebook pages, sketch pads, every mark on them, and the
  project's people. They are kept whether or not the project was "taken to the field", and
  giving the drawings back does not remove them.
- Reads (`src/lib/offline/mirror.ts`, `localFirst`): from the server when it answers, from the
  device when it doesn't (no signal, or no reply within 6 s when a copy is in hand). A row
  changed here and not yet sent is always taken from the device, so a refresh cannot undo it.
- Writes: `saveVisit`, `setVisit`, `removeVisit`, `newPad`, `setPad`, `removePad`, `addMark`,
  `setMark*`, `removeMarks`, `addPerson`, `removePerson` all write to the device and queue one
  of three new outbox jobs (`row.put`, `row.patch`, `row.remove`). Consecutive changes to the
  same row are folded into one job while it is the newest thing waiting, so typing for an hour
  does not queue a change a second.
- Photographs: `keepPhoto` keeps the shrunk JPEG on the device under the path it will have,
  queues a `file.put`, and returns at once. The upload asks storage whether the file is already
  there before sending, so a retry after a dropped reply does not make a second copy. File
  names gained three random characters (`Site visit 20261119-143840 t4a.jpg`) because the name
  is now settled on the phone. A file storage refuses (full, too large) holds up only itself
  and is retried with a growing wait; everything else still stops at the first network failure
  and keeps its order.
- Project list: a project with anything waiting is hatched and says how many changes, whether
  or not its drawings are on the device.
- Taking a project to the field now also brings its notebook pages, pads, marks and people.
  Re-downloading no longer clears photographs from the device (it only prunes PDFs) — before
  this, a refresh of the drawings would have dropped photos cached on site.
- `newPad` and `addMark` no longer ask the server who is signed in (that needed signal); they
  read the session the device holds.

Checked in the test browser, phone size, network cut (`checks/t_offline_notes.py`): new page,
two typed notes, a photo, a two-stroke sketch → all on the device, nothing sent, project row
hatched "8 changes still to send"; left the notebook and came back with no signal → page,
notes, photo and sketch all there; network back → page, notes, upload, pad, marks sent in the
order made, photo path on the page equals the uploaded key, row clears. `t_hold`, `t_select`,
`t_text`, `t_photos` and the node tests still pass.

Not covered, said plainly:
- Not tried on the iPhone. iOS Safari can evict IndexedDB for a site unused for a while unless
  it is on the home screen; no primary source was looked up for the current rule.
- Making the report PDF from a page and issuing it still need signal (numbering and the issued
  register are the server's). The page it is made from does not.
- Weather and place look-ups need signal and are skipped without it.
- "People on other projects" suggestions need signal; this project's people do not.
- Photos already on older pages are not brought down by "take to the field"; a photo is on the
  device if it was taken on it or has been looked at on it.
- A queued change the server rejects on its own terms (a row that no longer exists, a
  permission) is still dropped, as before.

**Holding a project asks before downloading** (Jacob: "I would rather the long hold on the
project prompt you to download"). Commit `e5310cc`. The hold opens a small sheet — "Download
the current sheets", "Download every revision", "Not now" — instead of starting at once; the
lifting finger cannot dismiss it (backdrop taps ignored for 0.8 s). `checks/t_hold.py` updated.

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
