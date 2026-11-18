import { PDFDocument } from 'pdf-lib'
import { readFile, type ProjectStore } from '../files'
import { sortSheets, type Discipline } from '../disciplines'

/**
 * Gather sheets into one PDF to hand over: a record set, or the package for one addendum, ASI or
 * bulletin.
 *
 * Sheets are stored one file per sheet, which is what makes revisions and searching work, but it
 * is not what anyone sends. A set goes out as a single file, in sheet order, named for what it is.
 */

export interface BundleSheet {
  number: string
  title: string | null
  revisionLabel: string | null
  filePath: string
}

export interface Bundle {
  bytes: Uint8Array
  sheets: number
  /** Sheets that couldn't be read, by number. The rest are still bundled. */
  missing: string[]
}

/** A file name that says what this is: "24-1043 - Addendum 2 - 2026-10-29.pdf". */
export function bundleName(projectNumber: string | undefined, label: string, date?: string): string {
  const parts = [projectNumber, label, date].filter(Boolean)
  return `${parts.join(' - ').replace(/[\\/:*?"<>|]/g, '-')}.pdf`
}

export async function bundleSheets(
  project: ProjectStore,
  sheets: BundleSheet[],
  order: Discipline[],
  onProgress?: (done: number, total: number, sheet: string) => void,
): Promise<Bundle> {
  const ordered = sortSheets(sheets, (s) => s.number, order)
  const out = await PDFDocument.create()
  const missing: string[] = []

  for (const [i, sheet] of ordered.entries()) {
    onProgress?.(i, ordered.length, sheet.number)
    try {
      const doc = await PDFDocument.load(await readFile(project, sheet.filePath), { ignoreEncryption: true })
      const pages = await out.copyPages(doc, doc.getPageIndices())
      for (const page of pages) out.addPage(page)
    } catch {
      // One unreadable sheet shouldn't cost the whole set; say which at the end instead.
      missing.push(sheet.number)
    }
    // Let the page keep up: this is a network fetch and a parse per sheet.
    await new Promise((r) => setTimeout(r, 0))
  }

  onProgress?.(ordered.length, ordered.length, 'writing')
  out.setTitle(`${ordered.length} sheets`)
  out.setProducer('CAzen')
  return { bytes: await out.save(), sheets: ordered.length - missing.length, missing }
}

/** Hand a finished bundle to the browser to save. */
export function saveBundle(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Several single pages as one PDF, for a cover that ran to more than a page. */
export async function joinPages(pages: Uint8Array[]): Promise<Uint8Array> {
  if (pages.length === 1) return pages[0]
  const out = await PDFDocument.create()
  for (const bytes of pages) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p)
  }
  return out.save()
}
