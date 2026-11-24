/**
 * Phone numbers written with hyphens as they are typed (Jacob, 11/24: site-wide). US numbers:
 * 501-555-0123; seven digits 555-0123; a leading 1 kept as 1-501-555-0123. Anything after the
 * number — " x204", " ext. 12" — is left as typed. A number starting with + (international) is
 * left alone. No imports, so it can be checked on its own (checks/phone.test.ts).
 */
export function formatPhone(raw: string): string {
  if (/^\s*\+/.test(raw)) return raw
  // The number is the digits before any extension; what follows is kept as it was typed.
  const m = /^([\d\s().-]*)(.*)$/.exec(raw)!
  const head = m[1], rest = m[2]
  let d = head.replace(/\D/g, '')
  if (!d) return raw
  let one = ''
  if (d.length > 10 && d[0] === '1') { one = '1-'; d = d.slice(1) }
  const tail = d.slice(10) // more digits than a number holds: kept on the end
  d = d.slice(0, 10)
  const parts = d.length <= 7 && !one
    ? [d.slice(0, 3), d.slice(3)]
    : [d.slice(0, 3), d.slice(3, 6), d.slice(6)]
  const body = one + parts.filter(Boolean).join('-') + tail
  // A space typed after the digits (before "x204") is kept.
  return body + (/\s$/.test(head) ? ' ' : '') + rest
}

/** Where the caret belongs after formatting: after the same number of digits as before it. */
export function caretAfter(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++
    if (seen === digitsBefore) return i + 1
  }
  return formatted.length
}

/** Whether a form field holds a phone number, by its key or label. */
export const isPhoneField = (key: string, label = '') => /phone|tel\b|fax|contact[ _]?(#|no|number)/i.test(`${key} ${label}`)
