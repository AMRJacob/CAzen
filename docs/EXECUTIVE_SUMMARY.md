# CAzen — Executive Summary

The living version of this summary is the Claude doc "CAzen — Executive Summary". This copy is kept in the repo for reference.

## Purpose

One place for every architect-side construction administration task on a project: current documents, their full revision history, the contract, and every piece of CA paperwork AMR issues or reviews.

## Core capabilities

1. **Document control** — upload the drawing set and project manual (PDF); split into sheets and spec sections; replace any sheet or section over time; every replacement is a new revision tied to its source (addendum, ASI, bulletin, CCD); view any prior revision; rebuild the set as of any date.
2. **Contract library** — owner-contractor agreement, general and supplementary conditions, owner-architect agreement, bonds, insurance; read-only once executed.
3. **CA document logs** — RFI responses, ASIs, PRs, CCDs, change orders, field reports, punch lists; auto-numbered, status-tracked, linked to the sheets they affect; an ASI can push revised sheets into document control.
4. **Submittals** — register built from spec sections; review with action stamp; auto-generated AMR cover sheet; resubmittal chain; consultant routing.
5. **AMR branding** — all generated paperwork uses AMR letterhead or titleblock from one set of templates.

## Decisions made (2026-10-29)

- Repository on Jacob's personal GitHub account (transferable to an AMR org later).
- Backend: Supabase.
- MVP is AMR-only; AMR uploads contractor submittals and RFIs. Contractor logins come in Phase 4.

## Open items

- AMR letterhead and titleblock source files.
- AMR's standard submittal stamp wording.
- Pilot project for Phase 1.
- Firm sign-off on storing project documents in Supabase.
