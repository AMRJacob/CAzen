import { getDocument } from './pdfjs'
import { readPageText } from './pageText'
import { reader, type Reader } from './scheduleText'
import { readTable, type PlacedWord, type TableRead } from '../payTable'

/**
 * A contractor's application for payment, read as a table — from the words the PDF carries where
 * it carries good ones, and from the picture of the page where it does not.
 *
 * An exported PDF has its words and they are simply used. A scan either has none, or has the
 * scanner's own guess at them, which may be good (the Westrock applications' are) or not. So the
 * words the file has are tried first and judged by the sheet's own checks — every column adding up
 * to its grand total, no line number missing. If they do not pass, the pages are read from the
 * picture here, and whichever reading passes more of the checks is used.
 *
 * Before a page's picture is read, the table's ruled lines are taken out of it. A rule touching
 * the end of a figure is what makes the reader lose decimal points and read 0.00 as "ooo]"; with
 * the rules gone, a scan that read as nonsense reads clean.
 */

const MAX_PAGES = 40
const DPI = 300

export interface PayText {
  table: TableRead
  pages: number
  /** Pages read from the picture. */
  scanned: number
}

const score = (t: TableRead) =>
  t.totals.filter((x) => x.agree).length * 5 - t.totals.filter((x) => !x.agree).length * 3
  - t.rows.filter((r) => r.doubt).length - t.missing.length * 2 + t.rows.filter((r) => r.kind === 'line').length * 0.1
const passes = (t: TableRead) =>
  t.pages > 0 && t.missing.length === 0 && !t.rows.some((r) => r.doubt) &&
  (t.totals.length ? t.totals.every((x) => x.agree) : true)

export async function payText(
  bytes: Uint8Array,
  onProgress: (p: { page: number; pages: number; reading: boolean }) => void = () => {},
): Promise<PayText> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  let ocr: Reader | null = null
  try {
    const pages = Math.min(pdf.numPages, MAX_PAGES)
    const own: (PlacedWord[] | null)[] = []
    for (let n = 1; n <= pages; n++) {
      onProgress({ page: n, pages, reading: false })
      const text = await readPageText(await pdf.getPage(n))
      const words = text.words.filter((w) => !w.vertical)
      own.push(words.length >= 12
        ? words.map((w) => ({ text: w.str, x: w.x * text.width, y: w.y * text.height, w: w.w * text.width, h: w.h * text.height }))
        : null)
    }
    const fromOwn = readTable(own.map((w) => w ?? []))
    if (passes(fromOwn) && own.every(Boolean)) return { table: fromOwn, pages, scanned: 0 }

    // Read the pictures: every page if the file's own words did not pass, otherwise only the
    // pages that had none. Stop after the page with the grand total — what follows is lien
    // waivers and insurance certificates.
    const seen: (PlacedWord[] | null)[] = [...own]
    let scanned = 0
    const all = !passes(fromOwn)
    for (let n = 1; n <= pages; n++) {
      if (!all && own[n - 1]) continue
      onProgress({ page: n, pages, reading: true })
      const page = await pdf.getPage(n)
      const one = page.getViewport({ scale: 1 })
      const scale = Math.min(DPI / 72, Math.sqrt(16e6 / (one.width * one.height)))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      removeRules(ctx, canvas.width, canvas.height, scale * 72)
      ocr ??= await reader()
      const { data } = await ocr.recognize(canvas, {}, { text: true, blocks: true })
      canvas.width = canvas.height = 0
      scanned++
      seen[n - 1] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
        .filter((w) => w.text.trim())
        .map((w) => ({ text: w.text.trim(), x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, conf: w.confidence }))
      const so_far = readTable(seen.slice(0, n).map((w) => w ?? []))
      if (so_far.pages > 0 && so_far.rows.some((r) => r.kind === 'total')) break
    }
    const fromPicture = readTable(seen.map((w) => w ?? []))
    ;(globalThis as { __payText?: unknown }).__payText = { fromOwn, fromPicture, seen }
    const table = score(fromPicture) >= score(fromOwn) ? fromPicture : fromOwn
    return { table, pages, scanned }
  } finally {
    await ocr?.terminate().catch(() => {})
    await pdf.loadingTask.destroy()
  }
}

/**
 * Take a table's ruled lines out of a page's picture: runs of dark pixels far longer than any
 * letter is tall — across the page for the row rules, down it for the column rules.
 */
export function removeRules(ctx: CanvasRenderingContext2D, w: number, h: number, dpi: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  const dark = new Uint8Array(w * h)
  for (let i = 0, j = 0; j < dark.length; i += 4, j++) dark[j] = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) < 150 ? 1 : 0
  const rule = new Uint8Array(w * h)
  const across = Math.round(dpi * 0.6), down = Math.round(dpi * 0.28)
  for (let y = 0; y < h; y++) {
    let start = -1
    for (let x = 0; x <= w; x++) {
      const d = x < w && dark[y * w + x]
      if (d && start < 0) start = x
      else if (!d && start >= 0) { if (x - start >= across) rule.fill(1, y * w + start, y * w + x); start = -1 }
    }
  }
  for (let x = 0; x < w; x++) {
    let start = -1
    for (let y = 0; y <= h; y++) {
      const d = y < h && dark[y * w + x]
      if (d && start < 0) start = y
      else if (!d && start >= 0) { if (y - start >= down) for (let k = start; k < y; k++) rule[k * w + x] = 1; start = -1 }
    }
  }
  // A pixel either side as well: a scanned rule's edge is grey.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = y * w + x
    if (rule[j] || (x && rule[j - 1] === 1) || (x < w - 1 && rule[j + 1] === 1) || (y && rule[j - w] === 1) || (y < h - 1 && rule[j + w] === 1)) {
      const i = j * 4
      if (!rule[j]) rule[j] = 2
      px[i] = px[i + 1] = px[i + 2] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Take colour out of a page's picture: what a schedule prints is black and grey, so a strongly
 * coloured pixel is a pen or highlighter note made on the sheet, or a bar of the chart — neither
 * of which is the table's text.
 */
export function dropColour(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > 70) px[i] = px[i + 1] = px[i + 2] = 255
  }
  ctx.putImageData(img, 0, 0)
}
