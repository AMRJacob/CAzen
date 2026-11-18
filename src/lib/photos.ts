import { putFile, readFile, SECTIONS, type ProjectStore } from './files'
import { cacheFile, fileFromCache } from './offline/store'

/**
 * Photographs taken on site.
 *
 * A phone camera makes a 4-megapixel JPEG of a cracked sealant joint, and nobody needs four
 * megapixels of it: what it has to do is show the crack on a screen and print on a field
 * report. So a photo is resized before it ever leaves the phone — which is also what makes it
 * possible to take thirty of them on site data and sync them later without burning the morning.
 *
 * They go where every other file goes: the project's own storage, under Field Reports.
 */

/** The longest side a stored photo is allowed, in pixels. Enough for a full-width print. */
const LONGEST = 2000
/** JPEG quality. 0.8 is where the artefacts stop being visible on a photograph. */
const QUALITY = 0.8

/**
 * A photo, shrunk and turned into a JPEG.
 *
 * The orientation tag is honoured by createImageBitmap, so a picture taken sideways comes out
 * the way it was taken rather than the way the sensor read it.
 */
export async function shrink(file: File | Blob): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser will not resize images.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('This browser will not resize images.')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
}

/** A name that sorts by when it was taken and says what it belongs to. */
function photoName(prefix: string, n: number): string {
  const d = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${prefix} ${stamp}${n > 1 ? ` (${n})` : ''}.jpg`
}

/**
 * Take a photo into the project's storage and hand back the path to keep.
 *
 * The shrunk copy is also kept on this device, so it is on screen the moment it is taken
 * rather than after a round trip to storage it may not have signal for.
 */
export async function keepPhoto(project: ProjectStore, file: File | Blob, about: string, n = 1): Promise<string> {
  const { bytes } = await shrink(file)
  const name = photoName(about, n)
  const path = await putFile(
    project, bytes,
    `${project.id}/photos/${name}`,
    { dirs: [SECTIONS.fieldReports, 'Photos'], name },
    'image/jpeg',
  )
  await cacheFile(path, project.id, new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
    .catch(() => { /* the copy in storage is the one that matters */ })
  return path
}

/**
 * A photo as something an <img> can show.
 *
 * The device's own copy answers first, because on site it is usually the only copy there is.
 * Callers revoke the URL when they are done with it.
 */
export async function photoUrl(project: ProjectStore, path: string): Promise<string> {
  const cached = await fileFromCache(path).catch(() => null)
  if (cached) return URL.createObjectURL(cached)
  const bytes = await readFile(project, path)
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
}
