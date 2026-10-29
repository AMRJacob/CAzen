/**
 * Build a starting template from a firm's existing PDF form.
 *
 * Reads page 1 of the PDF and turns what it finds into editable elements:
 *  - fillable form fields (text boxes, tick boxes) at their exact positions
 *  - "Label:" text with a value beside it → a CAzen field (Project, Reference #, Date Received…)
 *  - headings with a box or text under them → a multi-line field (Review Comments, Notes…)
 *  - the main body of a report → a flowing outline field
 *  - rules and boxes (found by scanning the rendered page), the logo, the title colour
 *  - text that matches the firm's own details → firm fields, so a rebrand updates it
 * Anything it can't place stays as plain text, which can be turned into a field in the editor.
 */
import { PDFDocument, PDFCheckBox, PDFTextField, StandardFonts } from 'pdf-lib'
import { getDocument } from '../pdf/pdfjs'
import type { Brand } from '../brand'
import { customKey, fieldsFor } from './fields'
import {
  DEFAULT_CONTINUATION, PAGE_H, PAGE_W, newId,
  type Align, type ChoicesEl, type ColorRole, type El, type FieldEl, type FormKind, type Layout, type TextEl,
} from './types'

export interface ImportResult {
  layout: Layout
  /** Exact original page, for "keep the original behind the layout". */
  background: Uint8Array
  logoPng?: Uint8Array
  accent?: string
  fillable: boolean
  report: { matched: { label: string; field: string }[]; custom: string[]; plainText: number; boxes: number; rules: number }
}

interface Line {
  text: string
  x: number            // left, points from page left
  top: number          // top of the text box, points from page top
  baseline: number
  w: number
  size: number
  bold: boolean
  color: ColorRole
  rgb: [number, number, number]
  cover?: number
  used?: boolean
}

interface Seg { x0: number; y0: number; x1: number; y1: number; color: ColorRole; rgb: [number, number, number]; t: number }

const SCALE = 2 // render at 2 px per point for pixel analysis

// ------------------------------------------------------------------ label → field matching

/** Label words that point to each field, most specific first. Kind-specific entries win. */
const SYNONYMS: Record<string, string[]> = {
  'project.name': ['project name', 'project'],
  'project.number': ['project no', 'project number', 'project #', 'job no', 'job number', 'job #', 'comm no', 'commission no'],
  'project.owner': ['owner', 'client'],
  'project.contractor': ['general contractor', 'contractor', 'gc'],
  'project.address': ['project address', 'project location', 'site address', 'location', 'address'],
  'doc.date': ['date issued', 'issue date', 'date'],
  'doc.page': ['page'],
  'sub.number': ['reference #', 'reference no', 'reference', 'submittal no', 'submittal #', 'submittal number', 'transmittal no'],
  'sub.division': ['division'],
  'sub.title': ['submittal name', 'name', 'description', 'title', 'item'],
  'sub.subcontractor': ['sub contractor', 'subcontractor', 'sub-contractor', 'supplier'],
  'sub.contact_name': ['contact name', 'contact'],
  'sub.contact_phone': ['contact #', 'contact no', 'contact number', 'phone'],
  'sub.received': ['date received', 'date recieved', 'received'],
  'sub.to_consultant': ['date forwarded', 'forwarded'],
  'sub.from_consultant': ['date returned', 'returned'],
  'sub.returned': ['date forwarded', 'date returned to contractor', 'date sent'],
  'sub.items': ['items transmitted', 'items', 'enclosures'],
  'sub.comments': ['review comments', 'comments', 'remarks', 'notes'],
  'sub.reviewer': ['reviewed by', 'architect name', 'by', 'reviewer'],
  'asi.number': ['asi no', 'asi #', 'asi number', 'instruction no', 'number'],
  'asi.title': ['subject', 'title', 're'],
  'asi.description': ['instructions', 'description', 'the work shall'],
  'asi.sheets': ['sheets affected', 'attachments', 'drawings', 'sheets'],
  'asi.issued_by': ['issued by', 'architect', 'by'],
  'rfi.number': ['rfi no', 'rfi #', 'rfi number', 'number'],
  'rfi.subject': ['subject', 're', 'title'],
  'rfi.from': ['from', 'submitted by', 'requested by'],
  'rfi.received': ['date received', 'received'],
  'rfi.question': ['question', 'request', 'description'],
  'rfi.response': ['response', 'answer', 'architect response'],
  'rfi.answered_by': ['answered by', 'responded by', 'by'],
  'pr.number': ['pr no', 'pr #', 'proposal request no', 'number'],
  'pr.title': ['subject', 'title', 're'],
  'pr.description': ['description', 'proposed change', 'description of proposed change'],
  'pr.due': ['proposal due', 'due', 'respond by'],
  'pr.attachments': ['attachments', 'enclosures'],
  'pr.issued_by': ['issued by', 'architect', 'by'],
  'ccd.number': ['ccd no', 'ccd #', 'directive no', 'number'],
  'ccd.title': ['subject', 'title', 're'],
  'ccd.description': ['directive', 'description', 'change'],
  'ccd.amount': ['amount', 'proposed amount', 'cost'],
  'ccd.time': ['contract time', 'time', 'days'],
  'ccd.issued_by': ['issued by', 'architect', 'by'],
  'fr.number': ['report no', 'report #', 'report number', 'field report no'],
  'fr.date': ['date', 'visit date', 'date of visit', 'meeting date'],
  'fr.time': ['time'],
  'fr.location': ['location', 'site', 'place'],
  'fr.weather': ['weather', 'conditions'],
  'fr.participants': ['participants', 'attendees', 'present', 'in attendance'],
  'fr.observations': ['field observations', 'observations', 'site observations'],
  'fr.notes': ['meeting notes', 'notes', 'discussion', 'meeting minutes'],
  'fr.observed_by': ['observed by', 'reported by', 'prepared by', 'by'],
}

const norm = (s: string) => s.toLowerCase().replace(/[:.]+\s*$/, '').replace(/\s+/g, ' ').trim()

/** Best field key for a label, skipping keys already placed (so a second "Date Forwarded" goes to the next field). */
function matchField(kind: FormKind, label: string, taken: Set<string>): string | null {
  const l = norm(label).replace(/#$/, ' #').replace(/\s+/g, ' ').trim()
  const keys = fieldsFor(kind).map((f) => f.key).filter((k) => !k.startsWith('firm.'))
  // Kind-specific keys first, then project/doc keys.
  const prefix = { submittal_cover: 'sub.', asi: 'asi.', rfi_response: 'rfi.', pr: 'pr.', ccd: 'ccd.', field_report: 'fr.' }[kind]
  const ordered = [...keys.filter((k) => k.startsWith(prefix)), ...keys.filter((k) => !k.startsWith(prefix))]
  let best: { key: string; score: number } | null = null
  for (const key of ordered) {
    if (taken.has(key)) continue
    for (const syn of SYNONYMS[key] ?? []) {
      const score = l === syn ? 100 + syn.length : l.startsWith(syn + ' ') || l.endsWith(' ' + syn) ? 40 + syn.length : 0
      if (score && (!best || score > best.score)) best = { key, score }
    }
  }
  return best?.key ?? null
}

// ------------------------------------------------------------------ colours

function classify([r, g, b]: [number, number, number]): ColorRole {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b)
  const sat = hi === 0 ? 0 : (hi - lo) / hi
  if (sat > 0.35 && hi > 70) return 'accent'
  return (r + g + b) / 3 > 105 ? 'muted' : 'ink'
}

const hex = ([r, g, b]: [number, number, number]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

// ------------------------------------------------------------------ main

export async function importPdf(bytes: Uint8Array, kind: FormKind, brand: Brand, known: Record<string, string> = {}): Promise<ImportResult> {
  // Keep only page 1 as the background copy.
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const one = await PDFDocument.create()
  const [p1] = await one.copyPages(src, [0])
  one.addPage(p1)
  const background = await one.save()

  const pdf = await getDocument({ data: bytes.slice() }).promise
  const page = await pdf.getPage(1)
  const vp1 = page.getViewport({ scale: 1 })
  // Scale everything to US Letter points even if the PDF page is a different size.
  const kx = PAGE_W / vp1.width, ky = PAGE_H / vp1.height

  // Render for pixel analysis (rules, colours, logo).
  const vp = page.getViewport({ scale: SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(vp.width)
  canvas.height = Math.ceil(vp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const W = canvas.width, H = canvas.height
  const at = (x: number, y: number) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return [px[i], px[i + 1], px[i + 2]] as [number, number, number] }
  const isInk = (i: number) => px[i] + px[i + 1] + px[i + 2] < 600 // anything clearly not white

  // ---------------- text → lines
  const ops = await page.getOperatorList() // also loads fonts so their real names are known
  const tc = await page.getTextContent()
  const raw = tc.items.flatMap((it) => {
    if (!('str' in it) || !it.str.trim()) return []
    const [, , c, d, e, f] = it.transform as number[]
    const size = Math.hypot(c, d) * ky
    let fontName = ''
    try { fontName = (page.commonObjs.get(it.fontName) as { name?: string })?.name ?? '' } catch { /* not loaded */ }
    return [{ str: it.str, x: e * kx, baseline: (vp1.height - f) * ky, w: it.width * kx, size, bold: /bold|black|heavy|semibold|demi/i.test(fontName) }]
  })
  raw.sort((a, b) => a.baseline - b.baseline || a.x - b.x)
  const lines: Line[] = []
  for (const r of raw) {
    const prev = lines[lines.length - 1]
    const gap = prev ? r.x - (prev.x + prev.w) : Infinity
    if (prev && Math.abs(prev.baseline - r.baseline) < Math.max(1.5, r.size * 0.2) && gap > -1 && gap < r.size * 0.9 && Math.abs(prev.size - r.size) < 1.5) {
      prev.text += (gap > r.size * 0.12 && !prev.text.endsWith(' ') && !r.str.startsWith(' ') ? ' ' : '') + r.str
      prev.w = r.x + r.w - prev.x
      prev.bold = prev.bold && r.bold
    } else {
      lines.push({ text: r.str, x: r.x, top: r.baseline - r.size * 0.9, baseline: r.baseline, w: r.w, size: r.size, bold: r.bold, color: 'ink', rgb: [0, 0, 0] })
    }
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim()
  // Colour of each line: average of its darkest pixels.
  for (const l of lines) {
    let n = 0, r = 0, g = 0, b = 0
    const x0 = (l.x / kx) * SCALE, x1 = ((l.x + l.w) / kx) * SCALE
    const y0 = ((l.baseline - l.size * 0.7) / ky) * SCALE, y1 = (l.baseline / ky) * SCALE
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      const c = at(x, y)
      if (c[0] + c[1] + c[2] < 450) { n++; r += c[0]; g += c[1]; b += c[2] }
    }
    if (n) { l.rgb = [r / n, g / n, b / n]; l.color = classify(l.rgb) }
    l.cover = n / Math.max(1, (x1 - x0) * (y1 - y0))
  }
  // Bold: font name says so, or the text is much inkier than other text of its size.
  for (const l of lines) {
    if (l.bold) continue
    const peers = lines.filter((o) => Math.abs(o.size - l.size) < 1.5 && o.text.length > 3).map((o) => o.cover ?? 0)
    if (peers.length >= 3 && (l.cover ?? 0) > median(peers) * 1.28) l.bold = true
  }

  // ---------------- fillable fields
  type Widget = { name: string; kind: 'text' | 'check'; x: number; y: number; w: number; h: number; multiline: boolean }
  const widgets: Widget[] = []
  try {
    const form = src.getForm()
    for (const fld of form.getFields()) {
      const wd = fld.acroField.getWidgets()[0]
      if (!wd) continue
      const pageRef = wd.P()
      if (pageRef && pageRef !== src.getPage(0).ref) continue
      const r = wd.getRectangle()
      const box = { x: r.x * kx, y: (vp1.height - r.y - r.height) * ky, w: r.width * kx, h: r.height * ky }
      if (fld instanceof PDFTextField) widgets.push({ name: fld.getName(), kind: 'text', ...box, multiline: box.h > 26 }) // many forms flag one-line boxes as multi-line
      else if (fld instanceof PDFCheckBox) widgets.push({ name: fld.getName(), kind: 'check', ...box, multiline: false })
    }
  } catch { /* no form */ }
  const fillable = widgets.length > 0

  // ---------------- rules and boxes from pixels
  const textBoxes = lines.map((l) => ({ x0: (l.x / kx) * SCALE - 1, x1: ((l.x + l.w) / kx) * SCALE + 1, y0: (l.top / ky) * SCALE, y1: ((l.baseline + l.size * 0.25) / ky) * SCALE }))
  const inText = (x: number, y: number) => textBoxes.some((t) => x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1)
  const minH = 36 * SCALE, minV = 24 * SCALE, maxT = 4 * SCALE
  const hruns: { x0: number; x1: number; y: number }[] = []
  for (let y = 0; y < H; y++) {
    let start = -1
    for (let x = 0; x <= W; x++) {
      const ink = x < W && isInk((y * W + x) * 4)
      if (ink && start < 0) start = x
      if (!ink && start >= 0) { if (x - start >= minH && !inText((start + x) / 2, y)) hruns.push({ x0: start, x1: x, y }); start = -1 }
    }
  }
  const vruns: { y0: number; y1: number; x: number }[] = []
  for (let x = 0; x < W; x++) {
    let start = -1
    for (let y = 0; y <= H; y++) {
      const ink = y < H && isInk((y * W + x) * 4)
      if (ink && start < 0) start = y
      if (!ink && start >= 0) { if (y - start >= minV && !inText(x, (start + y) / 2)) vruns.push({ y0: start, y1: y, x }); start = -1 }
    }
  }
  const segs: Seg[] = []
  const toSeg = (x0: number, y0: number, x1: number, y1: number, t: number): Seg => {
    const c = at((x0 + x1) / 2, (y0 + y1) / 2)
    return { x0: (x0 / SCALE) * kx, y0: (y0 / SCALE) * ky, x1: (x1 / SCALE) * kx, y1: (y1 / SCALE) * ky, rgb: c, color: classify(c), t: (t / SCALE) * ky }
  }
  // Merge stacked rows/columns into single strokes; skip thick fills.
  hruns.sort((a, b) => a.y - b.y || a.x0 - b.x0)
  const usedH = new Set<number>()
  hruns.forEach((r, i) => {
    if (usedH.has(i)) return
    let y1 = r.y
    for (let j = i + 1; j < hruns.length && hruns[j].y <= y1 + 1; j++) {
      if (Math.abs(hruns[j].x0 - r.x0) < 3 && Math.abs(hruns[j].x1 - r.x1) < 3) { usedH.add(j); y1 = hruns[j].y }
    }
    const t = y1 - r.y + 1
    if (t <= maxT) segs.push(toSeg(r.x0, r.y, r.x1, y1 + 1, t))
  })
  vruns.sort((a, b) => a.x - b.x || a.y0 - b.y0)
  const usedV = new Set<number>()
  vruns.forEach((r, i) => {
    if (usedV.has(i)) return
    let x1 = r.x
    for (let j = i + 1; j < vruns.length && vruns[j].x <= x1 + 1; j++) {
      if (Math.abs(vruns[j].y0 - r.y0) < 3 && Math.abs(vruns[j].y1 - r.y1) < 3) { usedV.add(j); x1 = vruns[j].x }
    }
    const t = x1 - r.x + 1
    if (t <= maxT) segs.push(toSeg(r.x, r.y0, x1 + 1, r.y1, t))
  })
  const horiz = segs.filter((s) => s.x1 - s.x0 > s.y1 - s.y0)
  const vert = segs.filter((s) => s.y1 - s.y0 >= s.x1 - s.x0)

  // Boxes: two horizontals with matching ends joined by verticals at both ends.
  const boxes: { x: number; y: number; w: number; h: number; color: ColorRole; t: number }[] = []
  const usedSeg = new Set<Seg>()
  for (const top of horiz) for (const bot of horiz) {
    if (bot === top || bot.y0 <= top.y0 + 10 || usedSeg.has(top) || usedSeg.has(bot)) continue
    if (Math.abs(top.x0 - bot.x0) > 3 || Math.abs(top.x1 - bot.x1) > 3) continue
    const left = vert.find((v) => !usedSeg.has(v) && Math.abs(v.x0 - top.x0) < 4 && v.y0 <= top.y0 + 4 && v.y1 >= bot.y1 - 4)
    const right = vert.find((v) => !usedSeg.has(v) && Math.abs(v.x1 - top.x1) < 4 && v.y0 <= top.y0 + 4 && v.y1 >= bot.y1 - 4)
    if (!left || !right) continue
    ;[top, bot, left, right].forEach((s) => usedSeg.add(s))
    boxes.push({ x: top.x0, y: top.y0, w: top.x1 - top.x0, h: bot.y1 - top.y0, color: top.color, t: top.t })
  }

  // Ignore rules that are really form-field borders.
  const onWidget = (s: Seg) => widgets.some((w) => s.x0 >= w.x - 3 && s.x1 <= w.x + w.w + 3 && s.y0 >= w.y - 3 && s.y1 <= w.y + w.h + 3)
  const rules = segs.filter((s) => !usedSeg.has(s) && !onWidget(s))

  // ---------------- logo: largest image near the top, else an inked area top-left that isn't text or rules
  let logoRect: { x: number; y: number; w: number; h: number } | null = null
  {
    // Images from the drawing commands (track the transform stack).
    const { OPS } = await import('pdfjs-dist')
    let m = [1, 0, 0, 1, 0, 0]
    const stack: number[][] = []
    const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
    const imgs: { x: number; y: number; w: number; h: number }[] = []
    ops.fnArray.forEach((fn, i) => {
      if (fn === OPS.save) stack.push(m)
      else if (fn === OPS.restore) m = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      else if (fn === OPS.transform) m = mul(m, ops.argsArray[i] as number[])
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]]
        const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]]
        const x = Math.min(...xs), y = vp1.height - Math.max(...ys)
        imgs.push({ x: x * kx, y: y * ky, w: (Math.max(...xs) - x) * kx, h: (Math.max(...ys) - Math.min(...ys)) * ky })
      }
    })
    const top = imgs.filter((r) => r.y < PAGE_H * 0.25 && r.w > 20 && r.h > 20).sort((a, b) => a.x - b.x || b.w * b.h - a.w * a.h)
    if (top.length) logoRect = top[0]
    else {
      // Vector logo: the largest connected inked shape near the top-left that isn't text or a rule.
      const cell = 2 * SCALE // 2-point cells
      const cw = Math.ceil((W * 0.45) / cell), ch = Math.ceil((H * 0.22) / cell)
      const mask = new Uint8Array(cw * ch)
      for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
        let hit = false
        for (let y = cy * cell; y < (cy + 1) * cell && !hit; y++) for (let x = cx * cell; x < (cx + 1) * cell && !hit; x++) {
          if (!isInk((y * W + x) * 4) || inText(x, y)) continue
          const ptx = (x / SCALE) * kx, pty = (y / SCALE) * ky
          if (rules.some((sg) => ptx >= sg.x0 - 1 && ptx <= sg.x1 + 1 && pty >= sg.y0 - 1 && pty <= sg.y1 + 1)) continue
          hit = true
        }
        mask[cy * cw + cx] = hit ? 1 : 0
      }
      // Group cells that are within 2 cells (4 pt) of each other.
      const label = new Int32Array(cw * ch).fill(-1)
      const comps: { x0: number; y0: number; x1: number; y1: number; n: number }[] = []
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || label[i] >= 0) continue
        const c = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, n: 0 }
        const q = [i]; label[i] = comps.length
        while (q.length) {
          const j = q.pop()!
          const jx = j % cw, jy = (j / cw) | 0
          c.n++; c.x0 = Math.min(c.x0, jx); c.y0 = Math.min(c.y0, jy); c.x1 = Math.max(c.x1, jx); c.y1 = Math.max(c.y1, jy)
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = jx + dx, ny = jy + dy
            if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
            const k = ny * cw + nx
            if (mask[k] && label[k] < 0) { label[k] = comps.length; q.push(k) }
          }
        }
        comps.push(c)
      }
      const big = comps.filter((c) => c.x1 - c.x0 >= 10 && c.y1 - c.y0 >= 10).sort((p, q) => q.n - p.n)[0]
      if (big) logoRect = { x: ((big.x0 * cell) / SCALE) * kx, y: ((big.y0 * cell) / SCALE) * ky, w: (((big.x1 - big.x0 + 1) * cell) / SCALE) * kx, h: (((big.y1 - big.y0 + 1) * cell) / SCALE) * ky }
    }
  }
  let logoPng: Uint8Array | undefined
  if (logoRect) {
    // Crop at high resolution for the firm's logo.
    const hv = page.getViewport({ scale: 4 })
    const big = document.createElement('canvas')
    big.width = Math.ceil(hv.width); big.height = Math.ceil(hv.height)
    const bctx = big.getContext('2d')!
    await page.render({ canvas: big, canvasContext: bctx, viewport: hv }).promise
    const crop = document.createElement('canvas')
    const s = 4 / kx
    crop.width = Math.ceil(logoRect.w * s); crop.height = Math.ceil(logoRect.h * s)
    const cctx = crop.getContext('2d')!
    cctx.drawImage(big, logoRect.x * s, logoRect.y * (4 / ky), crop.width, crop.height, 0, 0, crop.width, crop.height)
    // White → transparent so the logo sits cleanly on any background.
    const d = cctx.getImageData(0, 0, crop.width, crop.height)
    for (let i = 0; i < d.data.length; i += 4) if (d.data[i] > 245 && d.data[i + 1] > 245 && d.data[i + 2] > 245) d.data[i + 3] = 0
    cctx.putImageData(d, 0, 0)
    const blob = await new Promise<Blob | null>((r) => crop.toBlob(r, 'image/png'))
    if (blob) logoPng = new Uint8Array(await blob.arrayBuffer())
    // Text inside the logo area is part of the logo.
    for (const l of lines) if (l.x >= logoRect.x - 2 && l.x + l.w <= logoRect.x + logoRect.w + 2 && l.top >= logoRect.y - 2 && l.baseline <= logoRect.y + logoRect.h + 2) l.used = true
  }

  // Measure with the fonts CAzen prints in, so imported text doesn't get cut off.
  const mdoc = await PDFDocument.create()
  const helv = await mdoc.embedFont(StandardFonts.Helvetica)
  const helvB = await mdoc.embedFont(StandardFonts.HelveticaBold)
  const measure = (t: string, size: number, bold: boolean) => {
    try { return (bold ? helvB : helv).widthOfTextAtSize(t.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), size) } catch { return t.length * size * 0.55 }
  }
  // Large coloured text is a title: treat as bold.
  for (const l of lines) if (l.color === 'accent' && l.size >= 12) l.bold = true

  // ---------------- build elements
  const els: El[] = []
  const taken = new Set<string>()
  const report: ImportResult['report'] = { matched: [], custom: [], plainText: 0, boxes: boxes.length, rules: rules.length }
  const firstSize = lines.length ? median(lines.map((l) => l.size)) : 9

  const fieldEl = (key: string, x: number, y: number, w: number, h: number, size: number, o: Partial<FieldEl> = {}): FieldEl =>
    ({ id: newId(), type: 'field', x: r1(x), y: r1(y), w: r1(Math.max(12, w)), h: r1(Math.max(size * 1.4, h)), field: key, label: '', labelMode: 'none', labelWidth: 80, labelAlign: 'left', size: r1(size), bold: false, align: 'left', color: 'ink', ...o })

  const claim = (label: string, fallbackName?: string) => {
    const key = matchField(kind, label, taken) ?? (fallbackName ? matchField(kind, fallbackName, taken) : null)
    if (key) { taken.add(key); report.matched.push({ label: label.replace(/:$/, ''), field: key }); return key }
    const c = customKey(label || fallbackName || 'field')
    let k = c, n = 2
    while (taken.has(k)) k = `${c}_${n++}`
    taken.add(k)
    report.custom.push(label.replace(/:$/, '') || fallbackName || k)
    return k
  }

  // A) Fillable fields.
  const textWidgets = widgets.filter((w) => w.kind === 'text').sort((a, b) => a.y - b.y || a.x - b.x)
  for (const w of textWidgets) {
    // Label on the same line, to the left.
    const label = lines
      .filter((l) => !l.used && l.baseline >= w.y - 2 && l.baseline <= w.y + Math.min(w.h, 22) + 3 && l.x + l.w <= w.x + 6 && l.x + l.w > w.x - 160)
      .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0]
    if (label && !w.multiline) {
      label.used = true
      const key = claim(label.text, w.name)
      const lw = w.x - label.x - 4
      const rightAligned = Math.abs(label.x + label.w - w.x) < 14
      els.push(fieldEl(key, label.x, w.y + w.h / 2 - label.size * 0.75, w.x + w.w - label.x, label.size * 1.45, label.size, {
        label: label.text, labelMode: 'left', labelWidth: r1(Math.max(12, lw)), labelAlign: rightAligned ? 'right' : 'left', color: 'ink',
      }))
      continue
    }
    // Heading just above a multi-line box.
    const heading = lines.filter((l) => !l.used && l.baseline <= w.y + 2 && l.baseline > w.y - 24 && l.x <= w.x + 20).sort((a, b) => b.baseline - a.baseline)[0]
    const key = claim(heading?.text ?? '', w.name)
    els.push(fieldEl(key, w.x + 2, w.y + 2, w.w - 4, w.h - 2, Math.min(10, firstSize), { rich: w.multiline }))
  }

  // Tick boxes → one choices group per column of boxes.
  const checks = widgets.filter((w) => w.kind === 'check').sort((a, b) => a.x - b.x || a.y - b.y)
  const groups: Widget[][] = []
  for (const c of checks) {
    const g = groups.find((gr) => Math.abs(gr[0].x - c.x) < 6)
    if (g) g.push(c); else groups.push([c])
  }
  for (const g of groups) {
    g.sort((a, b) => a.y - b.y)
    const choiceField = fieldsFor(kind).find((f) => f.choices && !taken.has(f.key))
    const options: ChoicesEl['options'] = []
    g.forEach((c, i) => {
      const lab = lines.find((l) => !l.used && Math.abs(l.baseline - (c.y + c.h)) < 6 && l.x > c.x && l.x < c.x + 40)
      if (lab) lab.used = true
      const nextY = g[i + 1]?.y ?? c.y + 120
      const notes: Line[] = []
      let prevBase = lab?.baseline ?? c.y + c.h
      for (const l of lines.filter((x) => !x.used && x.top > c.y + c.h - 1 && x.baseline < nextY - 2 && x.x > c.x + 4).sort((a, b) => a.baseline - b.baseline)) {
        if (l.baseline - prevBase > l.size * 1.7 || (notes[0] && Math.abs(l.x - notes[0].x) > 3) || l.size > (lab?.size ?? 10) + 0.1) break
        notes.push(l); prevBase = l.baseline
      }
      notes.forEach((n) => { n.used = true })
      const label = lab?.text ?? c.name
      const match = choiceField?.choices?.find((o) => norm(o.label) === norm(label)) ?? choiceField?.choices?.find((o) => norm(label).startsWith(norm(o.label)))
      options.push({ value: match?.value ?? customKey(label).slice(7), label, ...(notes.length ? { note: notes.map((n) => n.text).join(' ') } : {}) })
    })
    const key = choiceField ? (taken.add(choiceField.key), choiceField.key) : claim('Choice')
    const last = g[g.length - 1]
    const size = lines.find((l) => options.some((o) => o.label === l.text))?.size ?? 9
    const groupRight = Math.max(g[0].x + 120, ...lines.filter((l) => options.some((o) => o.label === l.text || o.note?.includes(l.text))).map((l) => l.x + l.w))
    els.push({ id: newId(), type: 'choices', x: r1(g[0].x), y: r1(g[0].y - 1), w: r1(Math.min(PAGE_W - 36 - g[0].x, groupRight - g[0].x + 4)), h: r1(last.y - g[0].y + 40), field: key, options, size: r1(size), direction: 'vertical' })
    if (choiceField) report.matched.push({ label: 'tick boxes', field: key })
  }

  const unused = () => lines.filter((l) => !l.used)

  // B2) A heading over rows of columns (e.g. Participants) → a table.
  const tableKey = kind === 'field_report' ? 'fr.participants' : null
  if (tableKey && !taken.has(tableKey)) {
    const head = unused().find((l) => matchField(kind, l.text, new Set()) === tableKey)
    if (head) {
      const rows = unused().filter((l) => l !== head && l.top > head.baseline && l.top < head.baseline + 140 && l.x >= head.x - 4)
      // Stop at the first rule under the heading.
      const stop = horiz.filter((sg) => sg.y0 > head.baseline && sg.x0 <= head.x + 10 && sg.x1 >= head.x).sort((a, b) => a.y0 - b.y0)[0]
      const inside = rows.filter((l) => !stop || l.baseline < stop.y0)
      const xs = [...new Set(inside.map((l) => Math.round(l.x / 6) * 6))].sort((a, b) => a - b)
      if (inside.length >= 2 && xs.length >= 2) {
        head.used = true
        inside.forEach((l) => { l.used = true })
        taken.add(tableKey)
        report.matched.push({ label: head.text.replace(/:$/, ''), field: tableKey })
        const right = Math.max(...inside.map((l) => l.x + l.w))
        const cols = xs.map((x, i) => ({ label: ['Name', 'Company', 'Email', 'Phone', 'Role'][i] ?? `Column ${i + 1}`, width: r1((xs[i + 1] ?? right + 8) - x) }))
        const bottom = Math.max(...inside.map((l) => l.baseline)) + 6
        els.push({ id: newId(), type: 'text', x: r1(head.x), y: r1(head.top), w: r1(head.w + 10), h: r1(head.size * 1.4), text: head.text, size: r1(head.size), bold: head.bold, align: 'left', color: head.color })
        els.push({ id: newId(), type: 'table', x: r1(xs[0]), y: r1(head.baseline + 4), w: r1(right - xs[0] + 8), h: r1(bottom - head.baseline), field: tableKey, columns: cols, size: r1(median(inside.map((l) => l.size))), header: false })
      }
    }
  }

  // B) "Label:" text with a value to its right (forms that aren't fillable, or extra labels).
  for (const l of unused()) {
    if (l.used || !/:\s*$/.test(l.text) || l.text.length > 40) continue
    const value = lines.filter((v) => !v.used && v !== l && Math.abs(v.baseline - l.baseline) < 2 && v.x >= l.x + l.w - 1 && v.x < l.x + l.w + 120).sort((a, b) => a.x - b.x)[0]
    // Lines continuing the value underneath (e.g. a two-line location).
    const more = value ? lines.filter((v) => !v.used && Math.abs(v.x - value.x) < 3 && v.baseline > value.baseline && v.baseline - value.baseline < value.size * 2.6 && !/:\s*$/.test(v.text)) : []
    const below = !value ? lines.filter((v) => !v.used && v !== l && v.top > l.baseline && v.top - l.baseline < l.size * 1.8 && Math.abs(v.x - l.x) < 40) : []
    const key = matchField(kind, l.text, taken)
    const emptySlot = !value && key && !below.length && !lines.some((v) => v !== l && Math.abs(v.baseline - l.baseline) < 2 && v.x > l.x + l.w && v.x < l.x + l.w + 160)
    if (emptySlot) {
      l.used = true
      taken.add(key!)
      report.matched.push({ label: l.text.replace(/:$/, ''), field: key! })
      els.push(fieldEl(key!, l.x, l.top, Math.min(PAGE_W - 36 - l.x, l.w + 150), l.size * 1.45, l.size, { label: l.text, labelMode: 'left', labelWidth: r1(l.w + 4), labelAlign: 'left' }))
      continue
    }
    if (!value && (!key || !below.length)) continue // a heading; handled below or left as text
    l.used = true
    const k = key ? (taken.add(key), report.matched.push({ label: l.text.replace(/:$/, ''), field: key }), key) : claim(l.text)
    if (value) {
      value.used = true
      more.forEach((m) => { m.used = true })
      const lastLine = more[more.length - 1] ?? value
      const rightEdge = Math.min(PAGE_W - 36, Math.max(value.x + value.w + 60, l.x + 200))
      els.push(fieldEl(k, l.x, l.top, rightEdge - l.x, lastLine.baseline - l.top + l.size * 0.5, l.size, {
        label: l.text, labelMode: 'left', labelWidth: r1(value.x - l.x - 6), labelAlign: 'left', bold: value.bold, color: 'ink',
      }))
    }
  }

  // C) Report body: everything under the last rule in the top half becomes one flowing outline field.
  const flowKey = ({ field_report: 'fr.observations', asi: 'asi.description', rfi_response: 'rfi.response', pr: 'pr.description', ccd: 'ccd.description', submittal_cover: '' } as Record<FormKind, string>)[kind]
  if (flowKey && !taken.has(flowKey) && !fillable) {
    const upperRules = horiz.filter((s) => s.y0 < PAGE_H * 0.5 && s.x1 - s.x0 > PAGE_W * 0.4)
    const startY = upperRules.length ? Math.max(...upperRules.map((s) => s.y1)) + 2 : PAGE_H * 0.35
    const body = unused().filter((l) => l.top > startY && l.baseline < PAGE_H - 50)
    if (body.length > 3) {
      body.forEach((l) => { l.used = true })
      taken.add(flowKey)
      const x = Math.min(...body.map((l) => l.x))
      report.matched.push({ label: 'report body', field: flowKey })
      els.push(fieldEl(flowKey, x, startY + 6, PAGE_W - 36 - x, DEFAULT_CONTINUATION.bottom - startY - 6, median(body.map((l) => l.size)), {
        rich: true, flow: true,
        ...(kind === 'field_report' ? { combine: [{ field: 'fr.observations', heading: 'Field Observations' }, { field: 'fr.notes', heading: 'Meeting Notes' }] } : {}),
      }))
      if (kind === 'field_report') taken.add('fr.notes')
    }
  }

  // D) Page numbers and firm details.
  const firmMatch: [string, string][] = [
    ['firm.name', brand.firmName], ['firm.contact', brand.contactLine], ['firm.license', brand.licenseText],
    ...brand.addressLines.map((a) => ['firm.address', a] as [string, string]),
  ]
  const simple = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const l of unused()) {
    if (/^page \d+ (of|\/) \d+$/i.test(l.text)) {
      l.used = true
      els.push(fieldEl('doc.page', l.x - 40, l.top, l.w + 80, l.size * 1.4, l.size, { align: 'center', color: l.color, repeat: true }))
      continue
    }
    const f = firmMatch.find(([, v]) => v && simple(v).length > 4 && (simple(l.text) === simple(v) || (simple(l.text).includes(simple(v)) && simple(v).length >= simple(l.text).length * 0.6)))
    if (f) {
      l.used = true
      els.push(fieldEl(f[0], l.x, l.top, Math.max(l.w + 30, 120), l.size * 1.4, l.size, { bold: l.bold, color: l.color }))
      continue
    }
    // Text that is the current project's details.
    const pk = Object.entries(known).find(([k, v]) => k.startsWith('project.') && v && simple(v) === simple(l.text))
    if (pk && !taken.has(pk[0])) {
      l.used = true
      taken.add(pk[0])
      report.matched.push({ label: l.text, field: pk[0] })
      els.push(fieldEl(pk[0], l.x, l.top, Math.max(l.w + 60, 200), l.size * 1.4, l.size, { bold: l.bold, color: l.color }))
    }
  }

  // E) Everything else: plain text, with stacked lines of the same style joined into paragraphs.
  const rest = unused().sort((a, b) => a.top - b.top || a.x - b.x)
  const paras: Line[][] = []
  for (const l of rest) {
    const p = paras.find((g) => {
      const last = g[g.length - 1]
      return Math.abs(last.x - l.x) < 3 && Math.abs(last.size - l.size) < 0.4 && last.bold === l.bold && last.color === l.color &&
        l.baseline - last.baseline > 0 && l.baseline - last.baseline < l.size * 1.6 && !/:\s*$/.test(last.text) && last.w > 80
    })
    if (p) p.push(l); else paras.push([l])
  }
  for (const g of paras) {
    const first = g[0], last = g[g.length - 1]
    const w = Math.max(...g.map((l) => l.w))
    const text = g.map((l) => l.text).join(g.length > 1 ? ' ' : '')
    // Paragraphs: scale the size so CAzen's font fills the same lines as the original.
    const origWidth = g.reduce((a, l) => a + l.w, 0)
    const ourWidth = measure(g.map((l) => l.text).join(' '), first.size, first.bold)
    let size = g.length > 1 && ourWidth > origWidth ? first.size * Math.max(0.82, origWidth / ourWidth) : first.size
    let width = g.length > 1 ? w + 2 : Math.max(w, measure(text, size, first.bold)) + 6
    const room = PAGE_W - first.x - 8
    if (g.length === 1 && width > room) { size = size * (room / width); width = room } // shrink a too-long title to fit
    const t: TextEl = {
      id: newId(), type: 'text', x: r1(first.x), y: r1(first.top), w: r1(Math.min(room, width)),
      // Paragraphs get extra height: CAzen's font may wrap a little differently.
      h: r1(last.baseline - first.top + first.size * (g.length > 1 ? 0.9 : 0.5)),
      text, size: r1(size), bold: first.bold, align: 'left' as Align, color: first.color, ...(g.length > 1 ? { fit: true } : {}),
    }
    // Right-aligned label stacks keep their alignment.
    els.push(t)
    report.plainText++
  }

  // F) Graphics.
  for (const b of boxes) els.push({ id: newId(), type: 'box', x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h), stroke: b.color, lineWidth: r1(Math.max(0.5, b.t)), fill: 'none' })
  for (const s of rules) {
    const horizontal = s.x1 - s.x0 > s.y1 - s.y0
    els.push({ id: newId(), type: 'line', x: r1(s.x0), y: r1(horizontal ? s.y0 - 1 : s.y0), w: r1(horizontal ? s.x1 - s.x0 : Math.max(2, s.t + 2)), h: r1(horizontal ? Math.max(2, s.t + 2) : s.y1 - s.y0), stroke: s.color, lineWidth: r1(Math.max(0.4, s.t)) })
  }
  if (logoRect) els.push({ id: newId(), type: 'logo', x: r1(logoRect.x), y: r1(logoRect.y), w: r1(logoRect.w), h: r1(logoRect.h) })

  // Header items repeat on every page of multi-page forms.
  const headerRule = horiz.filter((s) => s.y0 < PAGE_H * 0.2 && s.x1 - s.x0 > PAGE_W * 0.4).sort((a, b) => a.y0 - b.y0)[0]
  const headerBottom = headerRule ? headerRule.y1 + 1 : (logoRect ? logoRect.y + logoRect.h + 4 : 0)
  for (const e of els) if (e.y + e.h <= headerBottom + 2) e.repeat = true

  // Draw order: boxes and rules under text.
  const order: Record<El['type'], number> = { box: 0, line: 1, logo: 2, table: 3, choices: 3, checkbox: 3, text: 4, field: 5 }
  els.sort((a, b) => order[a.type] - order[b.type])

  // Accent: the most common strongly coloured text or rule colour.
  // Accent: the colour of the largest coloured text (usually the title), else the longest coloured rule.
  const titleLine = lines.filter((l) => l.color === 'accent').sort((a, b) => b.size - a.size || b.w - a.w)[0]
  const accentRule = segs.filter((sg) => sg.color === 'accent').sort((a, b) => (b.x1 - b.x0 + b.y1 - b.y0) - (a.x1 - a.x0 + a.y1 - a.y0))[0]
  const accent = titleLine ? hex(titleLine.rgb) : accentRule ? hex(accentRule.rgb) : undefined

  return {
    layout: { useLetterhead: false, elements: els, continuation: { top: Math.max(DEFAULT_CONTINUATION.top, headerBottom + 14), bottom: DEFAULT_CONTINUATION.bottom } },
    background, logoPng, accent, fillable, report,
  }
}

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 9
}

const r1 = (v: number) => Math.round(v * 10) / 10
