# AMR branding templates

Put the firm's source files here so every generated PDF uses them.

| File | What it is | Used by |
| --- | --- | --- |
| `letterhead.pdf` | AMR letterhead, 8.5x11, vector PDF exported from InDesign/Illustrator | Submittal cover sheets, ASIs, PRs, RFI responses, field reports |
| `titleblock-11x17.pdf` | AMR titleblock with an empty drawing area | ASI sketches (SKs), revised details |
| `titleblock-24x36.pdf` | Full-size titleblock (export from the Revit titleblock family) | Reissued sheets |
| `stamp-wording.md` | Exact submittal action wording and review disclaimer AMR uses | Cover sheet text |

Once the backend is live these files are uploaded to the private `templates` storage bucket and
listed in the `templates` table; field positions live in `templates.field_map`.

Until then, the Submittals page lets you pick the letterhead PDF each time.
