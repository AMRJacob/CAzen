import type { Figures } from './payapps'
import type { PdfLine } from './payRead'
import type { G702Key, G702Read } from './payTable'

/** What was read off the contractor's application, kept on the application (migration 0048). */
export interface PdfRead {
  file?: string
  read_at: string
  application?: string
  g702?: G702Read
  total?: PdfLine
  lines: Record<string, PdfLine>
}

export type PdfCol = keyof PdfLine
export interface Discrepancy {
  where: 'g702' | 'line' | 'total'
  lineId?: string
  label: string
  col: PdfCol | G702Key
  pdf: number
  app: number
}

export const COL_SAYS: Record<PdfCol, string> = {
  C: 'scheduled value', D: 'from previous', E: 'this period', F: 'stored', G: 'completed and stored',
  pct: '% complete', H: 'balance to finish', I: 'retainage',
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
  for (const [k, v] of Object.entries(pdf.g702 ?? {}) as [G702Key, number][]) {
    if (v != null && !agrees(k, v, g[k])) out.push({ where: 'g702', label: G702_SAYS[k], col: k, pdf: v, app: g[k] })
  }
  for (const f of figures.lines) {
    const p = pdf.lines[f.line.id]
    if (!p) continue
    const o = ours(f)
    for (const [c, v] of Object.entries(p) as [PdfCol, number][]) {
      if (v != null && !agrees(c, v, o[c])) out.push({ where: 'line', lineId: f.line.id, label: [f.line.item_no, f.line.description].filter(Boolean).join(' '), col: c, pdf: v, app: o[c] })
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
