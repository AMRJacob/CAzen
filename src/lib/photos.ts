import { plannedPath, putFile, readFile, SECTIONS, type ProjectStore } from './files'
import { queue } from './offline/outbox'
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
  // The last three characters are chance. The name is settled on this device, possibly with no
  // signal, and has to be one that nobody else's phone settled on in the same second.
  const tail = Math.random().toString(36).slice(2, 5).padEnd(3, 'x')
  return `${prefix} ${stamp}${n > 1 ? ` (${n})` : ''} ${tail}.jpg`
}

/**
 * Keep a photo and hand back the path it will be found at.
 *
 * It is kept on this device first and sent afterwards, through the same outbox as everything else
 * written on site. So it is on screen the moment it is taken, a page can point at it straight
 * away, and thirty of them taken in a basement with no signal are thirty uploads waiting for the
 * car park rather than thirty errors.
 */
export async function keepPhoto(project: ProjectStore, file: File | Blob, about: string, n = 1): Promise<string> {
  const { bytes } = await shrink(file)
  const name = photoName(about, n)
  const cloudPath = `${project.id}/photos/${name}`
  const folder = { dirs: [SECTIONS.fieldReports, 'Photos'], name }
  const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' })

  const path = plannedPath(project, cloudPath, folder)
  if (!path) {
    // A project kept in a folder on this computer: written straight there, no network involved.
    const written = await putFile(project, bytes, cloudPath, folder, 'image/jpeg')
    await cacheFile(written, project.id, blob).catch(() => {})
    return written
  }
  // This copy is, for now, the only one. If the device won't keep it, that is said.
  await cacheFile(path, project.id, blob)
  await queue(project.id, { kind: 'file.put', path, storage: project.storage ?? null, type: 'image/jpeg' })
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
