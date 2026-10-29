import { PDFDocument, rgb } from 'pdf-lib'
import { DEFAULT_WORDING, PLACEHOLDER_BRAND, type Brand, type SubmittalWording } from '../brand'
import { drawFooter, drawLetterhead, drawWrapped, embedFonts, hexToRgb, INK, MUTED, PAGE } from './letterhead'

export type SubmittalAction = keyof SubmittalWording['actions']

/** Labels for UI dropdowns before a firm's wording has loaded. */
export const ACTION_LABELS = DEFAULT_WORDING.submittal_cover.actions

export interface CoverSheetData {
  projectName: string
  projectNumber: string
  contractor: string
  submittalNumber: string   // 08 71 00-001.1
  title: string
  specSection: string
  receivedOn: string
  returnedOn: string
  action: SubmittalAction
  comments: string
  reviewer: string
}

/** Build the submittal cover sheet on the firm's letterhead, with the firm's own stamp wording. */
export async function buildSubmittalCover(
  data: CoverSheetData,
  brand: Brand = PLACEHOLDER_BRAND,
  wording: SubmittalWording = DEFAULT_WORDING.submittal_cover,
  footer = '',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE.width, PAGE.height])
  const fonts = await embedFonts(doc)
  const accent = hexToRgb(brand.accent)
  const { margin, width } = PAGE

  let y = await drawLetterhead(doc, page, brand, fonts)

  page.drawText(wording.title.toUpperCase(), { x: margin, y, size: 13, font: fonts.bold, color: INK })
  y -= 30

  const rows: [string, string][] = [
    ['Project', [data.projectName, data.projectNumber && `(${data.projectNumber})`].filter(Boolean).join(' ')],
    ['Contractor', data.contractor],
    ['Submittal No.', data.submittalNumber],
    ['Description', data.title],
    ['Spec Section', data.specSection],
    ['Received', data.receivedOn],
    ['Returned', data.returnedOn],
    ['Reviewed by', data.reviewer],
  ]
  for (const [label, value] of rows) {
    page.drawText(label, { x: margin, y, size: 9, font: fonts.bold, color: MUTED })
    page.drawText(value || '—', { x: margin + 100, y, size: 10, font: fonts.regular, color: INK })
    y -= 18
  }

  // Action stamp: every option printed, the chosen one marked in the firm's colour.
  y -= 14
  const boxTop = y + 14
  const actions = Object.entries(wording.actions) as [SubmittalAction, string][]
  const boxHeight = 26 + actions.length * 18
  page.drawRectangle({ x: margin, y: boxTop - boxHeight, width: 260, height: boxHeight, borderColor: accent, borderWidth: 1.25 })
  page.drawText('ACTION', { x: margin + 12, y: y - 2, size: 9, font: fonts.bold, color: accent })
  y -= 22
  for (const [key, label] of actions) {
    page.drawRectangle({ x: margin + 12, y: y - 2, width: 10, height: 10, borderWidth: 1, borderColor: INK })
    if (key === data.action) {
      page.drawRectangle({ x: margin + 14, y: y, width: 6, height: 6, color: accent })
    }
    page.drawText(label, { x: margin + 30, y, size: 10, font: key === data.action ? fonts.bold : fonts.regular, color: INK })
    y -= 18
  }

  y = boxTop - boxHeight - 26
  page.drawText('COMMENTS', { x: margin, y, size: 9, font: fonts.bold, color: MUTED })
  y -= 16
  drawWrapped(page, data.comments || 'None.', margin, y, width - margin * 2, 10, fonts.regular)

  drawWrapped(page, wording.disclaimer, margin, 64, width - margin * 2, 7, fonts.regular, rgb(0.4, 0.4, 0.4), 2.5)
  drawFooter(page, brand, fonts, footer)

  return doc.save()
}

/** Cover sheet first, then the contractor's submittal as received. */
export async function attachCoverToSubmittal(cover: Uint8Array, received: ArrayBuffer): Promise<Uint8Array> {
  const out = await PDFDocument.load(cover)
  const src = await PDFDocument.load(received)
  const pages = await out.copyPages(src, src.getPageIndices())
  pages.forEach((p) => out.addPage(p))
  return out.save()
}
