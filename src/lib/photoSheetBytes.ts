import { readFile, type ProjectStore } from './files'
import { fileFromCache } from './offline/store'
import { whole, type Crop } from './photoSheet'
import type { PagePhoto } from './templates/photoPages'

/** One photograph as the dialog holds it: whether it prints, what it is called, what part of it. */
export interface SheetItem { path: string; label: string; use: boolean; crop?: Crop | null }
export interface SheetState { on: boolean; perRow: number; items: SheetItem[] }

/** Long side of a photograph in the table. A row is a few inches high; this is 250 dpi of it. */
const LONGEST = 1500

async function blobOf(project: ProjectStore, path: string): Promise<Blob> {
  const cached = await fileFromCache(path).catch(() => null)
  if (cached) return cached
  return new Blob([(await readFile(project, path)) as BlobPart], { type: 'image/jpeg' })
}

/** The photographs that print, each cut to its crop and sized for the page. */
export async function photosForPdf(project: ProjectStore, state: SheetState): Promise<PagePhoto[]> {
  const out: PagePhoto[] = []
  for (const item of state.items.filter((i) => i.use)) {
    const bitmap = await createImageBitmap(await blobOf(project, item.path), { imageOrientation: 'from-image' })
    const c = whole(item.crop) ? { x: 0, y: 0, w: 1, h: 1 } : item.crop!
    const sx = c.x * bitmap.width, sy = c.y * bitmap.height, sw = c.w * bitmap.width, sh = c.h * bitmap.height
    const k = Math.min(1, LONGEST / Math.max(sw, sh))
    const width = Math.max(1, Math.round(sw * k)), height = Math.max(1, Math.round(sh * k))
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser will not prepare photographs for printing.')
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.82))
    if (!blob) throw new Error('This browser will not prepare photographs for printing.')
    out.push({ id: item.path, bytes: new Uint8Array(await blob.arrayBuffer()), width, height, label: item.label })
  }
  return out
}

/** The dialog's state for a set of photographs, keeping what was decided about each before. */
export function sheetFor(photos: { path: string; label: string }[], kept: SheetState | null): SheetState {
  const was = new Map((kept?.items ?? []).map((i) => [i.path, i]))
  const fresh = photos.map((p) => was.get(p.path) ?? { path: p.path, label: p.label, use: true })
  // What was put in an order stays in it; photographs taken since go on the end.
  const order = new Map((kept?.items ?? []).map((i, n) => [i.path, n]))
  fresh.sort((a, b) => (order.get(a.path) ?? 1e6) - (order.get(b.path) ?? 1e6))
  return { on: kept?.on ?? false, perRow: kept?.perRow ?? 2, items: fresh }
}
