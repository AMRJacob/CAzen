/**
 * The submittal register, worked out from the project's submittal entries.
 *
 * No table of its own. A submittal is an entry among the project's issued documents (kind
 * `submittal_cover`): one with no file is a submittal that has come in and not gone back yet;
 * one with a file is the returned package with its transmittal. Where it stands is read from
 * the dates and the action in its values — the same values the transmittal prints — so the
 * register and the paper cannot disagree.
 *
 * Dependency-free, so it can be checked on its own (`checks/submittals.test.ts`).
 */
export interface Entry {
  id: string
  number: string | null
  title: string | null
  values: Record<string, string>
  file_path: string | null
  issued_at: string
}

export type Standing = 'received' | 'with_consultant' | 'back_from_consultant' | 'returned'
export const STANDING_WORD: Record<Standing, string> = {
  received: 'In review', with_consultant: 'With consultant', back_from_consultant: 'Back from consultant', returned: 'Returned',
}
/** Days a submittal may be out before it is called late. A common contract figure; a constant so it can change. */
export const REVIEW_DAYS = 14

export interface Row extends Entry {
  standing: Standing
  /** "09 30 00 - 001" without any R1. */
  base: string
  /** 0 for the original, 1 for R1… */
  round: number
  section: string | null
  received: string | null      // ISO days
  forwarded: string | null
  back: string | null
  returned: string | null
  consultant: string
  action: string
  /** Days from received to returned, or to today while it is out. */
  days: number | null
  late: boolean
  /** Sent back for another go and no later round has come in. */
  awaitingResubmittal: boolean
}

/** "02/04/2026" or "2026-02-04" → "2026-02-04"; anything else → null. */
export function isoDay(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}
export const usDay = (iso: string | null) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}` }
const dayNumber = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000) }
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

export function splitNumber(number: string | null): { base: string; round: number } {
  const n = (number ?? '').trim()
  const m = n.match(/^(.*?)[\s-]*R(\d+)\s*$/i)
  return m ? { base: m[1].trim(), round: Number(m[2]) } : { base: n, round: 0 }
}
const sectionOf = (number: string) => { const m = number.match(/^\s*(\d{2})[\s.]?(\d{2})[\s.]?(\d{2})/); return m ? `${m[1]} ${m[2]} ${m[3]}` : null }

export const needsResubmittal = (action: string) => action === 'revise_resubmit' || action === 'rejected'

export function standingOf(e: Entry): Standing {
  if (e.file_path || e.values['sub.state'] === 'returned') return 'returned'
  if (isoDay(e.values['sub.from_consultant'])) return 'back_from_consultant'
  if (isoDay(e.values['sub.to_consultant'])) return 'with_consultant'
  return 'received'
}

/** Every submittal, in register order: by number, each original followed by its resubmittals. */
export function register(entries: Entry[], today: string): Row[] {
  const rows: Row[] = entries.map((e) => {
    const { base, round } = splitNumber(e.number)
    const standing = standingOf(e)
    const received = isoDay(e.values['sub.received']) ?? e.issued_at.slice(0, 10)
    const returned = standing === 'returned' ? (isoDay(e.values['sub.returned']) ?? e.issued_at.slice(0, 10)) : null
    const days = received ? Math.max(0, daysBetween(received, returned ?? today)) : null
    return {
      ...e, standing, base, round, section: sectionOf(base), received, returned,
      forwarded: isoDay(e.values['sub.to_consultant']), back: isoDay(e.values['sub.from_consultant']),
      consultant: (e.values['sub.consultant'] ?? '').trim(),
      action: standing === 'returned' ? (e.values['sub.action'] ?? '') : '',
      days, late: standing !== 'returned' && days != null && days > REVIEW_DAYS, awaitingResubmittal: false,
    }
  })
  const top = new Map<string, number>()
  for (const r of rows) top.set(r.base, Math.max(top.get(r.base) ?? 0, r.round))
  for (const r of rows) r.awaitingResubmittal = r.standing === 'returned' && needsResubmittal(r.action) && r.round === top.get(r.base)
  return rows.sort((a, b) => a.base.localeCompare(b.base, undefined, { numeric: true }) || a.round - b.round)
}

export function totals(rows: Row[]) {
  const open = rows.filter((r) => r.standing !== 'returned')
  return {
    all: rows.length,
    open: open.length,
    withConsultant: open.filter((r) => r.standing === 'with_consultant').length,
    late: open.filter((r) => r.late).length,
    awaitingResubmittal: rows.filter((r) => r.awaitingResubmittal).length,
  }
}

/** The number a resubmittal of this one would carry. */
export function resubmittalNumber(row: { base: string }, rows: { base: string; round: number }[]): string {
  const last = Math.max(0, ...rows.filter((r) => r.base === row.base).map((r) => r.round))
  return `${row.base} R${last + 1}`
}
