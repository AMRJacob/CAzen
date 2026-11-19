import { getDocument } from './pdfjs'
import { pageBody, readPageText } from './pageText'

/**
 * The lines of text on a schedule PDF, however it was made.
 *
 * A schedule printed to PDF carries its words, and those are simply read. A scanned one is a
 * photograph of a page: each page is drawn at about 250 dots an inch and read by Tesseract, in
 * the browser, on this computer — the file goes nowhere. The reader is a few megabytes and is
 * fetched only when a scan is actually opened.
 */

export interface ScheduleText {
  lines: string[]
  pages: number
  /** How many of those pages had no words of their own and were read from the picture. */
  scanned: number
}

const MAX_PAGES = 40
const base = () => new URL('./ocr/', document.baseURI).href

type Reader = { recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> }

async function reader(): Promise<Reader> {
  const { createWorker } = await import('tesseract.js')
  // The built app serves the reader's own files; a development server falls back to the
  // library's defaults.
  const own = import.meta.env.PROD
    ? { workerPath: `${base()}worker.min.js`, corePath: `${base()}core`, langPath: `${base()}lang`, workerBlobURL: false }
    : {}
  const worker = await createWorker('eng', 1, own)
  // A schedule is a table: rows of sparse text with wide gaps, not paragraphs.
  await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' })
  return worker as unknown as Reader
}

export async function scheduleText(
  bytes: Uint8Array,
  onProgress: (p: { page: number; pages: number; reading: boolean }) => void = () => {},
): Promise<ScheduleText> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  let ocr: Reader | null = null
  try {
    const pages = Math.min(pdf.numPages, MAX_PAGES)
    const lines: string[] = []
    let scanned = 0
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n)
      const text = await readPageText(page)
      // A scan sometimes carries a stamp or a page number as real text; a handful of words is
      // not a schedule.
      if (text.words.length >= 12) {
        onProgress({ page: n, pages, reading: false })
        lines.push(...pageBody(text).split('\n'))
        continue
      }
      onProgress({ page: n, pages, reading: true })
      scanned++
      const one = page.getViewport({ scale: 1 })
      // 250 dpi, held under about 16 megapixels so a 36 × 24 sheet doesn't exhaust a tablet.
      const scale = Math.min(250 / 72, Math.sqrt(16e6 / (one.width * one.height)))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      ocr ??= await reader()
      const { data } = await ocr.recognize(canvas)
      lines.push(...data.text.split('\n'))
      canvas.width = canvas.height = 0
    }
    return { lines, pages, scanned }
  } finally {
    await ocr?.terminate().catch(() => {})
    await pdf.loadingTask.destroy()
  }
}
