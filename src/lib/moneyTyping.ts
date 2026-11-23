/** Dollar figures as they are typed: see `components/MoneyInput`. */

/** The number in whatever was typed or pasted: digits, one point, two places, a leading minus. */
export function clean(t: string): string {
  const neg = /^\s*[-(]/.test(t)
  let s = t.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  s = s.replace(/^0+(?=\d)/, '')
  return s ? (neg ? '-' : '') + s : neg ? '-' : ''
}

export const bare = (v: string | number | null | undefined): string =>
  v == null || v === '' ? '' : typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '') : clean(v)

/** As it is being typed: commas in, the point and cents as far as they've gone. */
export function asTyped(raw: string): string {
  if (!raw) return ''
  if (raw === '-') return '-$'
  const neg = raw.startsWith('-')
  const [int, dec] = raw.replace('-', '').split('.')
  const body = (int ? Number(int).toLocaleString('en-US') : '0') + (dec != null ? `.${dec}` : '')
  return `${neg ? '-' : ''}$${body}`
}

/** Left alone: always two places. */
export function asDollars(raw: string): string {
  const n = Number(raw)
  if (!raw || raw === '-' || !Number.isFinite(n)) return ''
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Cents filled out to two places once the box is left. */
export function whole(raw: string): string {
  const n = Number(raw)
  if (!raw || raw === '-' || !Number.isFinite(n)) return ''
  return n.toFixed(2)
}

