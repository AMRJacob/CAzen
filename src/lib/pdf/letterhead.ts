import { rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import type { Brand } from '../brand'

export const PAGE = { width: 612, height: 792, margin: 54 }

export interface Fonts { regular: PDFFont; bold: PDFFont }

export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export const INK = rgb(0.13, 0.14, 0.15)
export const MUTED = rgb(0.42, 0.44, 0.46)

/**
 * Draw the firm's letterhead on a page and return the y where body content may start.
 * With an uploaded letterhead PDF, that PDF is the background and nothing else is drawn,
 * so the firm's own design is reproduced exactly. Otherwise a clean header is built from
 * the logo, name, address and accent colour.
 */
export async function drawLetterhead(doc: PDFDocument, page: PDFPage, brand: Brand, fonts: Fonts): Promise<number> {
  const { width, height, margin } = PAGE

  if (brand.letterhead) {
    const [bg] = await doc.embedPdf(brand.letterhead, [0])
    page.drawPage(bg, { x: 0, y: 0, width, height })
    return height - 150 // leave room for the firm's printed header
  }

  const accent = hexToRgb(brand.accent)
  let textX = margin
  const top = height - margin

  if (brand.logo) {
    const img = brand.logo.type === 'png' ? await doc.embedPng(brand.logo.bytes) : await doc.embedJpg(brand.logo.bytes)
    const h = 44
    const w = Math.min(160, (img.width / img.height) * h)
    page.drawImage(img, { x: margin, y: top - h, width: w, height: h })
    textX = margin + w + 16
  }

  page.drawText(brand.firmName, { x: textX, y: top - 14, size: 14, font: fonts.bold, color: INK })
  let y = top - 28
  for (const line of brand.addressLines) {
    page.drawText(line, { x: textX, y, size: 8.5, font: fonts.regular, color: MUTED })
    y -= 11
  }
  if (brand.contactLine) {
    page.drawText(brand.contactLine, { x: textX, y, size: 8.5, font: fonts.regular, color: MUTED })
    y -= 11
  }

  const ruleY = Math.min(y, top - 50) - 8
  page.drawRectangle({ x: margin, y: ruleY, width: width - margin * 2, height: 1.5, color: accent })
  return ruleY - 28
}

/** Footer: optional firm wording on the left, licence text on the right. */
export function drawFooter(page: PDFPage, brand: Brand, fonts: Fonts, footer = '') {
  const { width, margin } = PAGE
  if (footer) page.drawText(footer, { x: margin, y: 30, size: 7, font: fonts.regular, color: MUTED, maxWidth: 300 })
  if (brand.licenseText) {
    const w = fonts.regular.widthOfTextAtSize(brand.licenseText, 7)
    page.drawText(brand.licenseText, { x: width - margin - w, y: 30, size: 7, font: fonts.regular, color: MUTED })
  }
}

/** Draw text wrapped to maxWidth; returns the y after the last line. */
export function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxWidth: number, size: number, font: PDFFont, color = INK, lineGap = 4) {
  for (const para of text.split(/\n/)) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        page.drawText(line, { x, y, size, font, color })
        y -= size + lineGap
        line = word
      } else {
        line = test
      }
    }
    if (line) page.drawText(line, { x, y, size, font, color })
    y -= size + lineGap
  }
  return y
}
