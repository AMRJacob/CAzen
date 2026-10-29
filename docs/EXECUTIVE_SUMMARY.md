# CAzen — Executive Summary

The living version of this summary is the Claude doc "AMR CA Platform — Executive Summary". This copy is kept in the repo for reference (last updated 2026-10-29).

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
6. **Punch list** — tag items on the drawings with comments and photos; firm default tags for recurring comments; exported report.
7. **Firm branding and form templates** — one firm per deployment, editable in Settings; logo, letterhead and accent colour; template editor per form type; templates can be started from a firm's existing PDF forms.
8. **AI access** — project text stored so an AI assistant can help review submittals, check standards and search in the field.

## Where it stands

| Feature | Status |
| --- | --- |
| Sign-in, invites, create password | Live |
| Projects and sidebar project switcher | Live |
| Drawings: upload rounds, split, revision history, set as of date | Live |
| Title block templates | Live |
| Sheet order by discipline | Live |
| Sheet search and links between sheets | Live |
| Project folders (files saved to the mapped CA folder) | Live, proof of concept |
| Submittal cover sheet | Live |
| Document creation (field reports, ASIs, RFI responses, PRs, CCDs) | Live |
| Form template editor | Live |
| Firm branding in Settings | Live |
| Start a template from a firm PDF | In progress (engine done; editor button next) |
| ASI and PR packages | Planned |
| Pay applications | Planned |
| Punch list | Planned |
| Field report photos | Planned |
| Project manual under Drawings | Planned |
| Contract library | Planned |
| Submittal register, resubmittals, consultant routing | Planned |
| AI access to project content | Planned |

## Decisions made

- Repository on Jacob's personal GitHub account; app on GitHub Pages; backend on Supabase.
- One firm per deployment, branding editable in Settings.
- The architect uploads contractor submittals and RFIs for now; outside logins come later.
- Default templates follow AMR's existing forms; each firm can edit its own.
- Proof of concept for files: each project can save to its CA folder on the mapped shared drive (Chrome or Edge on office computers); CAzen builds its own CAzen folder structure there.

## Open items

- Firm sign-off on storing project documents in Supabase.
- Storage plan: Supabase free plan holds 1 GB with a 50 MB per-file limit; Pro includes 100 GB with extra billed per GB. Move to Pro before uploading full project sets.
- AMR letterhead PDF (if a background letterhead is wanted).
- Field access on iPhone: project-folder files can't be opened from a phone. Options: Google Drive via a CAzen account approved by the firm's Google admin (one shared drive only), or Cloudflare R2 with a copy written to the project folder.
- Pilot project.
- Relationship to ACC/BIM360: standalone, or eventually pull sheets from ACC?
