import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { captionOf, layOut, type SheetBox } from '../photoSheet'
import { PAGE_H, PAGE_W } from './types'
import { safe, wrap } from './render'

/**
 * The photo table that goes behind a field report.
 *
 * Laid out by `photoSheet`, which is also what the dialog's preview is drawn from, so what was
 * looked at before issuing is what prints.
 */

export interface PagePhoto {
  id: string
  /** A JPEG, already cropped to what should print. */
  bytes: Uint8Array
  width: number
  height: number
  label: string
}

/** The page the table is set on, in points. Shared with the preview. */
export const SHEET = { margin: 40, head: 34, pad: 5, size: 7.5, line: 9.5 }
export const sheetRoom = () => ({ width: PAGE_W - 2 * SHEET.margin, height: PAGE_H - 2 * SHEET.margin - SHEET.head })

export async function appendPhotoPages(report: Uint8Array, photos: PagePhoto[], opts: {
  perRow: number
  /** What the pages are headed with, beside "Site photos": the project, and the day. */
  project: string
  day: string
}): Promise<Uint8Array> {
  if (!photos.length) return report
  const doc = await PDFDocument.load(report)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.13, 0.14, 0.15), muted = rgb(0.4, 0.42, 0.44), rule = rgb(0.72, 0.72, 0.7)

  const byId = new Map(photos.map((p) => [p.id, p]))
  // Numbers are not known until the layout is, and captions wrap by their numbers; "00" is as
  // wide as any number the table will hold.
  const text = (n: number, id: string) => safe(captionOf(n, byId.get(id)?.label ?? ''))
  const { boxes, pages } = layOut(
    photos.map((p) => ({ id: p.id, ratio: p.width / p.height })),
    {
      ...sheetRoom(), perRow: opts.perRow, pad: SHEET.pad, line: SHEET.line,
      lines: (id, width) => Math.max(1, wrap(text(0, id), font, SHEET.size, width).length),
    },
  )

  const images = new Map<string, Awaited<ReturnType<typeof doc.embedJpg>>>()
  for (const p of photos) images.set(p.id, await doc.embedJpg(p.bytes))

  const top = SHEET.margin + SHEET.head
  for (let at = 0; at < pages; at++) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    const y0 = PAGE_H - SHEET.margin
    page.drawText('SITE PHOTOS', { x: SHEET.margin, y: y0 - 11, size: 11, font: bold, color: ink })
    const right = safe([opts.project, opts.day, pages > 1 ? `Photos ${at + 1} of ${pages}` : ''].filter(Boolean).join('  ·  '))
    page.drawText(right, { x: PAGE_W - SHEET.margin - font.widthOfTextAtSize(right, 8), y: y0 - 10, size: 8, font, color: muted })
    page.drawLine({ start: { x: SHEET.margin, y: y0 - 20 }, end: { x: PAGE_W - SHEET.margin, y: y0 - 20 }, thickness: 0.75, color: ink })

    for (const b of boxes.filter((x: SheetBox) => x.page === at)) {
      const X = SHEET.margin + b.x, Y = PAGE_H - top - b.y
      page.drawRectangle({ x: X, y: Y - b.h, width: b.w, height: b.h, borderColor: rule, borderWidth: 0.5 })
      const img = images.get(b.id)
      if (img) page.drawImage(img, { x: SHEET.margin + b.px, y: PAGE_H - top - b.py - b.ph, width: b.pw, height: b.ph })
      const lines = wrap(text(b.n, b.id), font, SHEET.size, b.pw)
      lines.forEach((l, i) => {
        const w = font.widthOfTextAtSize(l, SHEET.size)
        page.drawText(l, {
          x: SHEET.margin + b.px + (b.pw - w) / 2,
          y: PAGE_H - top - b.cy - SHEET.size - i * SHEET.line,
          size: SHEET.size, font: i === 0 && lines.length === 1 ? font : font, color: ink,
        })
      })
    }
  }
  return doc.save()
}
