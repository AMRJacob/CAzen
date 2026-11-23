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
  /** The line number (ID) printed on the schedule — kept, so the row can be found on the sheet. */
  no?: string | null
  /**
   * Its place in the schedule's outline, 0 at the top. A row with rows one level deeper under it
   * is a summary — `is_heading`, with the dates the schedule prints for it.
   */
  level?: number
  /** What the reader was not sure of, and why — shown in red in the preview until looked at. */
  unsure?: { starts?: string; ends?: string; name?: string }
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
  // Not \b in front: a scan runs the weekday into the date ("Mon2/16/26").
  take(/(?<![\d/.-])(\d{1,2})[/\-.](\d{1,2})[/\-.]((?:20)?\d{2})\b/g, (m) => iso(+m[3], +m[1], +m[2]))
  return out.sort((a, b) => a.at - b.at)
}

/**
 * What a scan does to a date: O for 0, l and I for 1, S for 5, B for 8. Only tokens already
 * shaped like a date are touched, so no word of a name is ever "corrected".
 */
export function mendDates(line: string): string {
  return line.replace(/(?<![0-9/])[\dOoIl|SsBZ]{1,2}[/\-][\dOoIl|SsBZ]{1,2}[/\-][\dOoIl|SsBZ]{2,4}(?![A-Za-z0-9])/g, (t) =>
    t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8').replace(/Z/g, '2'))
}

const JUNK = /^(activity|task)?\s*(id|name|description|#|no\.?)\b|^page\b|^(start|finish|duration|orig(inal)?|rem(aining)?|early|late|total float|predecessors?|successors?|resource names?|% ?complete|page \d|data date|run date|print(ed)?|layout|filter|©|legend|remaining work|critical|milestone|summary)\b/i

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

/** A date a long way from the rest is more often a misread digit than a real outlier. */
function flagStrays(list: ReadActivity[]): void {
  const days = list.flatMap((a) => [a.starts_on, a.ends_on]).filter((d): d is string => !!d).sort()
  if (days.length < 8) return
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
  const lo = t(days[Math.floor(days.length * 0.1)]), hi = t(days[Math.floor(days.length * 0.9)]), slack = Math.max(120, (hi - lo) * 0.5)
  for (const a of list) {
    for (const k of ['starts', 'ends'] as const) {
      const d = k === 'starts' ? a.starts_on : a.ends_on
      if (d && (t(d) < lo - slack || t(d) > hi + slack)) (a.unsure ??= {})[k] ??= 'This date is far from the rest of the schedule'
    }
  }
}

/** A line as text alone, or with the line number it was found by (`scheduleRows`). */
export type ScheduleLine = string | { no: string | null; text: string; label?: string; /** The reader's lowest confidence in this row's dates, 0–100. */ dateConf?: number; /** Whether the row's number was read or worked out from its place. */ guessedNo?: boolean; /** How far the name is indented, in text heights. */ indent?: number }

const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * A scanned name, tidied. Rulings and bars leave stray letters at the end of a name ("Prep BN",
 * "Fence )") and a misread duration in the middle of it ("Slab 6ldays"). Where the chart beside
 * the table repeats the name, the name is kept as far as the two readings agree; otherwise only
 * what cannot be a word is trimmed.
 */
export function tidyScanned(name: string, label: string | undefined, heading: boolean): string {
  let words = name.replace(/\s[-–]?\s?\S{0,3}\s?days?\b.*$/i, '').split(/\s+/).filter(Boolean)
  // What a ruling, a bar's end or a pen mark leaves in front of a name: a lone letter or digit,
  // a stray symbol, "2%". A name does not start with those.
  while (words.length > 1 && /^([^A-Za-z0-9]+|[A-Za-z]|\d{1,3}%?|[^A-Za-z]*\d[^A-Za-z]*)$/.test(words[0]) && /^[A-Z(]/.test(words[1])) words.shift()
  // The chart's copy of the name may have what the table's lost at its start ("& Pour Slab"
  // beside "Form & Pour Slab"): then the chart's is the name.
  if (label) {
    const chart = label.replace(/^(\d{1,2}\/\d{1,2}\s*)?[^A-Za-z(]*/, '').trim()
    const mine = squash(words.join(''))
    const extra = chart.split(/\s+/)
    const lost = extra.slice(0, Math.max(0, extra.length - words.length))
    // Only real words count as lost ones: a bar's reading ("SE wasn") is not part of a name.
    if (mine.length >= 4 && squash(chart).endsWith(mine) && squash(chart).length > mine.length && squash(chart).length - mine.length <= 12
      && lost.length && lost.every((w) => /^([A-Z][a-z]+|[A-Z]{2,}|&|-|and|of)$/.test(w))) words = extra
  }
  if (label) {
    const against = squash(label)
    for (const skip of [0, 1]) {
      // Reading past the first word is for a first word that is junk, not the start of the name.
      if (skip && words[0] && /^[A-Z][a-z]{2,}|^[A-Z]{3,}$/.test(words[0])) continue
      const from = words.slice(skip), whole = squash(from.join(''))
      let same = 0
      while (same < whole.length && same < against.length && whole[same] === against[same]) same++
      if (same < 4) continue
      // The chart's own copy can be cut short by the edge of the page; a label that ran out
      // while still agreeing says nothing against the rest of the name.
      if (same >= against.length - 2) { words = from; break }
      let k = 0
      for (let n = 1; n <= from.length; n++) if (squash(from.slice(0, n).join('')).length <= same) k = n
      // Only a little may be cut on the chart's say-so: a few stray letters, never real words.
      if (k >= 1 && squash(from.slice(k).join('')).length <= 4) { words = from.slice(0, k); break }
      words = from; break
    }
  }
  const junk = (w: string) => !/[A-Za-z0-9]/.test(w) || (/^[^A-Za-z0-9]*[A-Za-z]{1,2}[^A-Za-z0-9]*$/.test(w) && !/^(of|to|at|in|on|by|or|&|@)$/i.test(w) && w !== w.toUpperCase())
    || (heading && w.replace(/[^A-Za-z0-9]/g, '').length <= 3)
  while (words.length > 1 && junk(words[words.length - 1])) words.pop()
  return words.join(' ').replace(/[\s(]+$/, '').trim()
}

export function readSchedule(lines: ScheduleLine[], opts: { scanned?: boolean } = {}): ReadActivity[] {
  const out: ReadActivity[] = []
  let pendingHeading: string | null = null
  let pendingAt: { no: string | null; indent?: number } = { no: null }
  const indents: (number | undefined)[] = []
  for (const given of lines) {
    const raw = typeof given === 'string' ? given : given.text
    const line = (opts.scanned ? mendDates(raw) : raw).replace(/\u00a0/g, ' ').trim()
    if (!line) continue
    // Found by its number, the number is known; read as a plain line, it is the line's first
    // token if that is a small whole number.
    const no = typeof given === 'string' ? (line.match(/^(\d{1,4})\s+\S/)?.[1] ?? null) : given.no
    const dates = datesIn(line)
    if (!dates.length) {
      let clean = line.replace(/[|[\]{}_=~]+/g, ' ').replace(/\s+/g, ' ').trim()
      // A numbered row with no dates is a summary row: its name, less what the rulings left on it.
      if (opts.scanned && typeof given !== 'string') clean = tidyScanned(clean, undefined, true)
      const letters = clean.replace(/[^A-Za-z]/g, '').length
      // A heading is mostly words. What a scan makes of a row of bars is mostly not.
      if (letters >= 4 && letters / clean.replace(/\s/g, '').length >= 0.75 && clean.length <= 70 && !JUNK.test(clean)) {
        pendingHeading = clean
        pendingAt = typeof given === 'string' ? { no } : { no: given.no, indent: given.indent }
      }
      continue
    }
    const tail = dates.length > 1 ? dates[1].end : dates[0].end
    let name = nameFrom(line.slice(0, dates[0].at), line.slice(tail))
    if (opts.scanned && typeof given !== 'string') name = tidyScanned(name, given.label, false)
    if (!name || JUNK.test(name)) continue
    if (pendingHeading) {
      out.push({ name: pendingHeading, is_heading: true, starts_on: null, ends_on: null, percent: 0 })
      indents.push(pendingAt.indent)
      pendingHeading = null
    }
    let [a, b] = [dates[0].day, (dates[1] ?? dates[0]).day]
    if (b < a) [a, b] = [b, a]
    const pc = line.match(/(\d{1,3})(?:\.\d+)?\s?%/)
    const unsure: NonNullable<ReadActivity['unsure']> = {}
    if (dates.length < 2) { unsure.ends = 'Only one date was read on this line'; unsure.starts = unsure.ends }
    else if (dates[1].day < dates[0].day) { unsure.starts = 'The finish read is before the start'; unsure.ends = unsure.starts }
    // The line checks itself where the schedule prints enough to check it with: the weekday
    // beside each date, and the duration beside the pair. A date whose weekday is wrong was
    // misread; so, where no weekday could be read, was one of a pair that is not as long as
    // the line says. (The reader's own confidence was tried and says little: on a real scan
    // it gave correct dates a score of nothing.)
    if (dates.length >= 2) {
      const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
      const printed = dates.slice(0, 2).map((d) => line.slice(Math.max(0, d.at - 7), d.at).match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?\s*$/i)?.[1].toLowerCase() ?? null)
      const agrees = dates.slice(0, 2).map((d, i) => (printed[i] ? DAYS[new Date(`${d.day}T00:00:00Z`).getUTCDay()] === printed[i] : null))
      if (agrees[0] === false) unsure.starts ??= `The line says ${printed[0]![0].toUpperCase()}${printed[0]!.slice(1)}, and this date is not one`
      if (agrees[1] === false) unsure.ends ??= `The line says ${printed[1]![0].toUpperCase()}${printed[1]!.slice(1)}, and this date is not one`
      const long = line.slice(0, dates[0].at).match(/(\d{1,4})\s?d(?:ays?)?\b(?!.*\d\s?d(?:ays?)?\b)/i)
      if (long && !(agrees[0] && agrees[1]) && dates[1].day >= dates[0].day) {
        const t = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
        const span = t(dates[1].day) - t(dates[0].day) + 1
        let working = 0
        for (let x = t(dates[0].day); x <= t(dates[1].day); x++) { const wd = new Date(x * 86400000).getUTCDay(); if (wd !== 0 && wd !== 6) working++ }
        const said = Number(long[1])
        if (said !== span && said !== working && said !== span - 1) {
          const why = `The line says ${said} days, and these dates are ${span} apart`
          if (agrees[0] !== true) unsure.starts ??= why
          if (agrees[1] !== true) unsure.ends ??= why
        }
      }
    }
    if (typeof given !== 'string' && given.guessedNo) unsure.name = 'The line number was not read; this row was placed by its position'
    out.push({
      no, name, is_heading: false, starts_on: a, ends_on: b, ...(Object.keys(unsure).length ? { unsure } : {}),
      percent: pc ? Math.max(0, Math.min(100, Number(pc[1]))) : 0,
    })
    indents.push(typeof given === 'string' ? undefined : given.indent)
  }
  flagStrays(out)
  outline(out, indents)
  return out
}

/**
 * The schedule's outline, from how far each name is indented. The indents are gathered into the
 * few distances the program uses, one step apart; each row's level is how many steps in it is.
 * A scheduling program never puts a row two levels below the one above it, so a row that reads
 * that way has had the start of its name lost, and is taken as the row above's sibling. A row
 * with a deeper row straight after it is a summary: a heading, keeping the dates printed for it.
 * Where nothing is indented — a flat schedule — nothing changes.
 */
export function outline(rows: ReadActivity[], indents: (number | undefined)[]): void {
  const known = indents.filter((x): x is number => x != null).sort((a, b) => a - b)
  if (known.length < 4) return
  // The step between levels: the widest step that every indent sits on (to within an eighth of
  // a step, on average). Half the true step would fit too, so the widest that fits is taken.
  const base = known[0]
  if (known[known.length - 1] - base < 0.5) return
  let step = 0
  for (let s = 4; s >= 0.6; s -= 0.02) {
    const err = known.reduce((t, x) => { const f = (x - base) / s; return t + Math.abs(f - Math.round(f)) }, 0) / known.length
    if (err < 0.12) { step = s; break }
  }
  if (!step) return
  let prev = -1
  rows.forEach((r, i) => {
    const x = indents[i]
    let level = x == null ? Math.max(prev, 0) : Math.round((x - base) / step)
    if (prev >= 0 && level > prev + 1) level = prev
    r.level = Math.max(0, level)
    prev = r.level
  })
  for (let i = 0; i < rows.length - 1; i++) {
    if ((rows[i + 1].level ?? 0) > (rows[i].level ?? 0)) rows[i].is_heading = true
  }
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
