/**
 * Today, where the person is.
 *
 * `new Date().toISOString()` is UTC, so from six in the evening in Little Rock onwards it
 * already says tomorrow — which is exactly when an addendum goes out. An issue date or a file
 * name a day ahead of the job is the kind of wrong nobody notices until it is quoted back.
 */
export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A stored date — "2026-03-19" — written the way it is read here.
 *
 * `new Date('2026-03-19')` is midnight UTC, which in Little Rock is the evening before, so
 * parsing a date-only string and formatting it is a reliable way to be a day out. These are
 * just three numbers in a string; treat them as such.
 */
export function usDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${m}/${d}/${y}` : iso
}
