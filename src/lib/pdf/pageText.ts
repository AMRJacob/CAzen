import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * The words on a page, positioned as the sheet is displayed (after any page rotation),
 * as fractions of the page: x/y from the top-left, 0–1. Fractions let a title block
 * template drawn on one sheet apply to every sheet of the same layout, at any size.
 */
export interface PageWord {
  str: string
  x: number
  y: number
  w: number
  h: number
  /** Text runs up or down the page rather than across it. */
  vertical: boolean
}

export interface PageText {
  /** Displayed size in points. */
  width: number
  height: number
  words: PageWord[]
}

export async function readPageText(page: PDFPageProxy): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const words: PageWord[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const [a, b, c, d, e, f] = item.transform as number[]
    const along = Math.hypot(a, b) || 1
    const up = Math.hypot(c, d) || 1
    const dx = a / along, dy = b / along          // baseline direction
    const ux = c / up, uy = d / up                // glyph "up" direction
    const width = item.width || along * item.str.length * 0.5
    const height = item.height || up
    // The run's four corners in PDF space, mapped to the displayed page.
    const corners = [
      [e, f],
      [e + dx * width, f + dy * width],
      [e + ux * height, f + uy * height],
      [e + dx * width + ux * height, f + dy * width + uy * height],
    ].map(([x, y]) => vp.convertToViewportPoint(x, y))
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    // Direction of the baseline on screen decides vertical text.
    const [sx0, sy0] = vp.convertToViewportPoint(e, f)
    const [sx1, sy1] = vp.convertToViewportPoint(e + dx, f + dy)
    const vertical = Math.abs(sy1 - sy0) > Math.abs(sx1 - sx0)
    words.push({ str: item.str, x: x0 / vp.width, y: y0 / vp.height, w: (x1 - x0) / vp.width, h: (y1 - y0) / vp.height, vertical })
  }
  return { width: vp.width, height: vp.height, words }
}

export interface Region { x: number; y: number; w: number; h: number }

/** Words whose centre falls inside the region, joined in reading order (lines top to bottom). */
export function textInRegion(text: PageText, r: Region): string {
  return joinWords(wordsInRegion(text, r), text)
}

export function wordsInRegion(text: PageText, r: Region): PageWord[] {
  return text.words.filter((w) => {
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
  })
}

/** All the words on the page as plain text, line by line (for search). */
export function pageBody(text: PageText): string {
  return joinWords(text.words, text, '\n')
}

function joinWords(words: PageWord[], text: PageText, lineSep = ' '): string {
  if (!words.length) return ''
  const W = text.width, H = text.height
  // Mostly vertical text (a title block turned sideways, reading bottom to top): swap the axes.
  const vertical = words.filter((w) => w.vertical).length > words.length / 2
  // In points: `a` runs across lines, `b` along a line; `len` is the run's length, `thick` its height.
  const items = words.map((w) => vertical
    ? { str: w.str, a: w.x * W, b: (1 - w.y - w.h) * H, len: w.h * H, thick: w.w * W }
    : { str: w.str, a: w.y * H, b: w.x * W, len: w.w * W, thick: w.h * H })
  items.sort((p, q) => p.a - q.a || p.b - q.b)
  const lines: (typeof items)[] = []
  for (const it of items) {
    const line = lines[lines.length - 1]
    const ref = line?.[0]
    if (ref && Math.abs(it.a + it.thick / 2 - (ref.a + ref.thick / 2)) < Math.max(ref.thick, it.thick) * 0.6) line.push(it)
    else lines.push([it])
  }
  return lines
    .map((line) => {
      line.sort((p, q) => p.b - q.b)
      let out = ''
      let end = -Infinity
      for (const it of line) {
        if (out && it.b - end > it.thick * 0.2 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' '
        out += it.str
        end = it.b + it.len
      }
      return out.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
    .join(lineSep)
}
