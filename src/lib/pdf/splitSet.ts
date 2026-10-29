import { PDFDocument } from 'pdf-lib'
import { getDocument } from './pdfjs'
import { readPageText, type PageText } from './pageText'

export interface SplitSheet {
  pageIndex: number
  /** The page's words, positioned as displayed; empty when the page is a scan. */
  text: PageText
  bytes: Uint8Array
}

/** Split a combined drawing-set PDF into one PDF per page, keeping each page's text for reading the title block. */
export async function splitDrawingSet(file: ArrayBuffer, onProgress?: (done: number, total: number) => void): Promise<SplitSheet[]> {
  const source = await PDFDocument.load(file, { ignoreEncryption: true })
  const reader = await getDocument({ data: new Uint8Array(file.slice(0)) }).promise
  const out: SplitSheet[] = []
  const total = source.getPageCount()

  for (let i = 0; i < total; i++) {
    const single = await PDFDocument.create()
    const [page] = await single.copyPages(source, [i])
    single.addPage(page)
    out.push({
      pageIndex: i,
      text: await readPageText(await reader.getPage(i + 1)),
      bytes: await single.save(),
    })
    onProgress?.(i + 1, total)
  }
  await reader.loadingTask.destroy()
  return out
}
