import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

export { getDocument }

async function pageToPng(bytes: Uint8Array, scaleFor: (width: number) => number): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice() }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: scaleFor(base.width) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    return canvas.toDataURL('image/png')
  } finally {
    // Hand the worker's copy of the file back; a 200-page upload previewed page by page would
    // otherwise hold every one of them.
    await pdf.loadingTask.destroy()
  }
}

/** Render page 1 of a PDF to a PNG data URL (used to show a letterhead behind the editor). */
export const pdfPageImage = (bytes: Uint8Array, scale = 1.5) => pageToPng(bytes, () => scale)

/**
 * Render page 1 to a PNG data URL about `width` pixels across, whatever size paper it is on.
 * A thumbnail wants a width, not a scale: 0.3 of a letter page and 0.3 of a 36 x 24 sheet are
 * nothing like each other.
 */
export const pdfPageThumb = (bytes: Uint8Array, width: number) => pageToPng(bytes, (w) => width / w)
