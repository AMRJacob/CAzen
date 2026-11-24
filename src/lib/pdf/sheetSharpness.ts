import { PDFDocument } from 'pdf-lib'
import { imagesOnPage } from './shrink'
import { sharpnessOf, type Sharpness } from './sharpness'

/**
 * Read a one-sheet PDF's pictures and say how sharp it can be shown: see sharpness.ts. Returns
 * null when the file can't be read this way (it is then shown as it is, with nothing said).
 */
export async function sheetSharpness(bytes: Uint8Array): Promise<Sharpness | null> {
  try {
    const doc = await PDFDocument.load(bytes.slice() as unknown as ArrayBuffer, { ignoreEncryption: true, updateMetadata: false })
    const page = doc.getPage(0)
    const { width, height } = page.getSize()
    return sharpnessOf(imagesOnPage(doc, 0), width, height)
  } catch {
    return null
  }
}
