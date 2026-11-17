import { PDFArray, PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream, type PDFRef } from 'pdf-lib'
import { getDocument } from './pdfjs'

/**
 * Make a heavy sheet lighter without making it worse to work with.
 *
 * A sheet is heavy for one of two reasons, and they want opposite treatment:
 *
 *  - It carries images — an aerial, a rendering, a photographed detail — on an otherwise
 *    vector sheet. A PDF keeps those as separate objects that the page's drawing instructions
 *    only refer to, so a smaller one can be put in their place and nothing else on the sheet is
 *    touched: the linework stays vector, and the text layer that sheet search and the
 *    sheet-number links read stays exactly where it was.
 *
 *  - It is a scan: the whole page is one image and there is no text layer. Then there is nothing
 *    to preserve, and re-drawing the page at a sensible size is both simpler and more effective.
 *
 * Resolution is worked out from the sheet's own size rather than taken as a number. "300 dpi" is
 * advice meant for letter paper; a 36 x 24 sheet at 300 dpi is 78 megapixels, which is not a
 * reduction at all. What matters is pixels across the sheet, so the target dpi is applied to the
 * page's real width in inches.
 */

export interface ShrinkResult {
  bytes: Uint8Array
  before: number
  after: number
  /** What was done, for showing in the review table. */
  note: string
  changed: boolean
}

export const DEFAULT_DPI = 150

/** Told what is happening, so the caller can say so while it happens. */
export type OnStage = (stage: string) => void

/** PDF user-space units are 1/72 inch. */
const inches = (points: number) => points / 72

/**
 * Hand the browser a frame.
 *
 * Reducing a sheet is a few hundred milliseconds of work that cannot be broken up any further —
 * decoding an image, re-encoding it, writing the file. Run back to back over a set, that reads as
 * a hung tab. Stopping between the steps lets the page paint what it is doing and stay answerable,
 * which is the difference between slow and broken.
 */
const breathe = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0))
  else setTimeout(resolve, 0)
})

/** An image object on the page, big enough to be worth looking at. */
interface PageImage {
  name: PDFName
  ref: PDFRef
  dict: PDFDict
  raw: Uint8Array
  width: number
  height: number
  filter: string | null
}

function imagesOnPage(doc: PDFDocument, pageIndex: number): PageImage[] {
  const page = doc.getPage(pageIndex)
  const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
  if (!xobjects) return []
  const out: PageImage[] = []
  for (const [name, ref] of xobjects.entries()) {
    const stream = doc.context.lookup(ref)
    if (!(stream instanceof PDFRawStream)) continue
    const dict = stream.dict
    if (dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') continue
    const width = Number(dict.lookup(PDFName.of('Width'))?.toString() ?? 0)
    const height = Number(dict.lookup(PDFName.of('Height'))?.toString() ?? 0)
    if (!width || !height) continue
    out.push({
      name,
      ref: ref as PDFRef,
      dict,
      raw: stream.contents,
      width,
      height,
      filter: dict.lookup(PDFName.of('Filter'))?.toString() ?? null,
    })
  }
  return out
}

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
]

/** The page's drawing instructions, with the streams joined as PDF requires. */
function contentOf(doc: PDFDocument, pageIndex: number): string {
  const contents = doc.getPage(pageIndex).node.Contents()
  if (!contents) return ''
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((ref) => doc.context.lookup(ref))
    : [contents]
  const parts: string[] = []
  for (const s of streams) {
    if (!(s instanceof PDFRawStream)) continue
    try {
      parts.push(new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()))
    } catch { /* a stream we can't read just means less information */ }
  }
  return parts.join('\n')
}

/**
 * How large each image is actually drawn on the sheet, in points.
 *
 * This is the number that decides how many pixels an image needs — not the page size. An aerial
 * placed in a 18in corner of a 36in sheet needs 18in worth of pixels, and judging it by the sheet
 * would leave it four times larger than it has to be.
 *
 * A PDF draws an image into a unit square shaped by the current transformation matrix, so the
 * drawn size falls out of that matrix. Walking the stream for `q`, `Q`, `cm` and `Do` is enough;
 * strings are stepped over so their contents can't be mistaken for operators.
 */
function drawnSizes(doc: PDFDocument, pageIndex: number): Map<string, { w: number; h: number }> {
  const src = contentOf(doc, pageIndex)
  const out = new Map<string, { w: number; h: number }>()
  const stack: Matrix[] = []
  let ctm: Matrix = IDENTITY
  let operands: (number | string)[] = []

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '(') {                                   // literal string: skip to its close
      let depth = 1
      while (++i < src.length && depth) {
        if (src[i] === '\\') i++
        else if (src[i] === '(') depth++
        else if (src[i] === ')') depth--
      }
      operands.push('')
      continue
    }
    if (c === '<') { i = src.indexOf('>', i); if (i < 0) break; operands.push(''); continue }
    if (c === '%') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (/\s|\[|\]|\{|\}/.test(c)) continue
    if (c === '/') {
      let j = i + 1
      while (j < src.length && !/[\s/<>[\](){}%]/.test(src[j])) j++
      operands.push(src.slice(i + 1, j))
      i = j - 1
      continue
    }
    let j = i
    while (j < src.length && !/[\s/<>[\](){}%]/.test(src[j])) j++
    const token = src.slice(i, j)
    i = j - 1
    if (/^[-+.\d]/.test(token)) { operands.push(parseFloat(token)); continue }

    switch (token) {
      case 'q': stack.push(ctm); break
      case 'Q': ctm = stack.pop() ?? IDENTITY; break
      case 'cm': {
        const m = operands.slice(-6)
        if (m.length === 6 && m.every((v) => typeof v === 'number')) ctm = times(m as Matrix, ctm)
        break
      }
      case 'Do': {
        const name = operands[operands.length - 1]
        if (typeof name === 'string' && name) {
          const w = Math.hypot(ctm[0], ctm[1])
          const h = Math.hypot(ctm[2], ctm[3])
          const seen = out.get(name)
          // An image drawn more than once needs enough pixels for its largest appearance.
          if (!seen || w > seen.w) out.set(name, { w, h })
        }
        break
      }
    }
    operands = []
  }
  return out
}

/** Decode what the browser can open by itself. Scanner encodings (CCITT, JBIG2, JPEG 2000) can't be. */
async function decodable(image: PageImage): Promise<ImageBitmap | null> {
  const type = image.filter === '/DCTDecode' ? 'image/jpeg'
    : image.filter === '/JPXDecode' ? 'image/jp2'
    : null
  if (!type) return null
  try {
    return await createImageBitmap(new Blob([image.raw as BlobPart], { type }))
  } catch {
    return null
  }
}

async function toJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality))
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('The browser could not re-encode the image.')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Replace the oversized images on a sheet that has a text layer, leaving everything else as it is.
 * Returns null when there was nothing worth replacing.
 */
async function shrinkImages(bytes: Uint8Array, dpi: number, onStage: OnStage): Promise<Uint8Array | null> {
  onStage('reading the sheet')
  await breathe()
  const doc = await PDFDocument.load(bytes.slice() as unknown as ArrayBuffer, { ignoreEncryption: true })
  const page = doc.getPage(0)
  const drawn = drawnSizes(doc, 0)
  // Where the drawing instructions don't say how big an image is drawn — an image nested inside a
  // form, say — fall back to the width of the sheet, which no image on it can exceed.
  const pageCeiling = Math.round(inches(page.getWidth()) * dpi)
  let replaced = 0

  const all = imagesOnPage(doc, 0)
  for (const [n, image] of all.entries()) {
    const at = drawn.get(image.name.decodeText())
    const ceiling = Math.max(64, Math.round(at ? inches(at.w) * dpi : pageCeiling))
    if (image.width <= ceiling) continue
    onStage(all.length > 1 ? `image ${n + 1} of ${all.length}` : 'reducing the image')
    await breathe()
    const bitmap = await decodable(image)
    if (!bitmap) continue
    const width = ceiling
    const height = Math.max(1, Math.round((image.height / image.width) * width))
    let small: Uint8Array
    try {
      small = await toJpeg(bitmap, width, height, 0.82)
    } finally {
      bitmap.close()
    }
    // Only if it actually helps. A small or already-efficient image can come back bigger.
    if (small.length >= image.raw.length) continue

    const dict = doc.context.obj({
      Type: 'XObject', Subtype: 'Image',
      Width: width, Height: height,
      ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
      Filter: 'DCTDecode', Length: small.length,
    })
    // Carry over the entries that still describe this image. Anything about the old encoding
    // (DecodeParms, Decode) must not come along.
    for (const key of ['SMask', 'Mask', 'Intent']) {
      const value = image.dict.get(PDFName.of(key))
      if (value) dict.set(PDFName.of(key), value)
    }
    // Overwrite the object the page already points at. Pointing the page at a new object instead
    // would leave the original in the file — pdf-lib keeps unreferenced objects — and the sheet
    // would come out bigger than it went in.
    doc.context.assign(image.ref, PDFRawStream.of(dict, small))
    replaced++
  }

  if (!replaced) return null
  onStage('writing the sheet')
  await breathe()
  return await doc.save()
}

/**
 * Re-draw a scanned page at the target size. There is no text layer on these to lose.
 *
 * Never above the resolution the scan already has: rendering a 200 dpi scan at 300 would invent
 * pixels and hand back a bigger file than it was given.
 */
async function redrawPage(bytes: Uint8Array, dpi: number, nativeDpi: number, onStage: OnStage): Promise<Uint8Array> {
  onStage('reading the scan')
  await breathe()
  const pdf = await getDocument({ data: bytes.slice() }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    // PDF units are 1/72 inch, so rendering at dpi/72 puts exactly that many pixels in an inch.
    const vp = page.getViewport({ scale: Math.min(dpi, nativeDpi) / 72 })
    onStage(`redrawing at ${dpi} dpi`)
    await breathe()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width)
    canvas.height = Math.round(vp.height)
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    await breathe()
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    canvas.width = canvas.height = 0
    if (!blob) throw new Error('The browser could not re-encode the page.')

    onStage('writing the sheet')
    await breathe()
    const out = await PDFDocument.create()
    const jpeg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const sheet = out.addPage([base.width, base.height])
    sheet.drawImage(jpeg, { x: 0, y: 0, width: base.width, height: base.height })
    return await out.save()
  } finally {
    await pdf.loadingTask.destroy()
  }
}

/** The resolution a scanned page is actually carrying: its biggest image across the sheet's width. */
async function scanResolution(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes.slice() as unknown as ArrayBuffer, { ignoreEncryption: true })
  const widthInches = inches(doc.getPage(0).getWidth())
  const widest = imagesOnPage(doc, 0).reduce((n, i) => Math.max(n, i.width), 0)
  return widest && widthInches ? widest / widthInches : Infinity
}

/**
 * Make one sheet lighter. `hasText` comes from the split step, which already read each page's
 * words: a page with none is a scan.
 */
export async function shrinkSheet(
  bytes: Uint8Array,
  hasText: boolean,
  { dpi = DEFAULT_DPI, onStage = () => {} }: { dpi?: number; onStage?: OnStage } = {},
): Promise<ShrinkResult> {
  const before = bytes.length
  const keep = (note: string): ShrinkResult => ({ bytes, before, after: before, note, changed: false })

  try {
    if (hasText) {
      const out = await shrinkImages(bytes, dpi, onStage)
      if (!out) return keep('nothing to reduce')
      if (out.length >= before) return keep('nothing to reduce')
      return { bytes: out, before, after: out.length, note: `images reduced to ${dpi} dpi`, changed: true }
    }
    const native = await scanResolution(bytes)
    if (native <= dpi) return keep(`already ${Math.round(native)} dpi`)
    const out = await redrawPage(bytes, dpi, native, onStage)
    if (out.length >= before) return keep('nothing to reduce')
    return { bytes: out, before, after: out.length, note: `scan redrawn at ${dpi} dpi`, changed: true }
  } catch (e) {
    return keep(e instanceof Error ? e.message : 'could not be reduced')
  }
}
