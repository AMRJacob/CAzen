/**
 * A contractor's schedule, read off the page.
 *
 * Schedules arrive as a PDF out of Primavera or Project, or as a scan of one. Either way the
 * useful part is the table down the left: a name, a start and a finish. So the reading is by
 * line — a line with dates in it is an activity, the first two dates are when it starts and
 * ends, and the words before them are what it is called once the ID and the duration are taken
 * off. A line of words with no dates, sitting above activities, is a heading.
 *
 * Nothing read here is kept until somebody has looked at it: a scan is read by eye-of-machine,
 * and a 3 that was an 8 is a week on a schedule.
 */

export interface ReadActivity {
  /** The line number printed on the schedule, for finding the row on the sheet. Not kept. */
  no?: string | null
  name: string
  is_heading: boolean
  starts_on: string | null
  ends_on: string | null
  percent: number
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCMonth() !== m - 1) return null // the 31st of a thirty-day month
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

interface Found { at: number; end: number; day: string }

/** Every date on a line, in the order it appears. Month first for all-number dates. */
export function datesIn(line: string): Found[] {
  const out: Found[] = []
  const take = (re: RegExp, read: (m: RegExpExecArray) => string | null) => {
    for (let m = re.exec(line); m; m = re.exec(line)) {
      if (out.some((f) => m!.index < f.end && m!.index + m![0].length > f.at)) continue
      const day = read(m)
      if (day) out.push({ at: m.index, end: m.index + m[0].length, day })
    }
  }
  take(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (m) => iso(+m[1], +m[2], +m[3]))
  take(new RegExp(`\\b(\\d{1,2})[-\\s]?${MON}[-\\s,]*((?:20)?\\d{2})\\b`, 'gi'),
    (m) => iso(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]))
  take(new RegExp(`\\b${MON}\\s*(\\d{1,2}),?\\s+(20\\d{2}|'?\\d{2})\\b`, 'gi'),
    (m) => iso(+m[3].replace("'", ''), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]))
  take(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.]((?:20)?\d{2})\b/g, (m) => iso(+m[3], +m[1], +m[2]))
  return out.sort((a, b) => a.at - b.at)
}

/**
 * What a scan does to a date: O for 0, l and I for 1, S for 5, B for 8. Only tokens already
 * shaped like a date are touched, so no word of a name is ever "corrected".
 */
export function mendDates(line: string): string {
  return line.replace(/(?<![A-Za-z0-9])[\dOoIl|SsBZ]{1,2}[/\-][\dOoIl|SsBZ]{1,2}[/\-][\dOoIl|SsBZ]{2,4}(?![A-Za-z0-9])/g, (t) =>
    t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8').replace(/Z/g, '2'))
}

const JUNK = /^(activity|task)?\s*(id|name|description|#|no\.?)\b|^(start|finish|duration|orig(inal)?|rem(aining)?|early|late|total float|predecessors?|successors?|resource names?|% ?complete|page \d|data date|run date|print(ed)?|layout|filter|©|legend|remaining work|critical|milestone|summary)\b/i

function nameFrom(before: string, after: string): string {
  let s = before
    // weekday a scheduling program prints in front of a date
    .replace(/\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?\s*$/i, '')
    .replace(/[|[\]{}_=~]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
  // Trailing columns between the name and the first date: percent, durations, counts. A bare
  // number is a column only if the word before it isn't one that takes a number ("Level 2"),
  // and a scan's "l0" for "10" counts as a number.
  let bare = 0
  for (let i = 0; i < 5; i++) {
    const before = s
    s = s.replace(/\s+\d{1,3}(\.\d+)?\s?%$/, '')
      .replace(/\s+\d{1,4}(\.\d+)?\s?(d|days?|wks?|weeks?|w|mons?|hrs?|h|ed|edays?)\??$/i, '').trim()
    if (s === before && bare < 2) {
      const m = s.match(/^(.*?)(\S+)\s+([\dOolI|]{1,4}(?:\.\d+)?)$/)
      if (m && /\d/.test(m[3]) && !/^(level|lvl|phase|floor|flr|area|bldg|building|no\.?|#|unit|tier|zone|stage|pod|wing|grid|line|type|alt\.?|alternate|addendum|package|pkg)$/i.test(m[2])) {
        s = (m[1] + m[2]).trim(); bare++
      }
    }
    if (s === before) break
  }
  // leading columns: row number, activity ID, WBS code
  for (let i = 0; i < 3; i++) {
    s = s.replace(/^(\d{1,5}|[A-Z]{1,5}[-.]?\d{2,6}[A-Z]?|\d+(\.\d+){1,5}|[A-Z]\d{3,6})\s+(?=\S)/, '').trim()
  }
  s = s.replace(/^[^A-Za-z0-9(]+/, '').replace(/[^A-Za-z0-9).%"']+$/, '').trim()
  if (s.replace(/[^A-Za-z]/g, '').length >= 2) return s
  // Some layouts put the name to the right of the dates, beside the bar.
  const right = after.replace(/[|[\]{}_=~]+/g, ' ').replace(/\s+/g, ' ').trim()
  return right.replace(/[^A-Za-z]/g, '').length >= 3 ? right : ''
}

/** A line as text alone, or with the line number it was found by (`scheduleRows`). */
export type ScheduleLine = string | { no: string | null; text: string }

export function readSchedule(lines: ScheduleLine[], opts: { scanned?: boolean } = {}): ReadActivity[] {
  const out: ReadActivity[] = []
  let pendingHeading: string | null = null
  for (const given of lines) {
    const raw = typeof given === 'string' ? given : given.text
    const line = (opts.scanned ? mendDates(raw) : raw).replace(/\u00a0/g, ' ').trim()
    if (!line) continue
    // Found by its number, the number is known; read as a plain line, it is the line's first
    // token if that is a small whole number.
    const no = typeof given === 'string' ? (line.match(/^(\d{1,4})\s+\S/)?.[1] ?? null) : given.no
    const dates = datesIn(line)
    if (!dates.length) {
      const letters = line.replace(/[^A-Za-z]/g, '').length
      const clean = line.replace(/[|[\]{}_=~]+/g, ' ').replace(/\s+/g, ' ').trim()
      // A heading is mostly words. What a scan makes of a row of bars is mostly not.
      if (letters >= 4 && letters / line.replace(/\s/g, '').length >= 0.75 && clean.length <= 70 && !JUNK.test(clean)) pendingHeading = clean
      continue
    }
    const tail = dates.length > 1 ? dates[1].end : dates[0].end
    const name = nameFrom(line.slice(0, dates[0].at), line.slice(tail))
    if (!name || JUNK.test(name)) continue
    if (pendingHeading) {
      out.push({ name: pendingHeading, is_heading: true, starts_on: null, ends_on: null, percent: 0 })
      pendingHeading = null
    }
    let [a, b] = [dates[0].day, (dates[1] ?? dates[0]).day]
    if (b < a) [a, b] = [b, a]
    const pc = line.match(/(\d{1,3})(?:\.\d+)?\s?%/)
    out.push({
      no, name, is_heading: false, starts_on: a, ends_on: b,
      percent: pc ? Math.max(0, Math.min(100, Number(pc[1]))) : 0,
    })
  }
  return out
}

// ---------- Tying activities to the schedule of values ----------

const STOP = new Set(['and', 'the', 'of', 'for', 'at', 'in', 'to', 'install', 'installation', 'complete', 'work', 'new', 'level', 'area', 'phase', 'all', 'misc', 'general'])
const SAME: [RegExp, string][] = [
  [/\bgyp(sum)?\s*(board|bd)\b|\bsheet\s?rock\b|\bdrywall\b/g, 'drywall'],
  [/\bmech(anical)?\b|\bhvac\b/g, 'hvac'], [/\belec(trical)?\b/g, 'electrical'], [/\bplumb(ing)?\b/g, 'plumbing'],
  [/\bconc(rete)?\b/g, 'concrete'], [/\bpaint(ing|s)?\b/g, 'paint'], [/\broof(ing|s)?\b/g, 'roof'],
  [/\bfram(e|es|ing)\b/g, 'frame'], [/\bfloor(ing|s)?\b/g, 'floor'], [/\bdoors?\b/g, 'door'],
  [/\bwindows?\b/g, 'window'], [/\bceilings?\b|\bact\b/g, 'ceiling'], [/\bfound(ation)?s?\b|\bfootings?\b/g, 'foundation'],
  [/\bsite\s?work\b|\bearth\s?work\b|\bgrading\b/g, 'sitework'], [/\bmasonry\b|\bcmu\b|\bbrick\b/g, 'masonry'],
  [/\bsteel\b|\bstructural\b/g, 'steel'], [/\bfire\s?(sprinklers?|protection|suppression)\b|\bsprinklers?\b/g, 'sprinkler'],
  [/\bmillwork\b|\bcasework\b|\bcabinet(s|ry)?\b/g, 'casework'], [/\bglaz(ing)?\b|\bstorefronts?\b|\bcurtain\s?wall\b/g, 'glazing'],
]

function words(text: string): Set<string> {
  let t = text.toLowerCase()
  for (const [re, to] of SAME) t = t.replace(re, to)
  return new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)))
}

/**
 * The lines of the schedule of values an activity most plainly belongs to — by the words they
 * share, with the trades' usual other names counted as the same word. A suggestion and no more:
 * contractors don't schedule by their own pay lines, so most activities match one line loosely
 * and some match none, and it is offered for a person to accept.
 */
export function suggestLines<L extends { id: string; description: string; is_heading: boolean }>(name: string, lines: L[]): string[] {
  const mine = words(name)
  if (!mine.size) return []
  const scored = lines.filter((l) => !l.is_heading).map((l) => {
    const theirs = words(l.description)
    if (!theirs.size) return { id: l.id, score: 0 }
    let shared = 0
    for (const w of mine) if (theirs.has(w)) shared++
    // How much of the pay line's own wording the activity accounts for.
    return { id: l.id, score: shared / theirs.size, shared }
  }).filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score)
  if (!scored.length) return []
  return scored.filter((s) => s.score >= scored[0].score).slice(0, 3).map((s) => s.id)
}
