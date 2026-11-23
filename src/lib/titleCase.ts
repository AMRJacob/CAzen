/**
 * Headings and menu labels in title case: the first letter of each important word capitalised,
 * short joining words left small unless they lead. Letters already capitalised are kept, so
 * ASI, RFI and CCD stay as they are.
 */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via', 'with'])

export function titleCase(s: string): string {
  let first = true
  return s.replace(/[A-Za-z][\w'’]*/g, (w, at: number) => {
    const lead = first || /[:—–]\s*$/.test(s.slice(0, at))
    first = false
    if (!lead && SMALL.has(w.toLowerCase())) return w.toLowerCase()
    return w[0].toUpperCase() + w.slice(1)
  })
}
