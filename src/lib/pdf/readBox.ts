import { getDocument } from './pdfjs'
import { readPageText } from './pageText'
import { reader } from './scheduleText'
import { figure, type FigureAt } from '../payTable'

/**
 * The figure inside a box drawn on a page of a PDF, for putting right one the reader got wrong
 * ($8 for $8,000,000.00). The PDF's own words are used where it has them; a scan is read from
 * the picture of just the box, drawn large.
 */
/**
 * The figures in a run of text: pieces that each read as a whole figure with cents are separate
 * figures; otherwise the pieces are one figure the reader broke up ("$8" ",000,000.00").
 */
function figuresIn(pieces: string[]): number[] {
  const whole = pieces.map((t) => ({ t, f: figure(t) })).filter((x) => x.f && !x.f.pct && /[.,]\d\d\)?$/.test(x.t))
  if (whole.length >= 2) return whole.map((x) => x.f!.n)
  const f = figure(pieces.join(''))
  return f && !f.pct ? [f.n] : []
}

export async function readBox(bytes: Uint8Array, at: FigureAt): Promise<{ n: number | null; text: string; options?: number[] }> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  try {
    const page = await pdf.getPage(at.page)
    // The PDF's own words: those whose middle is inside the box.
    const own = await readPageText(page)
    const inside = own.words.filter((w) => {
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2
      return cx >= at.x && cx <= at.x + at.w && cy >= at.y && cy <= at.y + at.h
    })
    if (inside.length) {
      const sorted = inside.sort((a, b) => a.x - b.x)
      const text = sorted.map((w) => w.str).join(' ')
      const found = figuresIn(sorted.flatMap((w) => w.str.split(/\s+/)).filter(Boolean))
      if (found.length === 1) return { n: found[0], text }
      if (found.length > 1) return { n: null, text, options: found }
    }
    // The picture: the box with a little room around it, at a size the reader reads well.
    const one = page.getViewport({ scale: 1 })
    const scale = Math.min(600 / 72, 4000 / Math.max(1, at.w * one.width))
    const vp = page.getViewport({ scale })
    const pad = 0.004
    const x0 = Math.max(0, (at.x - pad) * vp.width), y0 = Math.max(0, (at.y - pad) * vp.height)
    const w = Math.min(vp.width - x0, (at.w + 2 * pad) * vp.width), h = Math.min(vp.height - y0, (at.h + 2 * pad) * vp.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h))
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -x0, -y0] }).promise
    // One line of text.
    const ocr = await reader('7')
    try {
      const { data } = await ocr.recognize(canvas)
      const found = figuresIn(data.text.split(/\s+/).filter(Boolean))
      return found.length === 1 ? { n: found[0], text: data.text.trim() } : { n: null, text: data.text.trim(), ...(found.length > 1 ? { options: found } : {}) }
    } finally {
      await ocr.terminate().catch(() => {})
      canvas.width = canvas.height = 0
    }
  } finally {
    await pdf.loadingTask.destroy()
  }
}
