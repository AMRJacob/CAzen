/**
 * How numbers read.
 *
 * A column of $0.00 is a column of nothing said eight times. A zero is better shown as an
 * absence than as a quantity, and cents that are always .00 are two characters of noise on
 * every line of a schedule of values. So: nothing is a dash, whole dollars carry no cents,
 * and only a figure that genuinely has cents shows them.
 *
 * Alignment is kept by `moneyParts`, which hands back the cents separately so a cell can pad
 * a whole-dollar figure with an invisible ".00" and keep the decimal points in a line.
 */

/** What an absent figure looks like. An em dash, not a zero. */
export const NOTHING = '—'

/** Under half a cent is nothing, and so is anything that isn't a number. */
const isNothing = (n: number): boolean => !Number.isFinite(n) || Math.abs(n) < 0.005

export function money(n: number): string {
  if (isNothing(n)) return NOTHING
  // Round to cents first, so a figure that rounds to a whole dollar is treated as one.
  const cents = Math.round(n * 100)
  const places = cents % 100 === 0 ? 0 : 2
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })
}

/** The same figure, split at the decimal point so a table can line the points up. */
export function moneyParts(n: number): { whole: string; cents: string | null } {
  const s = money(n)
  const dot = s.indexOf('.')
  return dot < 0 ? { whole: s, cents: null } : { whole: s.slice(0, dot), cents: s.slice(dot) }
}

/**
 * A percentage with no more decimals than it needs: 100%, 19.35%, 7.5%, and nothing at all
 * for nothing at all.
 */
export function percent(n: number): string {
  if (isNothing(n)) return NOTHING
  const r = Math.round(n * 100) / 100
  const s = Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '')
  return `${s}%`
}

/** A percentage rounded to whole numbers, for the places that only want the gist. */
export function roughPercent(n: number): string {
  return isNothing(n) ? NOTHING : `${Math.round(n)}%`
}
