/**
 * A schedule of values, as it arrives: copied out of the contractor's spreadsheet or their PDF.
 *
 * Nobody types a schedule of values. It exists already, in a G703 or an Excel sheet, and the
 * quickest honest way in is to paste it. From a spreadsheet the columns come separated by tabs;
 * from a PDF they come as runs of spaces with the money last. Both are read the same way: the
 * last thing on the line that is money is the value, a short leading token is the item number,
 * and what is between them is the description. A line with words and no money is a heading.
 */

export interface PastedLine {
  item_no: string | null
  description: string
  scheduled_value: number
  is_heading: boolean
}

/** "$1,234.50", "(500.00)", "1234" — or null when it isn't an amount. */
export function money(text: string): number | null {
  const t = text.trim()
  if (!/^\(?-?\$?\s?\d[\d,]*(\.\d{1,2})?\)?$/.test(t) && !/^\(?-?\$?\s?\.\d{1,2}\)?$/.test(t)) return null
  const negative = t.startsWith('(') || t.includes('-')
  const n = Number(t.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

const ITEM = /^(\d{1,4}[A-Za-z]?(\.\d{1,3})*|[A-Za-z]{1,2}-?\d{1,4}|\d{2}\s\d{2}\s\d{2})\.?$/

export function readSov(text: string): PastedLine[] {
  const out: PastedLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/ /g, ' ').trim()
    if (!line) continue
    // Tabs from a spreadsheet; otherwise two or more spaces, which is what a PDF's columns become.
    let cells = (line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/)).map((c) => c.trim()).filter(Boolean)
    if (!cells.length) continue

    // A G703 carries more money columns after the scheduled value (previous, this period…). The
    // scheduled value is the first of them, so the first money cell after any words is taken.
    let item: string | null = null
    if (cells.length > 1 && ITEM.test(cells[0])) { item = cells[0].replace(/\.$/, ''); cells = cells.slice(1) }
    else {
      // No separate number column: an item number may lead the description.
      const m = cells[0].match(/^(\d{1,4}[A-Za-z]?(?:\.\d{1,3})*)[.)]?\s+(\D.*)$/)
      if (m && item === null) { item = m[1]; cells = [m[2], ...cells.slice(1)] }
    }

    const words: string[] = []
    let value: number | null = null
    for (const c of cells) {
      const n = money(c)
      if (n !== null && words.length) { value = n; break }
      if (n === null) words.push(c)
      else if (!words.length && item === null) item = c // a bare number before any words is the item
    }
    // From a PDF with single spaces: the money is the tail of the last word run.
    if (value === null && words.length) {
      const m = words[words.length - 1].match(/^(.*\S)\s+(\(?-?\$?\s?\d[\d,]*(?:\.\d{2})\)?)$/)
      if (m) { words[words.length - 1] = m[1]; value = money(m[2]) }
    }
    const description = words.join(' ').trim()
    if (!description) continue
    // The column headings and the total row of the form itself are not lines of the schedule.
    if (/^(item\s*(no\.?|number)?|description( of work)?|scheduled value|grand total|totals?|subtotal)\b/i.test(description) && (value === null || /total/i.test(description))) continue
    out.push({ item_no: item, description, scheduled_value: value ?? 0, is_heading: value === null })
  }
  return out
}

export const sovTotal = (lines: PastedLine[]) =>
  Math.round(lines.reduce((n, l) => n + (l.is_heading ? 0 : l.scheduled_value), 0) * 100) / 100
