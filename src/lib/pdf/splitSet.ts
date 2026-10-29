import { PDFDocument } from 'pdf-lib'
import { getDocument } from './pdfjs'

export interface SplitSheet {
  pageIndex: number
  /** Best guess from the titleblock text layer; null when the page is a scan. */
  detectedNumber: string | null
  bytes: Uint8Array
}

// Matches A-201, A201, A2.01, S-101A, FP-1, M1.1 — common US sheet numbering.
const SHEET_NUMBER = /^[A-Z]{1,3}-?\d{1,3}(\.\d{1,3})?[A-Z]?$/

/**
 * Split a combined drawing-set PDF into one PDF per page and guess each sheet number.
 * The guess prefers matches in the lower-right of the page, where the titleblock
 * number normally sits. The user confirms or corrects every guess before saving.
 */
export async function splitDrawingSet(file: ArrayBuffer): Promise<SplitSheet[]> {
  const source = await PDFDocument.load(file)
  const reader = await getDocument({ data: new Uint8Array(file.slice(0)) }).promise
  const out: SplitSheet[] = []

  for (let i = 0; i < source.getPageCount(); i++) {
    const single = await PDFDocument.create()
    const [page] = await single.copyPages(source, [i])
    single.addPage(page)

    out.push({
      pageIndex: i,
      detectedNumber: await detectSheetNumber(reader, i + 1),
      bytes: await single.save(),
    })
  }
  return out
}

async function detectSheetNumber(
  reader: Awaited<ReturnType<typeof getDocument>['promise']>,
  pageNumber: number,
): Promise<string | null> {
  const page = await reader.getPage(pageNumber)
  const { width, height } = page.getViewport({ scale: 1 })
  const text = await page.getTextContent()

  let best: { value: string; score: number } | null = null
  for (const item of text.items) {
    if (!('str' in item)) continue
    const value = item.str.trim().toUpperCase()
    if (!SHEET_NUMBER.test(value)) continue
    const [, , , , x, y] = item.transform as number[]
    // Score: right-ness + low-ness (PDF y grows upward) + font size.
    const fontSize = Math.abs((item.transform as number[])[3])
    const score = x / width + (1 - y / height) + fontSize / 50
    if (!best || score > best.score) best = { value, score }
  }
  return best?.value ?? null
}

/** Discipline letter(s) from a sheet number: "A-201" → "A", "FP-1" → "FP". */
export function disciplineOf(sheetNumber: string): string {
  return sheetNumber.match(/^[A-Z]+/)?.[0] ?? ''
}
