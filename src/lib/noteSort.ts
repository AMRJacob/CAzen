
/**
 * Putting a note where it belongs.
 *
 * Notes on site are said in the order things are walked past, not in the order a report lists
 * them. So a note is typed as it comes and filed under one of the page's categories — the one
 * its words point at, unless a different one is chosen. The guess is only ever a starting
 * point: it is shown before the note is kept, and the note can be moved after.
 */

const WORDS: [RegExp, RegExp][] = [
  // [what the category is called, what a note about it tends to say]
  [/site|parking|civil|landscap|exterior work/i, /\b(site|parking|paving|pavement|asphalt|grading|curbs?|sidewalks?|landscap\w*|irrigation|storm|drain\w*|utilit\w*|fenc\w*|erosion|silt|striping|bollards?|dumpster|laydown|retaining|detention|sod|trees?)\b/i],
  [/structur|foundation|framing|concrete|steel/i, /\b(steel|concrete|slabs?|footings?|foundations?|fram\w*|beams?|columns?|joists?|trusses|truss|rebar|cmu|masonry|deck(ing)?|welds?|anchor bolts?|piers?|grade beams?|shear|embeds?|grout|formwork|pour(ed|ing)?)\b/i],
  [/envelope|exterior|roof|skin|enclosure/i, /\b(roof\w*|windows?|storefront|glaz\w*|curtain ?wall|sheathing|air barrier|vapor|flashing|brick|veneer|siding|metal panels?|sealant|caulk\w*|waterproof\w*|membrane|parapet|coping|gutters?|downspouts?|soffit|eifs|stucco|insulation|weather barrier)\b/i],
  [/interior|finish/i, /\b(drywall|gyp\w*|sheetrock|paint\w*|ceilings?|acoustic\w*|floor\w*|tile|carpet|lvt|casework|millwork|cabinets?|counter\w*|doors?|hardware|toilet|restroom|partitions?|trim|base|blocking|studs?|rooms?|corridor|lobby|duct\w*|plumbing|electrical|conduit|rough-?in|sprinklers?|fixtures?|mechanical|hvac|diffusers?|lights?|lighting)\b/i],
  [/progress|schedule/i, /\b(schedule\w*|progress|behind|ahead|delay\w*|on track|weeks?|days?|milestones?|completion|substantial|sequence|crew|manpower|look-?ahead|critical path|weather days?)\b/i],
  [/submittal/i, /\b(submittals?|shop drawings?|samples?|product data|rfis?|resubmit\w*|review(ed)?|approved as noted|mock-?ups?|o&m|closeout)\b/i],
  [/payment|pay app|cost|change/i, /\b(pay(ment)? ?app\w*|payments?|invoice\w*|retainage|change orders?|pricing|proposal requests?|prs?|cos?|allowance|contingency|stored materials?|billing|sov)\b/i],
]

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)

/** The category a note most plainly belongs under, or -1 when its words point nowhere. */
export function guessCategory(text: string, headings: string[]): number {
  const said = tokens(text)
  if (!said.length) return -1
  let best = -1, bestScore = 0
  headings.forEach((h, i) => {
    let score = 0
    // The category's own name said out loud counts most.
    const own = new Set(tokens(h))
    for (const w of said) if (own.has(w)) score += 3
    for (const [called, about] of WORDS) {
      if (!called.test(h)) continue
      const hits = text.match(new RegExp(about.source, 'gi'))
      if (hits) score += hits.length
    }
    if (score > bestScore) { best = i; bestScore = score }
  })
  return best
}

export const GENERAL = 'General'
const CATCH_ALL = /^(general|additional|other|misc|notes)\b/i

/**
 * The categories to choose from. If the page has none that takes anything ("Additional Notes",
 * "General"), one is offered at the end; it only becomes part of the page when something is
 * filed under it.
 */
export function headingsOf(notes: string | null): string[] {
  const own = parseSections(notes).map((s) => s.heading)
  return own.some((h) => CATCH_ALL.test(h)) ? own : [...own, GENERAL]
}

/** Where a note goes when its words point at nothing in particular. */
export const catchAll = (headings: string[]) => Math.max(0, headings.findIndex((h) => CATCH_ALL.test(h)))

/** Put a note under a category, at the end of what is already there. */
export function fileNote(notes: string | null, heading: number, text: string): string {
  const sections: Section[] = parseSections(notes)
  // One past the last category is "none of these": it gets a category of its own, made the
  // first time it is needed, so a note that fits nowhere is never filed somewhere wrong.
  if (heading >= sections.length || !sections.length) sections.push({ heading: GENERAL, body: '' })
  const s = sections[Math.max(0, Math.min(heading, sections.length - 1))]
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  s.body = [s.body, ...lines].filter((l) => l.trim()).join('\n')
  return writeSections(sections)
}

/** Take a note back out — the last line under a category that says exactly this. */
export function unfileNote(notes: string | null, heading: number, text: string): string {
  const sections = parseSections(notes)
  const s = sections[heading]
  if (!s) return notes ?? ''
  const lines = s.body.split('\n')
  const want = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const w of want.reverse()) {
    const at = lines.map((l) => l.trim()).lastIndexOf(w)
    if (at >= 0) lines.splice(at, 1)
  }
  s.body = lines.join('\n')
  // The catch-all exists only while it holds something: emptied, it leaves the page again.
  if (!s.body.trim() && s.heading === GENERAL) sections.splice(heading, 1)
  return writeSections(sections)
}

// ---------- The outline a page's notes are kept as ----------

export interface Section { heading: string; body: string }

export function parseSections(text: string | null): Section[] {
  const out: Section[] = []
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const head = raw.match(/^(?:\d+|[IVX]+)[.)]\s+(.*)$/)
    if (head) { out.push({ heading: head[1].trim(), body: '' }); continue }
    const line = raw.replace(/^\s+/, '').replace(/^(?:[a-z]{1,2}|\d+|[ivx]+)[.)]\s?/, '')
    if (!out.length) { if (!line.trim()) continue; out.push({ heading: 'Notes', body: '' }) }
    const last = out[out.length - 1]
    last.body = last.body ? `${last.body}\n${line}` : line
  }
  return out.map((s) => ({ ...s, body: s.body.replace(/\n+$/, '') }))
}

const letter = (i: number) => (i < 26 ? String.fromCharCode(97 + i) : `${String.fromCharCode(97 + Math.floor(i / 26) - 1)}${String.fromCharCode(97 + (i % 26))}`)

export function writeSections(sections: Section[]): string {
  return sections.map((s, i) => {
    const lines = s.body.split('\n').map((l) => l.trim()).filter(Boolean)
    return `${i + 1}. ${s.heading.trim() || 'Notes'}\n` + (lines.length ? lines : ['']).map((l, j) => `  ${letter(j)}. ${l}`).join('\n')
  }).join('\n')
}
