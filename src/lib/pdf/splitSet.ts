import { PDFDocument } from 'pdf-lib'
import { getDocument } from './pdfjs'
import { readPageText, unreadableText, type PageText } from './pageText'
import type { Reader } from './scheduleText'

export interface SplitSheet {
  pageIndex: number
  /** The page's words, positioned as displayed; empty when the page is a scan. */
  text: PageText
  bytes: Uint8Array
}

/** Split a combined drawing-set PDF into one PDF per page, keeping each page's text for reading the title block. */
export async function splitDrawingSet(
  file: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
  /**
   * Read letter- and legal-size pages that have no text from their picture (OCR) — a scanned
   * spec section or cover in a change document. Drawings are left alone: a scanned sheet's
   * number is read by its title block template, and reading a 36 × 24 sheet would take long.
   */
  scans?: { onPage?: (page: number, total: number) => void },
): Promise<SplitSheet[]> {
  const source = await PDFDocument.load(file, { ignoreEncryption: true })
  const reader = await getDocument({ data: new Uint8Array(file.slice(0)) }).promise
  const out: SplitSheet[] = []
  const total = source.getPageCount()
  let ocr: Reader | null = null

  for (let i = 0; i < total; i++) {
    const single = await PDFDocument.create()
    const [page] = await single.copyPages(source, [i])
    single.addPage(page)
    const pdfPage = await reader.getPage(i + 1)
    let text = await readPageText(pdfPage)
    if (scans && (!text.words.length || unreadableText(text)) && Math.max(text.width, text.height) <= 14.5 * 72) {
      scans.onPage?.(i + 1, total)
      try {
        const { scanReader, scannedPageText } = await import('./scanText')
        ocr ??= await scanReader()
        text = await scannedPageText(pdfPage, ocr)
      } catch { /* left without words, as before: it can still be sorted and numbered by hand */ }
    }
    out.push({ pageIndex: i, text, bytes: await single.save() })
    onProgress?.(i + 1, total)
  }
  await ocr?.terminate().catch(() => {})
  await reader.loadingTask.destroy()
  return out
}
