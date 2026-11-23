/**
 * Reading a contractor's application for payment — the G703's rows — into this period's figures.
 *
 * The app already knows two things about every line before the PDF is opened: its scheduled
 * value (C) and what was billed before (D). A G703 row is arithmetic over those: completed and
 * stored to date (G) is D plus this period (E) plus stored (F), and the balance (H) is C less G.
 * So a row is not read by where its numbers sit — columns left blank make that unreliable, and a
 * scan more so — but by which of its numbers make that arithmetic come out. Where they do, the
 * figure is taken as read. Where they do not, the best guess is given and marked as unsure,
 * with the reason, to be looked at before it is kept.
 *
 * Dependency-free (`checks/payread.test.ts`).
 */
import { settle, COLUMN_NAME, type TableRead, type TableRow, type Fig } from './payTable.ts'

export interface Known { id: string; item_no: string | null; description: string; scheduled: number; previous: number }
export interface ReadRow {
  id: string
  found: boolean
  this_period: number
  stored: number
  /** Why a figure should be looked at; absent when the row's own arithmetic bears it out. */
  unsure?: string
  /** Said for the record, not to be looked at: a figure mended and borne out by the column's total. */
  note?: string
  /** The line of the PDF it was read from. */
  from?: string
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.015
const NUM = /\(?-?\$?\s?\d[\d,]*(?:\.\d+)?\)?%?/g

/** The numbers on a line, in order; percentages left out. Brackets and a leading minus are negative. */
export function numbersIn(line: string): number[] {
  const out: number[] = []
  for (const m of line.match(NUM) ?? []) {
    if (m.endsWith('%')) continue
    const neg = /^\(.*\)$/.test(m) || m.includes('-')
    const n = Number(m.replace(/[^\d.]/g, ''))
    if (Number.isFinite(n)) out.push(neg ? -n : n)
  }
  return out
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w))
function alike(a: string, b: string): number {
  const x = new Set(words(a)), y = new Set(words(b))
  if (!x.size || !y.size) return 0
  let same = 0
  for (const w of x) if (y.has(w)) same++
  return same / Math.max(x.size, y.size)
}

interface Parsed { text: string; item: string | null; name: string; nums: number[] }
function parse(text: string): Parsed | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  const lead = t.match(/^([A-Za-z]{0,3}\d{1,4}(?:[.-]\d{1,3})?)[.)]?\s+(?=\S)/)
  const rest = lead ? t.slice(lead[0].length) : t
  // The name runs up to the first figure that looks like money.
  const at = rest.search(/\(?-?\$?\s?\d[\d,]*\.\d{2}\b|\(?-?\$\s?\d|\b\d{1,3}(?:,\d{3})+\b/)
  const name = (at < 0 ? rest : rest.slice(0, at)).trim()
  const nums = at < 0 ? [] : numbersIn(rest.slice(at))
  if (!name && !nums.length) return null
  return { text: t, item: lead ? lead[1] : null, name, nums }
}

/** One row's E and F from its numbers, given C and D. */
export function solve(nums: number[], C: number, D: number): { e: number; f: number; unsure?: string } {
  const pool = [...nums]
  let sawC = false, sawD = false
  if (pool.length && near(pool[0], C)) { pool.shift(); sawC = true }
  if (D !== 0 && pool.length && near(pool[0], D)) { pool.shift(); sawD = true }
  const notes: string[] = []
  if (!sawC && nums.length) notes.push(nums.some((n) => near(n, C)) ? '' : 'the scheduled value on the PDF is not the one on record')
  if (D !== 0 && !sawD && !nums.some((n) => near(n, D))) notes.push('“from previous” on the PDF is not what earlier applications add up to')

  let best: { e: number; f: number; score: number } | null = null
  const options = [-1, ...pool.keys()]
  for (const i of options) for (const j of options) {
    if (i >= 0 && i === j) continue
    const e = i < 0 ? 0 : pool[i], f = j < 0 ? 0 : pool[j]
    if (f < 0) continue
    const none = i < 0 && j < 0
    const G = D + e + f
    const g = pool.findIndex((n, k) => k !== i && k !== j && near(n, G))
    if (g < 0) continue
    const h = pool.findIndex((n, k) => k !== i && k !== j && k !== g && near(n, C - G))
    // In reading order E comes before F, and both before G.
    const ordered = (i < 0 || j < 0 || i < j) && (i < 0 || i < g) && (j < 0 || j < g)
    // Nothing billed is believed only when the row says so twice: G equal to D, and the balance.
    if (none && !(h >= 0 || near(G, C))) continue
    const score = 2 + (h >= 0 || near(G, C) ? 2 : 0) + (ordered ? 1 : 0) - (j >= 0 ? 0.25 : 0) - (none ? 0.5 : 0)
    if (!best || score > best.score) best = { e, f, score }
  }
  const why = notes.filter(Boolean)
  if (best) {
    if (best.score < 4) why.unshift('the balance to finish on this row was not found to check it by')
    return { e: best.e, f: best.f, ...(why.length ? { unsure: why.join('; ') } : {}) }
  }
  // Nothing adds up. A row with nothing left over billed nothing; otherwise guess and say so.
  const left = pool.filter((n) => !near(n, C - D) && !near(n, D) && !near(n, C) && !(C && near(n, Math.round((D / C) * 10000) / 100)) && !(C && near(n, Math.round((D / C) * 100))) && n !== 0)
  if (!left.length) return { e: 0, f: 0, ...(why.length ? { unsure: why.join('; ') } : {}) }
  why.unshift('the figures on this row do not add up — this is the first one after “from previous”')
  return { e: left[0], f: 0, unsure: why.join('; ') }
}

export function readPayLines(lines: string[], known: Known[]): { rows: ReadRow[]; found: number; unsure: number } {
  const parsed = lines.map(parse).filter((p): p is Parsed => !!p && p.nums.length > 0 && !/^(grand\s+)?(sub)?totals?\b/i.test(p.name))
  const taken = new Set<number>()
  const rows: ReadRow[] = known.map((k) => {
    let pick = -1, top = 0
    parsed.forEach((p, i) => {
      if (taken.has(i)) return
      const sameItem = !!p.item && !!k.item_no && p.item.toLowerCase().replace(/^0+/, '') === k.item_no.toLowerCase().replace(/^0+/, '')
      const name = alike(p.name, k.description)
      const hasC = p.nums.some((n) => near(n, k.scheduled))
      // An item number alone is not enough — a page number or a different schedule has those too.
      const score = (sameItem ? 0.5 : 0) + name + (hasC ? 0.4 : 0)
      if (score > top && (name >= 0.5 || (sameItem && (hasC || name >= 0.34)))) { top = score; pick = i }
    })
    if (pick < 0) return { id: k.id, found: false, this_period: 0, stored: 0 }
    taken.add(pick)
    const p = parsed[pick]
    const s = solve(p.nums, k.scheduled, k.previous)
    return { id: k.id, found: true, this_period: s.e, stored: s.f, ...(s.unsure ? { unsure: s.unsure } : {}), from: p.text }
  })
  return { rows, found: rows.filter((r) => r.found).length, unsure: rows.filter((r) => r.unsure).length }
}

// ── from a table read off the page ──────────────────────────────────────────────────────────────


export interface Extra { item: string | null; name: string; scheduled: number; previous: number; this_period: number; stored: number }
export interface MatchRead {
  rows: ReadRow[]
  found: number
  unsure: number
  /** Rows of figures on the PDF that are not on the schedule of values — a new change order, say. */
  extra: Extra[]
  /** Item numbers the run of numbers says should be on the PDF and that were not read. */
  missing: string[]
  totals: TableRead['totals']
  /** Where a column's total and its lines disagree, and which row accounts for it. */
  totalNotes: string[]
  application?: string
}

const sameItem = (a: string | null, b: string | null) =>
  !!a && !!b && a.toLowerCase().replace(/\s+/g, '').replace(/^0+(?=\d)/, '') === b.toLowerCase().replace(/\s+/g, '').replace(/^0+(?=\d)/, '')
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The schedule of values' lines found among the rows of a table read off the PDF — by item
 * number first, as the sheet numbers them, and by name and scheduled value where a line has no
 * number (change orders often have none). Each row's figures are settled again knowing what the
 * app already holds for the line, and what could not be borne out is said.
 */
export function matchTable(table: TableRead, known: Known[]): MatchRead {
  const lines = table.rows.filter((r) => r.kind === 'line')
  const names = new Map<TableRow, string>(lines.map((r) => [r, r.name]))

  // Names that run onto a second line: the sheet wraps one way or the other; the way under which
  // the numbered rows' names come closer to the schedule of values is taken.
  if (table.wraps.length) {
    const tryWay = (way: 'up' | 'down') => {
      const m = new Map(names)
      for (const w of table.wraps) {
        const k = way === 'up' ? w.below : w.above
        if (k == null || /copyright|aia document|contract documents/i.test(w.text) || /^([A-I]\s*){1,9}$/.test(w.text.trim())) continue
        const r = table.rows[k]
        if (r.kind !== 'line') continue
        m.set(r, way === 'up' ? `${w.text} ${m.get(r)}` : `${m.get(r)} ${w.text}`)
      }
      let score = 0
      for (const k of known) { const r = lines.find((x) => sameItem(x.item, k.item_no)); if (r) score += alike(m.get(r) ?? '', k.description) }
      return { m, score }
    }
    const up = tryWay('up'), down = tryWay('down')
    for (const [r, n] of (up.score >= down.score ? up : down).m) names.set(r, n)
  }

  const taken = new Set<TableRow>()
  const pick = new Map<string, TableRow>()
  // By number.
  for (const k of known) {
    if (!k.item_no) continue
    const r = lines.find((x) => !taken.has(x) && sameItem(x.item, k.item_no))
    if (r) { taken.add(r); pick.set(k.id, r) }
  }
  // By name and value, for lines with no number or whose number was not found.
  for (const k of known) {
    if (pick.has(k.id)) continue
    let best: TableRow | null = null, top = 0
    for (const r of lines) {
      if (taken.has(r)) continue
      const name = alike(names.get(r) ?? '', k.description)
      const hasC = near(r.value.C, k.scheduled) && k.scheduled !== 0
      const score = name + (hasC ? 0.5 : 0) + (!r.item && !k.item_no ? 0.1 : 0)
      if (score > top && (name >= 0.5 || (hasC && name >= 0.2) || (hasC && !r.item && !k.item_no))) { top = score; best = r }
    }
    if (best) { taken.add(best); pick.set(k.id, best) }
  }

  const doubtful = (col: Fig) => {
    const t = table.totals.find((x) => x.col === col)
    return !t || !t.agree
  }
  const rows: ReadRow[] = known.map((k) => {
    const r = pick.get(k.id)
    if (!r) return { id: k.id, found: false, this_period: 0, stored: 0 }
    const dotless = new Set<Fig>()
    const s = settle(r.read, { C: k.scheduled, D: k.previous }, dotless)
    const red: string[] = [], grey: string[] = []
    if (s.doubt) red.push(s.doubt)
    for (const col of s.mended) {
      const was = r.read[col]
      const said = was == null ? 'was not read' : `was read as ${fmt(was)}`
      const msg = `${COLUMN_NAME[col]} ${said}; the row’s other figures make it ${fmt(s.value[col])}`
      if ((col === 'E' || col === 'F') && doubtful(col)) red.push(msg)
      else grey.push(msg)
    }
    if (!near(s.value.C, k.scheduled)) red.push(`the scheduled value on the PDF is ${fmt(s.value.C)}; on record it is ${fmt(k.scheduled)}`)
    if (!near(s.value.D, k.previous)) red.push(`“from previous” on the PDF is ${fmt(s.value.D)}; earlier applications add up to ${fmt(k.previous)}`)
    if (k.item_no && r.item && sameItem(r.item, k.item_no) && alike(names.get(r) ?? '', k.description) < 0.2 && !near(s.value.C, k.scheduled))
      red.unshift(`line ${r.item} on the PDF is “${names.get(r)}” — is the numbering the same as the schedule of values?`)
    if (r.itemFixed) grey.push(`its item number was read wrong and was taken from the numbers either side`)
    return {
      id: k.id, found: true, this_period: s.value.E, stored: s.value.F,
      ...(red.length ? { unsure: red.join('; ') } : {}),
      ...(grey.length ? { note: grey.join('; ') } : {}),
      from: `${r.item ?? ''} ${names.get(r) ?? ''} · ${['C', 'D', 'E', 'F', 'G', 'H'].map((c) => r.read[c as Fig] == null ? '—' : fmt(r.read[c as Fig]!)).join(' · ')}`.trim(),
    }
  })

  const extra: Extra[] = lines
    // With nothing on record, every line is the schedule of values to be — a $0 line included.
    .filter((r) => !taken.has(r) && (!known.length || r.value.C || r.value.D || r.value.E || r.value.F))
    .map((r) => ({ item: r.item, name: names.get(r) ?? r.name, scheduled: r.value.C, previous: r.value.D, this_period: r.value.E, stored: r.value.F }))

  // A column total that disagrees with its lines, where one row accounts for the difference.
  const totalNotes: string[] = []
  const bad = table.totals.filter((t) => !t.agree)
  for (const t of bad) {
    const diff = Math.round((t.printed - t.added) * 100) / 100
    const twin = bad.find((u) => u !== t && near(u.printed - u.added, -diff))
    const who = lines.filter((r) => near(Math.abs(r.value[twin ? twin.col : t.col]), Math.abs(diff)))
    let say = `The PDF’s total for ${COLUMN_NAME[t.col]} is ${fmt(t.printed)}; its lines add up to ${fmt(t.added)}.`
    if (twin && who.length === 1) say += ` Line ${who[0].item ?? `“${who[0].name}”`} accounts for it: the row puts ${fmt(Math.abs(diff))} under ${COLUMN_NAME[twin.col]}, the total counts it under ${COLUMN_NAME[t.col]}.`
    if (!twin || t.col < twin.col) totalNotes.push(say)
  }

  return {
    rows, found: rows.filter((r) => r.found).length, unsure: rows.filter((r) => r.unsure).length,
    extra, missing: table.missing.filter((n) => !known.some((k) => sameItem(k.item_no, n) && pick.has(k.id))),
    totals: table.totals, totalNotes, ...(table.application ? { application: table.application } : {}),
  }
}
