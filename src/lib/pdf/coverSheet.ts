import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'

export type SubmittalAction =
  | 'no_exceptions'
  | 'exceptions_noted'
  | 'revise_resubmit'
  | 'rejected'
  | 'for_record'

export const ACTION_LABELS: Record<SubmittalAction, string> = {
  no_exceptions: 'No Exceptions Taken',
  exceptions_noted: 'Make Corrections Noted',
  revise_resubmit: 'Revise and Resubmit',
  rejected: 'Rejected',
  for_record: 'Received for Record Only',
}

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

/**
 * Build the submittal cover sheet. If an AMR letterhead PDF is supplied, its first
 * page is drawn underneath as the background, so the firm's branding is exact.
 * Field positions are for 8.5x11; move them in one place when the real letterhead arrives.
 */
export async function buildSubmittalCover(
  data: CoverSheetData,
  letterhead?: ArrayBuffer,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  if (letterhead) {
    const [bg] = await doc.embedPdf(letterhead, [0])
    page.drawPage(bg, { x: 0, y: 0, width: 612, height: 792 })
  } else {
    page.drawText('AMR ARCHITECTS', { x: 54, y: 740, size: 16, font: bold })
    page.drawText('[ letterhead placeholder — add templates/letterhead.pdf ]', {
      x: 54, y: 724, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    })
  }

  page.drawText('SUBMITTAL REVIEW', { x: 54, y: 680, size: 14, font: bold })

  const rows: [string, string][] = [
    ['Project', `${data.projectName} (${data.projectNumber})`],
    ['Contractor', data.contractor],
    ['Submittal No.', data.submittalNumber],
    ['Description', data.title],
    ['Spec Section', data.specSection],
    ['Received', data.receivedOn],
    ['Returned', data.returnedOn],
    ['Reviewed by', data.reviewer],
  ]
  let y = 648
  for (const [label, value] of rows) {
    page.drawText(label, { x: 54, y, size: 10, font: bold })
    page.drawText(value || '—', { x: 160, y, size: 10, font })
    y -= 20
  }

  // Action stamp: every option printed, the chosen one checked.
  y -= 12
  page.drawText('ACTION', { x: 54, y, size: 11, font: bold })
  y -= 22
  for (const [key, label] of Object.entries(ACTION_LABELS) as [SubmittalAction, string][]) {
    page.drawRectangle({ x: 54, y: y - 2, width: 11, height: 11, borderWidth: 1, borderColor: rgb(0, 0, 0) })
    if (key === data.action) page.drawText('X', { x: 56.5, y: y, size: 10, font: bold })
    page.drawText(label, { x: 74, y, size: 10, font })
    y -= 18
  }

  y -= 12
  page.drawText('COMMENTS', { x: 54, y, size: 11, font: bold })
  y -= 18
  drawWrapped(page, data.comments || 'None.', 54, y, 504, 10, font)

  page.drawText(
    'Review is for general conformance with the design concept and the contract documents. ' +
      'The Contractor remains responsible for dimensions, quantities, and coordination.',
    { x: 54, y: 60, size: 7, font, color: rgb(0.35, 0.35, 0.35), maxWidth: 504, lineHeight: 9 },
  )

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

function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxWidth: number, size: number, font: PDFFont) {
  const words = text.split(/\s+/)
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y, size, font })
      y -= size + 4
      line = word
    } else {
      line = test
    }
  }
  if (line) page.drawText(line, { x, y, size, font })
}
