import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

export { getDocument }

/** Render page 1 of a PDF to a PNG data URL (used to show a letterhead behind the editor). */
export async function pdfPageImage(bytes: Uint8Array, scale = 1.5): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
  return canvas.toDataURL('image/png')
}
