/**
 * How far a sheet can be zoomed before it goes soft — the pure arithmetic, kept free of pdf.js and
 * pdf-lib so it can be tested in Node. Reading a file's images is in sheetSharpness.ts.
 *
 * Vector linework and text are drawn again from the file at whatever size they are shown, so they
 * are sharp at every zoom. What can't be made sharper is a picture: a scan, or a drawing exported
 * with its linework as an image (some CAD and MEP exports do this, and so does flattening). A
 * picture has as many pixels as it has; past the zoom where one of its pixels covers more than one
 * of the screen's, it gets visibly blocky, and nothing in the viewer can put detail back.
 */

/** The viewer's deepest zoom (800% of the sheet fitted to the window). */
export const MAX_ZOOM = 8

/** An image takes in this share of the sheet or more: it is the drawing itself, not a logo or a photo. */
export const CONTENT_SHARE = 0.15

export interface ImageOnSheet {
  /** Pixels across and down. */
  width: number
  height: number
  /** How large it is drawn, in points (1/72 in). Zero when the file didn't say. */
  drawnWidth: number
  drawnHeight: number
}

export interface Sharpness {
  /** The lowest resolution among the pictures that make up the drawing; null when it is vector throughout. */
  dpi: number | null
  /** Share of the sheet those pictures cover, 0–1. */
  share: number
  /** Pictures counted as the drawing. */
  pictures: number
  /** Width of the sheet, in points. */
  pageWidth: number
}

/** The pictures that are the drawing, and the resolution the softest of them gives. */
export function sharpnessOf(images: ImageOnSheet[], pageWidth: number, pageHeight: number): Sharpness {
  const area = Math.max(1, pageWidth * pageHeight)
  let dpi: number | null = null
  let share = 0
  let pictures = 0
  for (const im of images) {
    // An image whose drawn size wasn't given is taken to fill the sheet, which no image can exceed.
    const w = im.drawnWidth || pageWidth
    const h = im.drawnHeight || (im.drawnWidth ? (im.height / im.width) * w : pageHeight)
    const covers = Math.min(1, (w * h) / area)
    if (covers < CONTENT_SHARE) continue
    // Pixels per inch along each side; the lower one decides.
    const d = Math.min(im.width / (w / 72), im.height / (h / 72))
    if (!(d > 0)) continue
    pictures++
    share = Math.min(1, share + covers)
    dpi = dpi === null ? d : Math.min(dpi, d)
  }
  return { dpi: dpi === null ? null : Math.round(dpi), share, pictures, pageWidth }
}

/**
 * The zoom (1 = the sheet fitted to the window) at which one of the picture's pixels becomes one of
 * the screen's. Past it, the picture is being enlarged. `fitPixels` is the sheet's width in device
 * pixels when fitted. Infinity when the sheet is vector.
 */
export function sharpZoom(s: Pick<Sharpness, 'dpi' | 'pageWidth'>, fitPixels: number): number {
  if (s.dpi === null) return Infinity
  return (s.dpi * (s.pageWidth / 72)) / Math.max(1, fitPixels)
}

/** The resolution a picture needs to stay sharp at the deepest zoom, on a sheet this wide. */
export function dpiForMaxZoom(pageWidth: number, fitPixels: number): number {
  return Math.ceil((MAX_ZOOM * fitPixels) / (pageWidth / 72))
}

/**
 * The sheet's width in device pixels when the viewer fits it to this window: the viewer leaves a
 * margin and a toolbar, and fits the whole sheet, so a wide sheet is limited by the window's height.
 * Device pixels are capped at 2 per CSS pixel, as the viewer draws.
 */
export function fitPixelsHere(pageWidth: number, pageHeight: number, win: { innerWidth: number; innerHeight: number; devicePixelRatio?: number }): number {
  const aspect = pageWidth / Math.max(1, pageHeight)
  const css = Math.max(240, Math.min(win.innerWidth - 24, (win.innerHeight - 80) * aspect))
  return css * Math.min(win.devicePixelRatio || 1, 2)
}

/** "about 280%", for a zoom factor. */
export const percent = (z: number) => `${Math.round((z * 100) / 10) * 10}%`
