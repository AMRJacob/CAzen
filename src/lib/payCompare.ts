import type { Figures } from './payapps'
import type { PdfLine } from './payRead'
import type { CoKey, G702Key, G702Read } from './payTable'

/** What was read off the contractor's application, kept on the application (migration 0048). */
export interface PdfRead {
  file?: string
  /** The application's period and date as the PDF prints them. */
  periodTo?: string
  appliedOn?: string
  /** Where the PDF itself is kept, to look at beside the figures. */
  path?: string
  read_at: string
  application?: string
  g702?: G702Read
  /** Where on the PDF each cover-sheet figure was read (page 1-based, box as fractions of the page). */
  g702At?: import('./payTable').TableRead['g702At']
  total?: PdfLine
  lines: Record<string, PdfLine>
}

export type PdfCol = keyof PdfLine
export interface Discrepancy {
  where: 'g702' | 'line' | 'total'
  lineId?: string
  label: string
  col: PdfCol | G702Key | CoKey
  pdf: number
  app: number
  /** The line isn't on the PDF at all. */
  missing?: boolean
}

export const COL_SAYS: Record<PdfCol, string> = {
  C: 'scheduled value', D: 'from previous', E: 'this period', F: 'stored', G: 'completed and stored',
  pct: '% complete', H: 'balance to finish', I: 'retainage',
}
export const CO_SAYS: Record<CoKey, string> = {
  coPreviousAdditions: 'Change orders approved before this month — additions', coPreviousDeductions: 'Change orders approved before this month — deductions',
  coThisAdditions: 'Change orders approved this month — additions', coThisDeductions: 'Change orders approved this month — deductions',
}
export const G702_SAYS: Record<G702Key, string> = {
  originalSum: '1. Original contract sum', changeOrders: '2. Net change by change orders', contractSum: '3. Contract sum to date',
  completedAndStored: '4. Total completed and stored', retainageTotal: '5. Total retainage', earnedLessRetainage: '6. Total earned less retainage',
  previousCertificates: '7. Less previous certificates', due: '8. Current payment due', balanceToFinish: '9. Balance to finish',
}

/** Half a cent for dollars; for a percentage, what two printed places can hide. */
const agrees = (col: string, a: number, b: number) => Math.abs(a - b) < (col === 'pct' ? 0.006 : 0.005)

/**
 * CAzen's own figures set against the contractor's PDF: every column of every line it read, the
 * grand total row and the G702. Nothing here is taken from the PDF into the arithmetic — this only
 * says where the two part company.
 */
export function againstPdf(figures: Figures, pdf: PdfRead): Discrepancy[] {
  const out: Discrepancy[] = []
  const ours = (f: { line?: { scheduled_value: number }; scheduled?: number; previous: number; thisPeriod: number; stored: number; toDate: number; percent: number; balance: number; retainage: number }): Record<PdfCol, number> => ({
    C: f.line ? f.line.scheduled_value : f.scheduled ?? 0, D: f.previous, E: f.thisPeriod, F: f.stored, G: f.toDate, pct: f.percent, H: f.balance, I: f.retainage,
  })
  const g = figures.g702
  const co = figures.changeOrderSummary
  const coOf: Record<CoKey, number> = {
    coPreviousAdditions: co.previousAdditions, coPreviousDeductions: co.previousDeductions,
    coThisAdditions: co.thisAdditions, coThisDeductions: co.thisDeductions,
  }
  for (const [k, v] of Object.entries(pdf.g702 ?? {}) as [G702Key | CoKey, number][]) {
    if (v == null) continue
    if (k in coOf) {
      const ours = coOf[k as CoKey]
      if (!agrees(k, v, ours)) out.push({ where: 'g702', label: CO_SAYS[k as CoKey], col: k, pdf: v, app: ours })
    } else if (!agrees(k, v, g[k as G702Key])) out.push({ where: 'g702', label: G702_SAYS[k as G702Key], col: k, pdf: v, app: g[k as G702Key] })
  }
  for (const f of figures.lines) {
    const p = pdf.lines[f.line.id]
    if (!p) continue
    const o = ours(f)
    for (const [c, v] of Object.entries(p) as [PdfCol, number][]) {
      if (v != null && !agrees(c, v, o[c])) out.push({ where: 'line', lineId: f.line.id, label: [f.line.item_no, f.line.description].filter(Boolean).join(' '), col: c, pdf: v, app: o[c] })
    }
  }
  // A line CAzen has a value on that the PDF doesn't list, where the PDF's lines were read.
  if (Object.keys(pdf.lines).length) {
    for (const f of figures.lines) {
      if (!pdf.lines[f.line.id] && Math.abs(f.line.scheduled_value) >= 0.005) {
        out.push({ where: 'line', lineId: f.line.id, label: [f.line.item_no, f.line.description].filter(Boolean).join(' '), col: 'C', pdf: 0, app: f.line.scheduled_value, missing: true })
      }
    }
  }
  if (pdf.total) {
    const o = ours(figures.totals)
    for (const [c, v] of Object.entries(pdf.total) as [PdfCol, number][]) {
      if (v != null && !agrees(c, v, o[c])) out.push({ where: 'total', label: 'Grand total', col: c, pdf: v, app: o[c] })
    }
  }
  return out
}

// ---------- The PDF against itself ----------

/** A figure on the contractor's cover sheet that its own other figures disagree with. */
export interface OwnSlip {
  /** The cover-sheet figure the others point to, where one figure alone explains it. */
  key?: G702Key | CoKey | 'totalC' | 'totalG' | 'totalI'
  label: string
  printed: number
  /** What the PDF's other figures give for it. */
  works: number
  /** The arithmetic that does not hold, in words. */
  sum: string
}

const OWN_SAYS: Record<string, string> = { ...G702_SAYS, ...CO_SAYS, totalC: 'Grand total, scheduled value', totalG: 'Grand total, completed and stored', totalI: 'Grand total, retainage' }

/**
 * The contractor's cover sheet checked against itself: lines 1 + 2 = 3, 4 − 5 = 6, 6 − 7 = 8,
 * 3 − 6 = 9, the change order summary against line 2, and lines 3, 4 and 5 against the G703's grand
 * totals. Where one figure alone breaks every sum it is in, and putting what the others give in its
 * place makes them all hold, that figure is named — it is a typo on the PDF or a misreading of it.
 * Otherwise each sum that fails is the contractor's arithmetic.
 */
export function ownArithmetic(pdf: PdfRead): OwnSlip[] {
  const g = pdf.g702 ?? ({} as Partial<G702Read>)
  const v: Record<string, number | undefined> = { ...g, totalC: pdf.total?.C, totalG: pdf.total?.G, totalI: pdf.total?.I }
  const sums: { terms: [string, number][]; say: string }[] = [
    { terms: [['originalSum', 1], ['changeOrders', 1], ['contractSum', -1]], say: 'line 1 + line 2 = line 3' },
    { terms: [['completedAndStored', 1], ['retainageTotal', -1], ['earnedLessRetainage', -1]], say: 'line 4 − line 5 = line 6' },
    { terms: [['earnedLessRetainage', 1], ['previousCertificates', -1], ['due', -1]], say: 'line 6 − line 7 = line 8' },
    { terms: [['contractSum', 1], ['earnedLessRetainage', -1], ['balanceToFinish', -1]], say: 'line 3 − line 6 = line 9' },
    { terms: [['changeOrders', 1], ['coPreviousAdditions', -1], ['coThisAdditions', -1], ['coPreviousDeductions', 1], ['coThisDeductions', 1]], say: 'the change order summary’s net = line 2' },
    { terms: [['contractSum', 1], ['totalC', -1]], say: 'line 3 = the G703’s scheduled value total' },
    { terms: [['completedAndStored', 1], ['totalG', -1]], say: 'line 4 = the G703’s completed and stored total' },
    { terms: [['retainageTotal', 1], ['totalI', -1]], say: 'line 5 = the G703’s retainage total' },
  ]
  // A sum is checked only where every figure in it was read (the change order summary may leave
  // a this-month figure blank, which is nothing).
  const can = sums.filter((s) => s.terms.every(([k]) => v[k] != null || k.startsWith('coThis')))
  const off = (s: typeof sums[number]) => s.terms.reduce((t, [k, sign]) => t + (v[k] ?? 0) * sign, 0)
  const failing = can.filter((s) => Math.abs(off(s)) >= 0.01)
  if (!failing.length) return []
  // One figure in every failing sum and in none that holds, giving the same value in each — and
  // only one such figure, or which of them is wrong can't be told.
  const odd: OwnSlip[] = []
  for (const [k] of failing[0].terms) {
    if (v[k] == null) continue
    if (!failing.every((s) => s.terms.some(([x]) => x === k))) continue
    if (can.some((s) => !failing.includes(s) && s.terms.some(([x]) => x === k))) continue
    const gives = failing.map((s) => { const sign = s.terms.find(([x]) => x === k)![1]; return v[k]! - off(s) / sign })
    if (gives.every((x) => Math.abs(x - gives[0]) < 0.01)) {
      odd.push({ key: k as OwnSlip['key'], label: OWN_SAYS[k], printed: v[k]!, works: Math.round(gives[0] * 100) / 100, sum: failing.map((s) => s.say).join('; ') })
    }
  }
  if (odd.length === 1) return odd
  return failing.map((s) => {
    const [k, sign] = s.terms[s.terms.length - 1]
    return { label: OWN_SAYS[k], printed: v[k] ?? 0, works: Math.round(((v[k] ?? 0) - off(s) / sign) * 100) / 100, sum: s.say }
  })
}

// ---------- Why they differ ----------

/** Whose the difference is, so it can be put right in the right place or asked about. */
export type Whose = 'contractor' | 'reading' | 'cazen' | 'rounding' | 'either'
export const WHOSE_SAYS: Record<Whose, string> = {
  contractor: 'The contractor’s figures', reading: 'The PDF or its reading', cazen: 'Entered in CAzen',
  rounding: 'Rounding practice', either: 'The contractor or CAzen',
}

export interface DiffGroup {
  key: 'own' | 'misread' | 'dates' | 'co' | 'previous' | 'scheduled' | 'entered' | 'retainage' | 'cover' | 'other'
  whose: Whose
  title: string
  /** Column headings for the two figures, where they are not "Contractor's PDF" and "CAzen". */
  heads?: [string, string]
  detail?: string
  /** The differences to show: on a line, only the one the others follow from. */
  rows: Discrepancy[]
  /** Differences left out of `rows` because they follow from one shown. */
  follow: number
}

export interface WhyContext {
  /** Line 2 as CAzen has it on this application. */
  coHere: number
  /** This application's period end. */
  periodTo: string
  /** The period end the PDF prints, where it was read. */
  pdfPeriodTo?: string
  /** The change order lines on this application, by approval date (null: undated). */
  coDates: { date: string | null; total: number }[]
  /** A way of rounding retainage that would make every retainage figure agree, if there is one. */
  retainageFix?: { label: string } | null
  /** Where the contractor's cover sheet disagrees with itself. */
  own?: OwnSlip[]
  /** What is wrong with this application's dates, in sentences. */
  dates?: string[]
}

const near = (a: number, b: number, by = 0.5) => Math.abs(a - b) < by
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * Differences sorted by what causes them, so twenty red figures that come from one change order
 * dated wrong read as one thing: the cause, in words, with the figure it starts from. A line
 * whose "from previous" differs also differs in completed, balance, % and retainage; only the
 * first is shown, and the rest are counted as following from it.
 */
export function whyTheyDiffer(diffs: Discrepancy[], ctx: WhyContext): DiffGroup[] {
  const groups: DiffGroup[] = []
  const used = new Set<Discrepancy>()
  const take = (g: DiffGroup) => { if (g.rows.length) { groups.push(g); g.rows.forEach((d) => used.add(d)) } }

  // The PDF against itself first: a figure its own other figures disagree with is either a typo
  // on the PDF or a misreading, and the PDF beside the sheet shows which.
  for (const slip of ctx.own ?? []) {
    const d = slip.key && diffs.find((x) => !used.has(x) && (x.col === slip.key ||
      (slip.key === 'totalC' && x.where === 'total' && x.col === 'C') || (slip.key === 'totalG' && x.where === 'total' && x.col === 'G') || (slip.key === 'totalI' && x.where === 'total' && x.col === 'I')))
    if (d && near(d.app, slip.works, 0.01)) {
      take({ key: 'misread', whose: 'reading', rows: [d], follow: 0,
        title: `${slip.label}: the PDF’s own lines give ${usd(slip.works)}`,
        detail: 'A misreading or a typo on the PDF.' })
    }
  }
  const unexplained = (ctx.own ?? []).filter((slip) => !groups.some((g) => g.key === 'misread' && g.title.startsWith(`${slip.label}:`)))
  if (unexplained.length) {
    const rows: Discrepancy[] = unexplained.map((s) => ({ where: 'g702', label: s.label, col: (s.key ?? 'due') as G702Key, pdf: s.printed, app: s.works }))
    groups.push({ key: 'own', whose: 'contractor', rows, follow: 0, heads: ['Printed on the PDF', 'The PDF’s other figures give'],
      title: `The PDF’s cover sheet doesn’t add up (${unexplained.map((s) => s.sum).join('; ')})`,
      detail: `CAzen column: what ${unexplained.map((s) => s.sum.split(' = ')[0]).join('; ')} give on the PDF` })
    // The same figures, where they also differ from CAzen, are shown here and not again.
    for (const s of unexplained) for (const d of diffs) if (s.key && d.col === s.key) used.add(d)
  }

  // Change orders: line 2, and what line 2 carries into lines 3 and 9 and the sheet's totals.
  const theirs = diffs.find((d) => !used.has(d) && d.col === 'changeOrders')
  const coGap = theirs ? theirs.app - theirs.pdf : 0
  const isCo = (d: Discrepancy) => d.col in CO_SAYS
  if (theirs || diffs.some(isCo)) {
    const rows = diffs.filter((d) => !used.has(d) && (d === theirs || isCo(d)))
    const follows = diffs.filter((d) => !rows.includes(d) && coGap && (
      (d.where === 'g702' && (d.col === 'contractSum' || d.col === 'balanceToFinish') && near(d.app - d.pdf, coGap, 2)) ||
      (d.where === 'total' && (d.col === 'C' || d.col === 'H') && near(d.app - d.pdf, coGap, 2)) ||
      (d.where === 'total' && d.col === 'pct')))
    follows.forEach((d) => used.add(d))
    take({
      key: 'co', rows, follow: follows.length, whose: 'either',
      title: 'Change orders',
      detail: 'CAzen’s line 2 is the total of the lines marked as change order lines.',
    })
  }

  // Line by line: the first column that differs is the cause; the columns after it follow.
  const ORDER = ['C', 'D', 'E', 'F', 'G', 'H', 'pct', 'I']
  const byLine = new Map<string, Discrepancy[]>()
  for (const d of diffs) if (d.where === 'line' && d.lineId) byLine.set(d.lineId, [...(byLine.get(d.lineId) ?? []), d])
  const roots: Record<string, Discrepancy[]> = { C: [], D: [], E: [], I: [], other: [] }
  let followers: Record<string, number> = { C: 0, D: 0, E: 0, I: 0, other: 0 }
  for (const ds of byLine.values()) {
    ds.sort((a, b) => ORDER.indexOf(String(a.col)) - ORDER.indexOf(String(b.col)))
    const root = ds[0]
    const bucket = root.col === 'C' ? 'C' : root.col === 'D' ? 'D' : root.col === 'E' || root.col === 'F' ? 'E'
      : ds.every((d) => d.col === 'I') ? 'I' : 'other'
    roots[bucket].push(root)
    followers[bucket] += ds.length - 1
    ds.slice(1).forEach((d) => used.add(d))
  }
  take({ key: 'scheduled', whose: 'contractor', rows: roots.C, follow: followers.C,
    title: 'Scheduled value',
    detail: 'Each application starts from the previous one’s values; right-click a value on the sheet to change it on this application.' })
  take({ key: 'previous', whose: 'either', rows: roots.D, follow: followers.D,
    title: 'From previous',
    detail: 'Compared with what CAzen’s earlier applications billed.' })
  take({ key: 'entered', whose: 'cazen', rows: roots.E, follow: followers.E,
    title: 'This period or stored',
    detail: 'Changed in CAzen after the PDF was read.' })

  // Retainage alone, by a dollar or two: the contractor rounds it another way. With no line read
  // (an older reading), the retainage figures on the cover sheet and totals row say the same.
  if (!roots.I.length) {
    const lone = diffs.filter((d) => !used.has(d) && Math.abs(d.pdf - d.app) <= 3 && ((d.where === 'total' && d.col === 'I') || (d.where === 'g702' && ['retainageTotal', 'earnedLessRetainage', 'previousCertificates', 'due'].includes(String(d.col)))))
    // A dollar or two on the amount due alone, with everything else agreeing, is retainage rounded
    // another way on an earlier application, carried through line 7.
    if (lone.length) roots.I.push(...lone)
  }
  const small = roots.I.every((d) => Math.abs(d.pdf - d.app) <= 3)
  const retFollow = diffs.filter((d) => !used.has(d) && !roots.I.includes(d) && roots.I.length && small && (
    (d.where === 'total' && d.col === 'I') ||
    (d.where === 'g702' && ['retainageTotal', 'earnedLessRetainage', 'previousCertificates', 'due', 'balanceToFinish'].includes(String(d.col)) && Math.abs(d.pdf - d.app) <= 3 * Math.max(1, roots.I.length))))
  retFollow.forEach((d) => used.add(d))
  take({ key: 'retainage', whose: 'rounding', rows: roots.I, follow: followers.I + retFollow.length,
    title: 'Retainage',
    detail: small && ctx.retainageFix ? `“${ctx.retainageFix.label}” matches the PDF.` : undefined })
  take({ key: 'other', whose: 'contractor', rows: roots.other, follow: followers.other, title: 'Completed, balance or %',
    detail: 'Scheduled value, from previous and this period agree; the row’s arithmetic differs.' })

  // Whatever is left on the cover sheet and the totals row.
  const rest = diffs.filter((d) => !used.has(d))
  take({ key: 'cover', whose: 'either', rows: rest, follow: 0,
    title: groups.length ? 'Totals carried from the above' : 'Cover sheet and totals' })
  return groups
}
