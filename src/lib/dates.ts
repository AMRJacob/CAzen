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
