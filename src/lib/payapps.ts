/**
 * The arithmetic of an application for payment.
 *
 * Everything on a G702 except the original contract sum and what the contractor billed this
 * period is worked out from something else on the form. The schedule of values belongs to the
 * contract; an application holds only this period's work and what is stored. Total to date,
 * retainage, balance to finish and the amount due all fall out of those two, so none of them is
 * a figure somebody typed and nobody checked — which is the whole point of not doing this in a
 * spreadsheet that gets retyped every month.
 *
 * Kept free of the database on purpose: it is the part that has to be right, so it is the part
 * that can be checked against a real pay app from a real job.
 */

export type Form = 'g702_g703' | 'g732_g733' | 'other'

export interface SovLine {
  id: string
  item_no: string | null
  description: string
  scheduled_value: number
  is_heading: boolean
  parent_id: string | null
  change_order_id: string | null
  /** A rate for this line alone, where one trade is held at a different percentage. */
  retainage_rate: number | null
  /** For a change order line: the date the owner approved it. */
  approved_on: string | null
  sort: number
}

export interface Billed {
  /** Column E: work completed this period. */
  this_period: number
  /** Column F: materials presently stored, not in D or E. */
  stored: number
}

export interface Contract {
  id: string
  form: Form
  original_sum: number
  retainage_work: number
  retainage_stored: number
  /** Columns the contractor rounds, and which way (migration 0047). */
  rounding?: Rounding | null
}

/**
 * Columns a contractor rounds to whole dollars (or, for %, whole percent), line by line.
 *
 * Retainage figured on each line and rounded is the usual one: a sheet held at 5% shows 1,489
 * where the arithmetic says 1,488.55, and its retainage total is the sum of the rounded lines.
 * Rounding a column here makes CAzen's figures come out as theirs do — totals and the G702
 * included — while the exact figure stays on hand for anyone who asks.
 */
export type RoundWay = 'nearest' | 'up' | 'down'
export type RoundColumn = 'G' | 'pct' | 'H' | 'I'
export type Rounding = Partial<Record<RoundColumn, RoundWay>>

/** A figure rounded to a whole unit the way the column says; cents are noise below a thousandth. */
export function roundAs(n: number, way: RoundWay | undefined): number {
  if (!way) return n
  const t = Math.round(n * 1000) / 1000
  const w = way === 'up' ? Math.ceil(t) : way === 'down' ? Math.floor(t) : Math.round(t)
  return w === 0 ? 0 : w
}

/** "10% until the job is 50% complete, then 5%." */
export interface RetainageStep {
  at_percent: number
  rate: number
}

export interface Application {
  id: string
  number: number
  period_to: string
  applied_on: string
  retainage_work: number | null
  retainage_stored: number | null
  status: string
  certified_sum: number | null
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const sum = (ns: number[]) => round(ns.reduce((a, b) => a + b, 0))

/** One line of a G703, with every column it carries. */
export interface LineFigures {
  line: SovLine
  /** Column D: work completed from previous applications. */
  previous: number
  /** Column E. */
  thisPeriod: number
  /** Column F. */
  stored: number
  /** Column G = D + E + F. */
  toDate: number
  /** Column G ÷ C. */
  percent: number
  /** Column H = C − G. */
  balance: number
  /** Column I. */
  retainage: number
  /** The exact figures of columns that are rounded, where rounding changed them. */
  exact?: { toDate?: number; percent?: number; balance?: number; retainage?: number }
  /** The rate column I was figured at, so a row can say why it holds what it holds. */
  rate: number
  /** Column F on the previous application: what was sitting in storage a month ago. */
  storedBefore: number
  /**
   * What left storage this period. Material that is no longer stored should have been
   * installed, so this is the figure column E has to account for.
   */
  released: number
  /**
   * Material left storage without the work being billed. Either the contractor installed it
   * and forgot to bill it, or it is no longer on site — both worth asking about.
   */
  storedUnaccounted: boolean
}

export interface Figures {
  lines: LineFigures[]
  /** The G703 grand total row. */
  totals: {
    scheduled: number
    previous: number
    thisPeriod: number
    stored: number
    toDate: number
    percent: number
    balance: number
    retainage: number
    /** The totals of rounded columns as the exact figures would have made them. */
    exact?: { toDate?: number; percent?: number; balance?: number; retainage?: number }
  }
  /** The nine numbered lines of a G702. */
  g702: {
    originalSum: number          // 1
    changeOrders: number         // 2
    contractSum: number          // 3
    completedAndStored: number   // 4
    retainageWork: number        // 5a
    retainageStored: number      // 5b
    retainageTotal: number       // 5
    earnedLessRetainage: number  // 6
    previousCertificates: number // 7
    due: number                  // 8
    balanceToFinish: number      // 9
  }
  /** The rates this application was figured at, after any milestone step. */
  rates: { work: number; stored: number; steppedTo: number | null }
  /** The block at the foot of a G702: what the change orders have added and taken away. */
  changeOrderSummary: {
    previousAdditions: number
    previousDeductions: number
    thisAdditions: number
    thisDeductions: number
    totalAdditions: number
    totalDeductions: number
    net: number
  }
}

/**
 * The rate in force once the job has reached a given percentage.
 *
 * Steps are written as "from this much complete, this rate", so the one that applies is the
 * highest threshold the job has passed. A job not yet past any of them keeps the contract's
 * own rate.
 */
export function rateAt(percentComplete: number, base: number, steps: RetainageStep[]): { rate: number; stepped: number | null } {
  let rate = base
  let stepped: number | null = null
  for (const s of [...steps].sort((a, b) => a.at_percent - b.at_percent)) {
    if (percentComplete >= s.at_percent) { rate = s.rate; stepped = s.at_percent }
  }
  return { rate, stepped }
}

/**
 * Every figure on one application.
 *
 * `earlier` is every application before this one, each with what it billed, which is what
 * column D is: the sum of all previous periods. Working it out rather than carrying a typed
 * figure forward is what makes a missed month show up instead of quietly vanishing.
 */
export function figure(
  contract: Contract,
  lines: SovLine[],
  application: Application,
  billed: Map<string, Billed>,
  earlier: { billed: Map<string, Billed>; period_to?: string }[],
  steps: RetainageStep[] = [],
): Figures {
  /**
   * A change order the owner approved after this application closed is not on this
   * application: its value is not in the contract sum, and its line is not on the sheet. An
   * undated one is taken to predate the applications, which is how a schedule entered before
   * anybody filled in approval dates keeps working.
   */
  const onThisApplication = (l: SovLine): boolean =>
    !l.change_order_id || !l.approved_on || l.approved_on <= application.period_to
  const real = lines.filter((l) => !l.is_heading && onThisApplication(l))
  const way = contract.rounding ?? {}
  const asG = (n: number) => roundAs(n, way.G)
  const asI = (n: number) => roundAs(n, way.I)

  const previousOf = (id: string) => sum(earlier.map((a) => a.billed.get(id)?.this_period ?? 0))

  // The contract sum, and what the job is worth now: a change order becomes a line of the
  // schedule, so the two are the same sum counted once.
  const scheduled = sum(real.map((l) => l.scheduled_value))
  const changeOrders = sum(real.filter((l) => l.change_order_id).map((l) => l.scheduled_value))

  // Retainage steps are judged on the job as a whole, so the completion has to be known before
  // any line's retainage can be.
  const completedAndStored = sum(real.map((l) => {
    const b = billed.get(l.id)
    return asG(previousOf(l.id) + (b?.this_period ?? 0) + (b?.stored ?? 0))
  }))
  const percentComplete = scheduled > 0 ? (completedAndStored / scheduled) * 100 : 0

  const baseWork = application.retainage_work ?? contract.retainage_work
  const { rate: workRate, stepped } = rateAt(percentComplete, baseWork, steps)
  const storedRate = application.retainage_stored ?? contract.retainage_stored

  // What the line looked like a month ago, so the sheet can say whether stored material is
  // still in storage or has gone into the work.
  const last = earlier[earlier.length - 1]

  const figured: LineFigures[] = real.map((l) => {
    const b = billed.get(l.id)
    const previous = previousOf(l.id)
    const thisPeriod = round(b?.this_period ?? 0)
    const stored = round(b?.stored ?? 0)
    const storedBefore = round(last?.billed.get(l.id)?.stored ?? 0)
    const released = round(Math.max(0, storedBefore - stored))
    const exactToDate = round(previous + thisPeriod + stored)
    const toDate = asG(exactToDate)
    // A line held at its own rate ignores the step: that is what "variable rate" means.
    const rate = l.retainage_rate ?? workRate
    const exactPercent = l.scheduled_value > 0 ? (exactToDate / l.scheduled_value) * 100 : 0
    const exactBalance = round(l.scheduled_value - exactToDate)
    // Column I: the rate on work completed, and the stored rate on what is only stored.
    const exactRetainage = round(((previous + thisPeriod) * rate) / 100 + (stored * storedRate) / 100)
    const pct = roundAs(l.scheduled_value > 0 ? (toDate / l.scheduled_value) * 100 : 0, way.pct)
    const balance = roundAs(round(l.scheduled_value - toDate), way.H)
    const retainage = asI(exactRetainage)
    const exact: NonNullable<LineFigures['exact']> = {}
    if (way.G && toDate !== exactToDate) exact.toDate = exactToDate
    if (way.pct && Math.abs(pct - exactPercent) > 1e-9) exact.percent = exactPercent
    if ((way.H || way.G) && balance !== exactBalance) exact.balance = exactBalance
    if (way.I && retainage !== exactRetainage) exact.retainage = exactRetainage
    return {
      line: l,
      previous, thisPeriod, stored, toDate,
      storedBefore, released,
      storedUnaccounted: released > thisPeriod + 0.005,
      percent: pct,
      balance,
      retainage,
      rate,
      ...(Object.keys(exact).length ? { exact } : {}),
    }
  })

  const totals = {
    scheduled,
    previous: sum(figured.map((f) => f.previous)),
    thisPeriod: sum(figured.map((f) => f.thisPeriod)),
    stored: sum(figured.map((f) => f.stored)),
    toDate: sum(figured.map((f) => f.toDate)),
    percent: scheduled > 0 ? (completedAndStored / scheduled) * 100 : 0,
    balance: sum(figured.map((f) => f.balance)),
    retainage: sum(figured.map((f) => f.retainage)),
  }
  {
    const ex = (k: 'toDate' | 'balance' | 'retainage') => sum(figured.map((f) => f.exact?.[k] ?? f[k]))
    const exact: NonNullable<Figures['totals']['exact']> = {}
    if (figured.some((f) => f.exact?.toDate != null)) exact.toDate = ex('toDate')
    if (figured.some((f) => f.exact?.balance != null)) exact.balance = ex('balance')
    if (figured.some((f) => f.exact?.retainage != null)) exact.retainage = ex('retainage')
    if (exact.toDate != null && scheduled > 0) exact.percent = (exact.toDate / scheduled) * 100
    if (Object.keys(exact).length) (totals as Figures['totals']).exact = exact
  }

  /**
   * Line 7, worked out rather than carried forward.
   *
   * It is what the previous application earned less what was retained on it, which means
   * running the same arithmetic against that application's own figures and its own rate. A
   * month that was never entered shows up here as a gap instead of quietly vanishing, which is
   * the whole reason not to type this number in.
   */
  const earnedLessRetainageAt = (upTo: number): number => {
    if (upTo < 0) return 0
    const before = earlier.slice(0, upTo)
    const a = earlier[upTo]
    const earned = sum(real.map((l) => {
      const b = a.billed.get(l.id)
      const prior = sum(before.map((x) => x.billed.get(l.id)?.this_period ?? 0))
      return asG(prior + (b?.this_period ?? 0) + (b?.stored ?? 0))
    }))
    const pct = scheduled > 0 ? (earned / scheduled) * 100 : 0
    const { rate } = rateAt(pct, baseWork, steps)
    const held = sum(real.map((l) => {
      const b = a.billed.get(l.id)
      const prior = sum(before.map((x) => x.billed.get(l.id)?.this_period ?? 0))
      const r = l.retainage_rate ?? rate
      if (way.I) return asI((prior + (b?.this_period ?? 0)) * r / 100 + (b?.stored ?? 0) * storedRate / 100)
      return round((prior + (b?.this_period ?? 0)) * r / 100) + round((b?.stored ?? 0) * storedRate / 100)
    }))
    return round(earned - held)
  }
  const lastCertificate = earnedLessRetainageAt(earlier.length - 1)

  // A rounded column I is rounded line by line, as the sheet does; the stored part is rounded on
  // its own and the work part is whatever the rounded line leaves.
  const retainageStored = sum(figured.map((f) => (way.I ? asI : round)((f.stored * storedRate) / 100)))
  const retainageWork = way.I
    ? round(totals.retainage - retainageStored)
    : sum(figured.map((f) => round(((f.previous + f.thisPeriod) * f.rate) / 100)))
  const retainageTotal = round(retainageWork + retainageStored)
  const earnedLessRetainage = round(totals.toDate - retainageTotal)

  /**
   * The change order summary at the foot of a G702.
   *
   * A change order counts as "this month" when the owner approved it inside this application's
   * period — that is, after the previous application closed. A line with no approval date on
   * it is taken to predate the applications, so it sits in the previous column from the second
   * application on.
   */
  const closedLast = last?.period_to ?? null
  const coLines = real.filter((l) => l.change_order_id)   // already cut to this application
  const inThisPeriod = (l: SovLine): boolean => {
    if (!closedLast) return true
    if (!l.approved_on) return false
    return l.approved_on > closedLast && l.approved_on <= application.period_to
  }
  const add = (ls: SovLine[]) => sum(ls.filter((l) => l.scheduled_value > 0).map((l) => l.scheduled_value))
  const take = (ls: SovLine[]) => round(-sum(ls.filter((l) => l.scheduled_value < 0).map((l) => l.scheduled_value)))
  const soFar = coLines
  const thisMonth = soFar.filter(inThisPeriod)
  const before = soFar.filter((l) => !inThisPeriod(l))
  const changeOrderSummary = {
    previousAdditions: add(before),
    previousDeductions: take(before),
    thisAdditions: add(thisMonth),
    thisDeductions: take(thisMonth),
    totalAdditions: add(soFar),
    totalDeductions: take(soFar),
    net: round(add(soFar) - take(soFar)),
  }

  return {
    lines: figured,
    totals,
    g702: {
      originalSum: round(contract.original_sum),
      changeOrders,
      contractSum: round(contract.original_sum + changeOrders),
      completedAndStored: totals.toDate,
      retainageWork,
      retainageStored,
      retainageTotal,
      earnedLessRetainage,
      previousCertificates: lastCertificate,
      due: round(earnedLessRetainage - lastCertificate),
      balanceToFinish: round(round(contract.original_sum + changeOrders) - earnedLessRetainage),
    },
    rates: { work: workRate, stored: storedRate, steppedTo: stepped },
    changeOrderSummary,
  }
}

/**
 * What is left in it for each trade.
 *
 * The question a summary has to answer is not how much has been paid but how much a
 * subcontractor still stands to collect — the balance to finish plus everything held back on
 * what they have already done. That is the number that decides whether somebody comes back to
 * finish, and it is on no AIA form.
 */
export interface TradeStanding {
  line: SovLine
  scheduled: number
  toDate: number
  percent: number
  balance: number
  retainageHeld: number
  /** Balance to finish plus retainage held: everything still owed on this line. */
  outstanding: number
}

export function standings(figures: Figures): TradeStanding[] {
  return figures.lines.map((f) => ({
    line: f.line,
    scheduled: f.line.scheduled_value,
    toDate: f.toDate,
    percent: f.percent,
    balance: f.balance,
    retainageHeld: f.retainage,
    outstanding: round(f.balance + f.retainage),
  }))
}
