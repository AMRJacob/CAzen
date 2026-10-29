# CAzen

One place for architect-side construction administration: the current drawings and project manual with full revision history, the contract documents, CA logs (RFIs, ASIs, PRs, CCDs, field reports) and submittals — all output on AMR letterhead.

Full scope: [docs/EXECUTIVE_SUMMARY.md](docs/EXECUTIVE_SUMMARY.md) · First-time setup: [docs/SETUP.md](docs/SETUP.md)

## Stack

| Layer | Choice |
| --- | --- |
| Web app | React + TypeScript (Vite) |
| Hosting | GitHub Pages, Vercel or Netlify (static) |
| Database, file storage, sign-in | Supabase (Postgres + Storage + Auth) |
| PDF reading / splitting / stamping | pdf.js + pdf-lib, in the browser |
| CI | GitHub Actions (build check on every push) |

## Repository layout

```
src/
  lib/supabase.ts          Supabase client (reads .env)
  lib/pdf/splitSet.ts      Split a drawing set into sheets, detect sheet numbers
  lib/pdf/coverSheet.ts    Submittal cover sheet + returned package
  pages/                   Projects, Documents, Submittals, CA Logs, Contracts
supabase/migrations/       Database schema (run once in Supabase SQL Editor)
templates/                 AMR letterhead and titleblock source PDFs
docs/                      Executive summary and setup guide
.github/workflows/         CI build + GitHub Pages deploy
```

## Revision rule

Files are never replaced or deleted. A sheet (A-201) or spec section (08 71 00) is a slot holding an ordered list of revisions, each tied to the issuance that created it (bid set, addendum, ASI, bulletin, CCD). The current set is the latest revision of each slot; `sheets_as_of(project, date)` rebuilds the set as it stood on any date.

## Working today (no backend needed)

- **Documents**: upload a drawing set PDF → split into sheets with detected sheet numbers.
- **Submittals**: fill in the review → download the contractor's package with the AMR cover sheet on top.

## Roadmap

1. Phase 0 — Setup (this scaffold)
2. Phase 1 — Document control MVP: projects, upload, split, replace, revision history
3. Phase 2 — Submittals: register, review workflow, cover sheet, resubmittal chain
4. Phase 3 — CA logs: RFI, ASI, PR, CCD, field reports
5. Phase 4 — Contract library, contractor/consultant logins, notifications, overlay compare

## Commands

```bash
npm install     # once
npm run dev     # local dev server
npm run build   # production build to dist/
```
