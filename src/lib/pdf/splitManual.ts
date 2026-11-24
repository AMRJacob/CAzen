import { PDFDocument } from 'pdf-lib'
import { getDocument } from './pdfjs'
import { pageBody, readPageText, unreadableText } from './pageText'
import type { ManualPage } from './specRead'
import type { Reader } from './scheduleText'

export * from './specRead'

/** Read every page of a manual. Nothing is decided here and nothing is written. */
export async function readManual(
  file: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
  /**
   * Read pages that have no text from their picture (OCR): a section that was printed, signed
   * and scanned, or a whole manual that only exists as a scan. Left out, such pages carry no
   * number and are folded into whatever section came before them.
   */
  scans?: { onPage?: (page: number, total: number) => void },
): Promise<ManualPage[]> {
  const reader = await getDocument({ data: new Uint8Array(file.slice(0)) }).promise
  const pages: ManualPage[] = []
  let ocr: Reader | null = null
  try {
    for (let i = 0; i < reader.numPages; i++) {
      const page = await reader.getPage(i + 1)
      let text = await readPageText(page)
      if (scans && (!text.words.length || unreadableText(text)) && Math.max(text.width, text.height) <= 14.5 * 72) {
        scans.onPage?.(i + 1, reader.numPages)
        try {
          const { scanReader, scannedPageText } = await import('./scanText')
          ocr ??= await scanReader()
          text = await scannedPageText(page, ocr)
        } catch { /* left without words, as before */ }
      }
      pages.push({ index: i, text, found: null, declares: false, at: null, of: null, ends: false })
      onProgress?.(i + 1, reader.numPages)
    }
  } finally {
    await ocr?.terminate().catch(() => {})
    await reader.loadingTask.destroy()
  }
  return pages
}

/** Cut the pages of one section out of the uploaded PDF. */
export async function cutSection(file: ArrayBuffer, pages: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(file, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const copied = await out.copyPages(source, pages)
  for (const p of copied) out.addPage(p)
  return out.save()
}

/** The words of a section, for searching it. */
export const bodyOf = (pages: ManualPage[]) => pages.map((p) => pageBody(p.text)).join('\n')

