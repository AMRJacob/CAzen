import { getDocument } from './pdfjs'
import { pageBody, readPageText } from './pageText'
import { linesByNumber, type PlacedWord } from '../scheduleRows'
import type { ScheduleLine } from '../scheduleRead'

/**
 * The lines of text on a schedule PDF, however it was made.
 *
 * A schedule printed to PDF carries its words, and those are simply read. A scanned one is a
 * photograph of a page: each page is drawn at about 250 dots an inch and read by Tesseract, in
 * the browser, on this computer — the file goes nowhere. The reader is a few megabytes and is
 * fetched only when a scan is actually opened.
 */

export interface ScheduleText {
  /** Rows found by their line numbers where the page has them; plain lines where it has not. */
  lines: ScheduleLine[]
  /** How many pages were read by their line numbers. */
  numbered: number
  pages: number
  /** How many of those pages had no words of their own and were read from the picture. */
  scanned: number
}

const MAX_PAGES = 40
const base = () => new URL('./ocr/', document.baseURI).href

interface OcrWord { text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
interface OcrData { text: string; blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null }
type Reader = {
  recognize: (image: HTMLCanvasElement, options?: object, output?: object) => Promise<{ data: OcrData }>
  terminate: () => Promise<unknown>
}

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
  onProgress: (p: { page: number; pages: number; reading: boolean; row?: number; rows?: number }) => void = () => {},
): Promise<ScheduleText> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  let ocr: Reader | null = null
  try {
    const pages = Math.min(pdf.numPages, MAX_PAGES)
    const lines: ScheduleLine[] = []
    let scanned = 0, numbered = 0
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n)
      const text = await readPageText(page)
      // A scan sometimes carries a stamp or a page number as real text; a handful of words is
      // not a schedule.
      if (text.words.length >= 12) {
        onProgress({ page: n, pages, reading: false })
        // A printed PDF keeps its words in runs; a run that starts with the row's number is
        // split so the number can stand in its column.
        const placed: PlacedWord[] = text.words.filter((w) => !w.vertical).flatMap((w) => {
          const m = w.str.match(/^(\s*\d{1,4})(\s+)(\S.*)$/)
          if (!m) return [{ text: w.str.trim(), x: w.x, y: w.y, w: w.w, h: w.h }]
          const cut = w.w * (m[1].length + m[2].length) / w.str.length
          return [{ text: m[1].trim(), x: w.x, y: w.y, w: w.w * m[1].length / w.str.length, h: w.h }, { text: m[3].trim(), x: w.x + cut, y: w.y, w: w.w - cut, h: w.h }]
        })
        const rows = linesByNumber(placed, 1)
        if (rows) { numbered++; lines.push(...rows) } else lines.push(...pageBody(text).split('\n'))
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
      const { data } = await ocr.recognize(canvas, {}, { text: true, blocks: true })
      const placed: PlacedWord[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
        .filter((w) => w.text.trim())
        .map((w) => ({ text: w.text.trim(), x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, conf: w.confidence }))
      const rows = placed.length ? linesByNumber(placed, canvas.width) : null
      // Left where a check can read it: what the reader saw, and the rows made of it.
      ;(globalThis as { __schedule?: unknown }).__schedule = { width: canvas.width, height: canvas.height, placed, rows, text: data.text }
      if (rows) {
        numbered++
        lines.push(...rows)
      } else lines.push(...data.text.split('\n'))
      canvas.width = canvas.height = 0
    }
    return { lines, pages, scanned, numbered }
  } finally {
    await ocr?.terminate().catch(() => {})
    await pdf.loadingTask.destroy()
  }
}
