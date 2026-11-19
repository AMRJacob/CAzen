# CAzen — Executive Summary

This file in the repository is the source; the project-knowledge copy "CAzen Executive Summary" is written from it (last updated 2026-11-19).

## Purpose

One place for every architect-side construction administration task on a project: current documents, their full revision history, the contract, and every piece of CA paperwork the architect issues or reviews.

The test for every feature is time saved: after a one-time setup, nothing should be typed twice. Forms fill themselves in from the firm, the project and the last form issued, and the user can override any value.

Part of it covers ground BIM360/ACC already covers for CA (sheets, revisions, links, search, punch lists), but it is built to be cleaner and quicker to use.

## Core capabilities

1. **Drawings and project manual** — upload sets in rounds (each with a name, date and revision mark); sheets replace the current ones and every earlier revision stays viewable, with the set as of any date. Title block templates read each sheet's number, title and revision mark (one per layout, e.g. each consultant). Sheets sort by discipline order (firm default, per-project override). The words on every sheet are searchable, sheet numbers on a drawing link to that sheet, links can be drawn by hand, and unusually large PDFs get a warning. The project manual sits under Drawings, split by section number.
2. **Contract library** — owner-contractor agreement, general and supplementary conditions, owner-architect agreement and other governing documents; read-only once executed.
3. **Document creation** — field reports, ASIs, PRs, RFI responses and CCDs; auto-numbered, autofilled with override, CSI suggestions while typing. An ASI or PR prompts for its cover sheet and joins cover and attachments into one PDF to email. Field reports have separate Observations and Notes boxes, plus photo pages.
4. **Submittals** — auto-generated cover sheet with the firm's action stamp; spec section and division suggested; resubmittal chain and consultant routing.
5. **Pay applications** — new pay app with a date and editable auto number; carries forward the schedule of values; enter this period; checks the math; per-project line items and retainage rules; laid out like the AIA form for the contract type.
6. **Markups** — one tool for everything drawn on a sheet: freehand, arrows, boxes, revision clouds, notes and dimensions, in five colours. Markups belong to the sheet rather than to the revision they were drawn on, so they survive a reissue; the revision is recorded as provenance, the viewer says when a markup predates what is on screen, and they can be brought forward once checked. Scale is set per sheet by drawing a line along something of known length, and every dimension reads from it. Anyone on the project may draw and may retype a note; only the author may remove a markup.
7. **Punch list** — a document of its own, under its own menu item, not a kind of markup. Items are numbered, carry a status and a trade, and reference a sheet and the rectangle of it they are about, so the document shows a clip of the drawing beside each item. On a sheet they appear as a layer that can be turned on and off, and they are added by their own method rather than through the markup tools.
8. **Firm branding and form templates** — one firm per deployment, editable in Settings; logo, letterhead and accent colour; template editor per form type; templates can be started from a firm's existing PDF forms.
9. **AI access** — project text stored so an AI assistant can help review submittals, check standards and search in the field.

## Where it stands

As of 2026-11-19. The running record of how each piece was built is `docs/BUILD_LOG.md`.

| Feature | Status |
| --- | --- |
| Sign-in, invites, create password | Live |
| Projects and project switcher; project location (address search, map pin, Open in Maps) | Live |
| Drawings: upload rounds, split, revision history, set as of date, title block templates, discipline order, search, links between sheets | Live |
| Markups, dimensions and scale on sheets; markups carried across revisions | Live |
| Project manual: split by section, revisioned, searchable | Live |
| Document creation (field reports, meeting notes, ASIs, RFI responses, PRs, CCDs), form template editor, templates started from a firm PDF | Live |
| Change documents register | Live |
| Observations with photographs and pins on the sheet; punch list; field report written from a visit's observations | Live |
| Note pads (handwritten, live across devices) | Live |
| Pay applications (G702/G703 layout, retainage steps, stored material) | Live |
| Setting a contract up in the app, with a pasted schedule of values | Live (2026-11-19) |
| Construction schedule against pay applications | Live |
| Contract library | Live |
| Submittal cover sheet | Live |
| Firm branding in Settings; Requests & issues list | Live |
| File storage on Cloudflare R2, with copies to the project's CA folder | Live, prototype (needs the Cloudflare setup in docs/SETUP.md) |
| Field mode: take a project to the field, work with no signal, changes sent on return | Live; the app itself now opens with no signal (2026-11-19). Awaiting a check on the iPhone |
| Offline search across sheets | Planned |
| Submittal register, resubmittals, consultant routing | Planned |
| AI access to project content | Planned |

## Decisions made

- Repository on Jacob's personal GitHub account; app on GitHub Pages; backend on Supabase.
- One firm per deployment, branding editable in Settings.
- The architect uploads contractor submittals and RFIs for now; outside logins come later.
- Default templates follow AMR's existing forms; each firm can edit its own.
- Wishlist and bug reports live in the app (Settings → Requests & issues). Anyone in the firm can add; admins set status (under review, planned, in progress, complete, infeasible, duplicate, won't do) and reply. Claude works the list through the database.
- Files (prototype): Cloudflare R2 free allowance (10 GB a month, no download fees) so files open on a phone, with copies written to each project's CA folder from office computers. A cap (9.5 GB total, 100 MB a file, editable by admins) keeps it inside the free allowance, and Settings shows usage per project. Move to R2 paid storage ($0.015 per GB-month) if adopted; Google Drive via a firm-approved CAzen account stays an option.

- Markups are associated with the sheet, not the revision, and can be brought forward to the current revision deliberately. Punch items are a separate record type with their own menu item and their own way of being placed, shown over sheets as a layer.
- Sheets are reduced only when asked, never automatically, and resolution is worked out per image from how large it is drawn rather than from a dpi figure alone.

## Open items

- Firm sign-off on storing project documents in Supabase.
- AMR letterhead PDF (if a background letterhead is wanted).
- Pilot project.
- Relationship to ACC/BIM360: standalone, or eventually pull sheets from ACC?
