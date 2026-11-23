import type { PDFPageProxy } from 'pdfjs-dist'
import type { PageText, PageWord } from './pageText'
import { reader, type Reader } from './scheduleText'

/**
 * The words of a scanned page, read from its picture.
 *
 * Addenda are often put together from whatever each consultant sent, and a reissued spec
 * section printed, signed and scanned has no text at all — to CAzen it was a blank page, so it
 * could only be filed as a drawing with no number. Read here, the page carries its words where
 * they sit, as a PDF's own text would, so its running footer, heading and END OF SECTION are read
 * by exactly the same rules as a page that was never printed.
 *
 * Each line the reader finds becomes one run of text — as a PDF writes "SECTION 230923" or
 * "236416 - 6" in one piece — because the section reader looks for the number and its page
 * inside a run. Tested at 150 dpi on a scanned addendum, every footer of 24 pages read right.
 */

interface OcrLine { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }
interface OcrBlocks { blocks?: { paragraphs: { lines: OcrLine[] }[] }[] | null }

/** One reader for a run of pages: it is a few megabytes and is fetched only when a scan is met. */
export const scanReader = (): Promise<Reader> => reader('3')

export async function scannedPageText(page: PDFPageProxy, ocr: Reader, dpi = 160): Promise<PageText> {
  const one = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: dpi / 72 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  try {
    const { data } = await ocr.recognize(canvas, {}, { blocks: true })
    const lines = ((data as OcrBlocks).blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    const W = canvas.width, H = canvas.height
    const words: PageWord[] = lines
      .map((l) => ({ str: l.text.replace(/\s+/g, ' ').trim(), b: l.bbox }))
      .filter((l) => l.str)
      .map(({ str, b }) => ({ str, x: b.x0 / W, y: b.y0 / H, w: (b.x1 - b.x0) / W, h: (b.y1 - b.y0) / H, vertical: false }))
    return { width: one.width, height: one.height, words, scanned: true }
  } finally {
    canvas.width = canvas.height = 0
  }
}
