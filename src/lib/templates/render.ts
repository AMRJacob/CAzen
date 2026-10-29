import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import type { Brand } from '../brand'
import {
  DEFAULT_CONTINUATION, PAGE_H, PAGE_W,
  type Align, type ChoicesEl, type ColorRole, type El, type FieldEl, type Layout, type TableEl, type TextEl,
} from './types'

interface Fonts { sans: PDFFont; sansBold: PDFFont; serif: PDFFont; serifBold: PDFFont }

interface Ctx {
  page: PDFPage
  fonts: Fonts
  colors: Record<ColorRole, RGB>
  tint: RGB
  wash: RGB
  logo?: PDFImage
  value: (key: string) => string
}

export interface RenderInput {
  layout: Layout
  letterhead: Layout | null   // shared letterhead; null when editing the letterhead itself
  brand: Brand
  values: Record<string, string>
}

export const LINE_HEIGHT = 1.3

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** The standard PDF fonts only cover Latin-1 plus a few typographic marks. */
function safe(s: string) {
  return s
    .replace(/\t/g, '    ')
    .replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…•\n]/g, '?')
}

const fontFor = (f: Fonts, serif?: boolean, bold?: boolean) =>
  serif ? (bold ? f.serifBold : f.serif) : (bold ? f.sansBold : f.sans)

/** Word-wrap one paragraph-set of text to a width. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of safe(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    let line = ''
    for (const word of para.split(/ +/)) {
      const test = line ? `${line} ${word}` : word
      if (line && font.widthOfTextAtSize(test, size) > width) {
        out.push(line)
        line = word
      } else line = test
    }
    out.push(line)
  }
  return out
}

// ---------- Rich (outline) text: numbered / bulleted lists with nesting and headings ----------

export interface RichLine { text: string; bold: boolean; indent: number; marker?: string; markerX?: number }

const MARKER = /^(\d+[.)]|[a-zA-Z][.)]|[-•*])\s+/

export function richLines(text: string, fonts: Fonts, size: number, width: number, serif?: boolean): RichLine[] {
  const regular = fontFor(fonts, serif, false)
  const bold = fontFor(fonts, serif, true)
  const step = size * 1.9
  const out: RichLine[] = []
  for (const raw of safe(text).split('\n')) {
    if (!raw.trim()) { out.push({ text: '', bold: false, indent: 0 }); continue }
    const spaces = raw.match(/^ */)![0].length
    const level = Math.min(5, Math.floor(spaces / 2))
    let body = raw.trim()
    let isBold = false
    if (body.startsWith('# ')) {
      body = body.slice(2)
      isBold = true
      if (out.length && out[out.length - 1].text !== '') out.push({ text: '', bold: false, indent: 0 })
    } else if (/^\*\*.*\*\*$/.test(body)) {
      body = body.slice(2, -2)
      isBold = true
    }
    const m = body.match(MARKER)
    const font = isBold ? bold : regular
    const base = level * step
    let marker: string | undefined
    let textIndent = base
    if (m) {
      marker = m[1].replace('*', '•').replace(/^-$/, '•')
      body = body.slice(m[0].length)
      textIndent = base + Math.max(step, font.widthOfTextAtSize(marker, size) + size * 0.6)
    }
    const lines = wrap(body, font, size, Math.max(40, width - textIndent))
    lines.forEach((t, i) => out.push({ text: t, bold: isBold, indent: textIndent, ...(i === 0 && marker ? { marker, markerX: base } : {}) }))
  }
  return out
}

// ---------- Drawing primitives ----------

const pdfY = (yTop: number) => PAGE_H - yTop

function alignedX(font: PDFFont, s: string, size: number, x: number, w: number, align: Align) {
  if (align === 'left') return x
  const tw = font.widthOfTextAtSize(s, size)
  return align === 'center' ? x + (w - tw) / 2 : x + w - tw
}

/** Draw wrapped text inside a box (top-left x/y), clipping with "…" if it doesn't fit. */
function drawBlock(c: Ctx, text: string, x: number, y: number, w: number, h: number, size: number, font: PDFFont, color: RGB, align: Align) {
  const lh = size * LINE_HEIGHT
  const max = Math.max(1, Math.floor((h + size * 0.3) / lh))
  let lines = wrap(text, font, size, w)
  if (lines.length > max) {
    lines = lines.slice(0, max)
    let last = lines[max - 1]
    while (last && font.widthOfTextAtSize(last + '…', size) > w) last = last.slice(0, -1)
    lines[max - 1] = last + '…'
  }
  lines.forEach((line, i) => {
    if (!line) return
    c.page.drawText(line, { x: alignedX(font, line, size, x, w, align), y: pdfY(y + size * 0.9 + i * lh), size, font, color })
  })
}

function drawText(c: Ctx, el: TextEl) {
  const font = fontFor(c.fonts, el.serif, el.bold)
  drawBlock(c, el.caps ? el.text.toUpperCase() : el.text, el.x, el.y, el.w, el.h, el.size, font, c.colors[el.color], el.align)
}

function fieldParts(el: FieldEl) {
  const gap = 6
  if (el.labelMode === 'left' && el.label) return { vx: el.x + el.labelWidth + gap, vy: el.y, vw: el.w - el.labelWidth - gap, vh: el.h }
  if (el.labelMode === 'above' && el.label) { const lh = el.size * LINE_HEIGHT; return { vx: el.x, vy: el.y + lh, vw: el.w, vh: el.h - lh } }
  return { vx: el.x, vy: el.y, vw: el.w, vh: el.h }
}

function drawFieldLabel(c: Ctx, el: FieldEl) {
  if (el.labelMode === 'none' || !el.label) return
  const font = fontFor(c.fonts, el.serif, false)
  const w = el.labelMode === 'left' ? el.labelWidth : el.w
  const s = safe(el.label)
  c.page.drawText(s, { x: alignedX(font, s, el.size, el.x, w, el.labelMode === 'left' ? el.labelAlign : 'left'), y: pdfY(el.y + el.size * 0.9), size: el.size, font, color: c.colors.muted })
}

function drawField(c: Ctx, el: FieldEl, flowSlice?: RichLine[]) {
  drawFieldLabel(c, el)
  const { vx, vy, vw, vh } = fieldParts(el)
  const font = fontFor(c.fonts, el.serif, el.bold)
  const color = c.colors[el.color]
  if (flowSlice) return drawRich(c, flowSlice, vx, vy, el)
  const value = c.value(el.field)
  if (!value) return
  if (el.rich) {
    const lines = richLines(value, c.fonts, el.size, vw, el.serif)
    const max = Math.floor((vh + el.size * 0.3) / (el.size * LINE_HEIGHT))
    return drawRich(c, lines.slice(0, max), vx, vy, el)
  }
  drawBlock(c, value, vx, vy, vw, vh, el.size, font, color, el.align)
}

function drawRich(c: Ctx, lines: RichLine[], x: number, y: number, el: FieldEl) {
  const lh = el.size * LINE_HEIGHT
  lines.forEach((l, i) => {
    const baseline = pdfY(y + el.size * 0.9 + i * lh)
    const font = fontFor(c.fonts, el.serif, l.bold || el.bold)
    if (l.marker) c.page.drawText(l.marker, { x: x + (l.markerX ?? 0), y: baseline, size: el.size, font, color: c.colors[el.color] })
    if (l.text) c.page.drawText(l.text, { x: x + l.indent, y: baseline, size: el.size, font, color: c.colors[el.color] })
  })
}

function tick(c: Ctx, x: number, yTop: number, s: number, on: boolean) {
  c.page.drawRectangle({ x, y: pdfY(yTop + s), width: s, height: s, borderWidth: 0.8, borderColor: c.colors.ink })
  if (on) c.page.drawRectangle({ x: x + s * 0.2, y: pdfY(yTop + s * 0.8), width: s * 0.6, height: s * 0.6, color: c.colors.accent })
}

/** Height a choices element needs, used by both the PDF and the editor. */
export function choiceRowHeights(el: ChoicesEl, measure: (t: string, size: number, w: number) => number) {
  const s = el.size
  return el.options.map((o) => s * 1.5 + (o.note ? measure(o.note, s * 0.85, el.w - s * 2.2) * s * 0.85 * LINE_HEIGHT + s * 0.4 : 0))
}

function drawChoices(c: Ctx, el: ChoicesEl) {
  const s = el.size
  const chosen = c.value(el.field)
  const regular = c.fonts.sans
  const bold = c.fonts.sansBold
  if (el.direction === 'horizontal') {
    const colW = el.w / Math.max(1, el.options.length)
    el.options.forEach((o, i) => {
      const x = el.x + i * colW
      tick(c, x, el.y, s, o.value === chosen)
      c.page.drawText(safe(o.label), { x: x + s * 1.6, y: pdfY(el.y + s * 0.85), size: s, font: o.value === chosen ? bold : regular, color: c.colors.ink })
    })
    return
  }
  const heights = choiceRowHeights(el, (t, size, w) => wrap(t, regular, size, w).length)
  let y = el.y
  el.options.forEach((o, i) => {
    tick(c, el.x, y, s, o.value === chosen)
    c.page.drawText(safe(o.label), { x: el.x + s * 1.6, y: pdfY(y + s * 0.85), size: s, font: o.value === chosen ? bold : regular, color: c.colors.ink })
    if (o.note) {
      wrap(o.note, regular, s * 0.85, el.w - s * 2.2).forEach((line, j) => {
        c.page.drawText(line, { x: el.x + s * 2.2, y: pdfY(y + s * 1.5 + s * 0.85 * (0.9 + j * LINE_HEIGHT)), size: s * 0.85, font: regular, color: c.colors.muted })
      })
    }
    y += heights[i]
  })
}

export function tableRows(value: string) {
  return value.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => r.split(/\s*[|\t]\s*/))
}

function drawTable(c: Ctx, el: TableEl) {
  const s = el.size
  const rh = s * 1.55
  const total = el.columns.reduce((a, col) => a + col.width, 0) || 1
  const scale = Math.min(1, el.w / total)
  const xs: number[] = []
  el.columns.reduce((x, col) => { xs.push(x); return x + col.width * scale }, el.x)
  let y = el.y
  const cell = (t: string, i: number, font: PDFFont, color: RGB) => {
    const w = el.columns[i].width * scale - 6
    let str = safe(t)
    while (str && font.widthOfTextAtSize(str, s) > w) str = str.slice(0, -1)
    if (str) c.page.drawText(str, { x: xs[i], y: pdfY(y + s * 0.95), size: s, font, color })
  }
  if (el.header) {
    el.columns.forEach((col, i) => cell(col.label, i, c.fonts.sansBold, c.colors.muted))
    y += rh
  }
  for (const row of tableRows(c.value(el.field))) {
    if (y + rh > el.y + el.h + 1) break
    el.columns.forEach((_, i) => cell(row[i] ?? '', i, c.fonts.sans, c.colors.ink))
    y += rh
  }
}

function drawEl(c: Ctx, el: El, flowSlice?: RichLine[]) {
  switch (el.type) {
    case 'text': return drawText(c, el)
    case 'field': return drawField(c, el, flowSlice)
    case 'box':
      return c.page.drawRectangle({
        x: el.x, y: pdfY(el.y + el.h), width: el.w, height: el.h,
        ...(el.fill === 'wash' ? { color: c.wash } : el.fill === 'tint' ? { color: c.tint } : {}),
        ...(el.stroke !== 'none' ? { borderColor: c.colors[el.stroke], borderWidth: el.lineWidth } : { borderWidth: 0 }),
      })
    case 'line':
      return el.w >= el.h
        ? c.page.drawLine({ start: { x: el.x, y: pdfY(el.y + el.h / 2) }, end: { x: el.x + el.w, y: pdfY(el.y + el.h / 2) }, thickness: el.lineWidth, color: c.colors[el.stroke] })
        : c.page.drawLine({ start: { x: el.x + el.w / 2, y: pdfY(el.y) }, end: { x: el.x + el.w / 2, y: pdfY(el.y + el.h) }, thickness: el.lineWidth, color: c.colors[el.stroke] })
    case 'logo': {
      if (!c.logo) return
      const r = Math.min(el.w / c.logo.width, el.h / c.logo.height)
      const w = c.logo.width * r, h = c.logo.height * r
      return c.page.drawImage(c.logo, { x: el.x + (el.w - w) / 2, y: pdfY(el.y + (el.h + h) / 2), width: w, height: h })
    }
    case 'checkbox':
      tick(c, el.x, el.y, el.size, false)
      return c.page.drawText(safe(el.label), { x: el.x + el.size * 1.6, y: pdfY(el.y + el.size * 0.85), size: el.size, font: c.fonts.sans, color: c.colors.ink })
    case 'choices': return drawChoices(c, el)
    case 'table': return drawTable(c, el)
  }
}

/** Render a form (or the letterhead on its own) to a PDF. Long flowing text adds pages. */
export async function renderForm({ layout, letterhead, brand, values }: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
  }
  const accent = hexToRgb(brand.accent)
  const colors = { ink: rgb(0.13, 0.14, 0.15), muted: rgb(0.4, 0.42, 0.44), accent }
  const tint = rgb(1 - (1 - accent.red) * 0.12, 1 - (1 - accent.green) * 0.12, 1 - (1 - accent.blue) * 0.12)
  const wash = rgb(0.95, 0.94, 0.92)
  const logo = brand.logo ? (brand.logo.type === 'png' ? await doc.embedPng(brand.logo.bytes) : await doc.embedJpg(brand.logo.bytes)) : undefined
  const background = layout.useLetterhead && brand.letterhead ? (await doc.embedPdf(brand.letterhead, [0]))[0] : undefined

  // Work out how flowing text splits across pages.
  const flow = layout.elements.find((e): e is FieldEl => e.type === 'field' && !!e.flow)
  const cont = layout.continuation ?? DEFAULT_CONTINUATION
  let firstSlice: RichLine[] | undefined
  const laterSlices: RichLine[][] = []
  if (flow) {
    const { vw, vh } = fieldParts(flow)
    const text = values[flow.field] ?? ''
    const all = flow.rich
      ? richLines(text, fonts, flow.size, vw, flow.serif)
      : wrap(text, fontFor(fonts, flow.serif, flow.bold), flow.size, vw).map((t) => ({ text: t, bold: false, indent: 0 }))
    const lh = flow.size * LINE_HEIGHT
    const cap1 = Math.max(1, Math.floor((vh + flow.size * 0.3) / lh))
    const capN = Math.max(1, Math.floor((cont.bottom - cont.top) / lh))
    firstSlice = all.slice(0, cap1)
    for (let i = cap1; i < all.length; i += capN) laterSlices.push(all.slice(i, i + capN))
  }
  const pageCount = 1 + laterSlices.length

  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    const c: Ctx = {
      page, fonts, colors, tint, wash, logo,
      value: (k) => (k === 'doc.page' ? `Page ${p + 1} of ${pageCount}` : values[k] ?? ''),
    }
    if (background) page.drawPage(background, { x: 0, y: 0, width: PAGE_W, height: PAGE_H })
    if (layout.useLetterhead && letterhead) letterhead.elements.forEach((el) => drawEl(c, el))
    for (const el of layout.elements) {
      if (el === flow) {
        if (p === 0) drawEl(c, el, firstSlice)
        else drawRich(c, laterSlices[p - 1], fieldParts(flow).vx, cont.top, flow)
      } else if (p === 0 || el.repeat) {
        drawEl(c, el)
      }
    }
  }
  return doc.save()
}

/** Put a generated cover in front of another PDF (e.g. the contractor's submittal). */
export async function prependTo(cover: Uint8Array, attachment: ArrayBuffer): Promise<Uint8Array> {
  const out = await PDFDocument.load(cover)
  const src = await PDFDocument.load(attachment)
  const pages = await out.copyPages(src, src.getPageIndices())
  pages.forEach((p) => out.addPage(p))
  return out.save()
}
