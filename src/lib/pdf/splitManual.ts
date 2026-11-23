import { PDFDocument } from 'pdf-lib'
import { getDocument } from './pdfjs'
import { pageBody, readPageText } from './pageText'
import type { ManualPage } from './specRead'

export * from './specRead'

/** Read every page of a manual. Nothing is decided here and nothing is written. */
export async function readManual(
  file: ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<ManualPage[]> {
  const reader = await getDocument({ data: new Uint8Array(file.slice(0)) }).promise
  const pages: ManualPage[] = []
  for (let i = 0; i < reader.numPages; i++) {
    const text = await readPageText(await reader.getPage(i + 1))
    pages.push({ index: i, text, found: null, declares: false, at: null, of: null, ends: false })
    onProgress?.(i + 1, reader.numPages)
  }
  await reader.loadingTask.destroy()
  return pages
}

/** Cut the pages of one section out of the uploaded PDF. */
export async function cutSection(file: ArrayBuffer, pages: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(file, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const copied = await out.copyPages(source, pages)
  for (const p of copied) out.addPage(p)
  return out.save()
}

/** The words of a section, for searching it. */
export const bodyOf = (pages: ManualPage[]) => pages.map((p) => pageBody(p.text)).join('\n')

