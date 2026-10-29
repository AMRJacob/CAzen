# CAzen — Executive Summary

The living version of this summary is the Claude doc "AMR CA Platform — Executive Summary". This copy is kept in the repo for reference (last updated 2026-10-29).

## Purpose

One place for every architect-side construction administration task on a project: current documents, their full revision history, the contract, and every piece of CA paperwork the architect issues or reviews.

The test for every feature is time saved: after a one-time setup, nothing should be typed twice. Forms fill themselves in from the firm, the project and the last form issued, and the user can override any value.

## Core capabilities

1. **Drawings and project manual** — upload the drawing set and project manual (PDF); split into sheets and spec sections; replace any sheet or section over time; every replacement is a new revision tied to its source (addendum, ASI, bulletin, CCD); view any prior revision; rebuild the set as of any date. The project manual sits under Drawings and is easy to reference.
2. **Contract library** — owner-contractor agreement, general and supplementary conditions, owner-architect agreement and other governing documents; read-only once executed.
3. **Document creation** — field reports, ASIs, PRs, RFI responses and CCDs; auto-numbered, autofilled with override, CSI suggestions while typing. Field reports have separate Observations and Notes boxes, plus photo pages in a uniform labelled grid.
4. **Submittals** — auto-generated cover sheet with the firm's action stamp; spec section and division suggested; resubmittal chain and consultant routing.
5. **Firm branding and form templates** — one firm per deployment, editable in Settings; logo, letterhead and accent colour (suggested from the logo); template editor per form type; templates can be started from a firm's existing PDF forms.
6. **AI access** — project text stored so an AI assistant can help review submittals, check standards and search in the field.

## Where it stands

| Feature | Status |
| --- | --- |
| Sign-in, invites, create password | Live |
| Projects and sidebar project switcher | Live |
| Drawings: upload, split, revision history, set as of date | Live |
| Submittal cover sheet | Live |
| Document creation (field reports, ASIs, RFI responses, PRs, CCDs) | Live |
| Form template editor | Live |
| Firm branding in Settings | Live |
| Start a template from a firm PDF | In progress (engine done; editor button next) |
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

## Open items

- Firm sign-off on storing project documents in Supabase.
- AMR letterhead PDF (if a background letterhead is wanted).
- Pilot project.
- Relationship to ACC/BIM360: standalone, or eventually pull sheets from ACC?
