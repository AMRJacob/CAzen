import { db } from './supabase'
import { putFile, readFile, SECTIONS, type ProjectStore } from './files'
import { splitDrawingSet, type SplitSheet } from './pdf/splitSet'
import { joinPages } from './pdf/bundle'
import { pageBody } from './pdf/pageText'
import type { IssuanceKind } from './types'

/**
 * A change document already saved, opened again as its pages so they can be sorted again.
 *
 * Its pages come back from where they were filed: the cover from the issuance's cover file, each
 * drawing from its sheet revision, each manual page from its section revision. Every page knows
 * where it came from (`Origin`), so when the sorting is saved only what moved is touched — a page
 * left where it was is not written again.
 */

export type Origin =
  | { t: 'cover' }
  | { t: 'sheet'; revId: string; number: string; title: string | null; label: string | null; date: string | null }
  | { t: 'spec'; revId: string; sectionId: string; number: string; title: string | null }

export interface ReopenedPage { origin: Origin; page: SplitSheet }

export interface SpecRev { revId: string; sectionId: string; revisionIndex: number; number: string; title: string | null; pages: number }

export interface Reopened {
  issuance: { id: string; kind: IssuanceKind; number: string | null; title: string | null; issued_on: string; cover_path: string | null }
  pages: ReopenedPage[]
  specRevs: SpecRev[]
}

export async function reopenIssuance(
  project: ProjectStore,
  issuanceId: string,
  onProgress?: (what: string) => void,
): Promise<Reopened> {
  const client = db()
  const { data: iss, error } = await client.from('issuances')
    .select('id, kind, number, title, issued_on, cover_path').eq('id', issuanceId).single()
  if (error) throw error
  const issuance = iss as Reopened['issuance']

  const { data: sheetRows, error: sErr } = await client.from('sheet_revisions')
    .select('id, revision_label, sheet_date, title_at_rev, file_path, sheets(number, title)').eq('issuance_id', issuanceId)
  if (sErr) throw sErr
  const { data: specRows, error: pErr } = await client.from('spec_revisions')
    .select('id, section_id, revision_index, title_at_rev, pages, file_path, spec_sections(number, title)').eq('issuance_id', issuanceId)
  if (pErr) throw pErr

  type SheetRow = { id: string; revision_label: string | null; sheet_date: string | null; title_at_rev: string | null; file_path: string; sheets: { number: string; title: string | null } | null }
  type SpecRow = { id: string; section_id: string; revision_index: number; title_at_rev: string | null; pages: number | null; file_path: string; spec_sections: { number: string; title: string | null } | null }
  const sheets = ((sheetRows ?? []) as unknown as SheetRow[])
    .sort((a, b) => (a.sheets?.number ?? '').localeCompare(b.sheets?.number ?? '', undefined, { numeric: true }))
  const specs = ((specRows ?? []) as unknown as SpecRow[])
    .sort((a, b) => (a.spec_sections?.number ?? '').localeCompare(b.spec_sections?.number ?? '', undefined, { numeric: true }))

  const pages: ReopenedPage[] = []
  const split = async (path: string, what: string) => {
    onProgress?.(what)
    const bytes = await readFile(project, path)
    return splitDrawingSet(bytes.slice().buffer, undefined, {})
  }
  // In the order a change document is bound: cover, manual, drawings.
  if (issuance.cover_path) {
    for (const p of await split(issuance.cover_path, 'the cover')) pages.push({ origin: { t: 'cover' }, page: p })
  }
  const specRevs: SpecRev[] = []
  for (const r of specs) {
    const number = r.spec_sections?.number ?? ''
    const title = r.title_at_rev ?? r.spec_sections?.title ?? null
    const got = await split(r.file_path, number)
    specRevs.push({ revId: r.id, sectionId: r.section_id, revisionIndex: r.revision_index, number, title, pages: got.length })
    for (const p of got) pages.push({ origin: { t: 'spec', revId: r.id, sectionId: r.section_id, number, title }, page: p })
  }
  for (const r of sheets) {
    const number = r.sheets?.number ?? ''
    for (const p of await split(r.file_path, number)) {
      pages.push({ origin: { t: 'sheet', revId: r.id, number, title: r.title_at_rev ?? r.sheets?.title ?? null, label: r.revision_label, date: r.sheet_date }, page: p })
    }
  }
  // One running page number across the whole document, as if it were one PDF again.
  pages.forEach((p, i) => { p.page = { ...p.page, pageIndex: i } })
  return { issuance, pages, specRevs }
}

/**
 * Apply a new sorting to a saved change document. The caller has already added whatever moved
 * *into* the drawings or the manual (with saveIssuance / saveManual, `into` this issuance), so the
 * document is never left empty part-way; this takes away what moved *out*:
 *
 * - a drawing moved away: its sheet revision is deleted (as Delete does on the revision);
 * - manual pages moved away: the section revision is put together again from the pages left, or
 *   deleted if none are;
 * - the cover: made again from the pages now marked cover, or cleared if none are.
 */
export async function takeAwayMoved(project: ProjectStore, args: {
  issuanceId: string
  setFolder: string
  /** Sheet revisions whose page is no longer a drawing. */
  dropSheets: string[]
  /** Section revisions that lost pages: the pages each keeps, in order. */
  specs: { rev: SpecRev; keep: SplitSheet[] }[]
  /** The cover's pages now, or undefined when the cover did not change. */
  cover?: SplitSheet[]
  onProgress?: (what: string) => void
}): Promise<void> {
  const client = db()
  const projectId = project.id

  for (const { rev, keep } of args.specs) {
    args.onProgress?.(rev.number)
    if (!keep.length) {
      await client.from('spec_text').delete().eq('revision_id', rev.revId)
      const { error } = await client.from('spec_revisions').delete().eq('id', rev.revId)
      if (error) throw new Error(`${rev.number}: ${error.message}`)
      // A section that was only ever this revision goes with it.
      const { count } = await client.from('spec_revisions').select('id', { count: 'exact', head: true }).eq('section_id', rev.sectionId)
      if (!count) await client.from('spec_sections').delete().eq('id', rev.sectionId)
      continue
    }
    const bytes = await joinPages(keep.map((p) => p.bytes))
    const path = await putFile(project, bytes, `${projectId}/specs/${rev.sectionId}/${rev.revisionIndex}-${Date.now().toString(36)}.pdf`, {
      dirs: [SECTIONS.manual, args.setFolder],
      name: `${rev.number}${rev.title ? ' ' + rev.title : ''}.pdf`,
    })
    const { error } = await client.from('spec_revisions')
      .update({ file_path: path, pages: keep.length, bytes: bytes.length }).eq('id', rev.revId)
    if (error) throw new Error(`${rev.number}: ${error.message}`)
    const body = keep.map((p) => pageBody(p.text)).join('\n')
    await client.from('spec_text').delete().eq('revision_id', rev.revId)
    if (body.trim()) await client.from('spec_text').insert({ revision_id: rev.revId, project_id: projectId, body })
  }

  if (args.cover) {
    args.onProgress?.('the cover')
    let path: string | null = null
    if (args.cover.length) {
      const bytes = await joinPages(args.cover.map((p) => p.bytes))
      path = await putFile(project, bytes, `${projectId}/covers/${args.issuanceId}-${Date.now().toString(36)}.pdf`, { dirs: [SECTIONS.drawings, args.setFolder], name: 'Cover.pdf' })
    }
    const { error } = await client.from('issuances').update({ cover_path: path }).eq('id', args.issuanceId)
    if (error) throw error
    // The change register's entry for the document points at its cover.
    await client.from('issued_forms').update({ file_path: path }).eq('issuance_id', args.issuanceId)
  }

  // Last, because deleting the last revision of a set removes the set (delete_revision).
  for (const id of args.dropSheets) {
    args.onProgress?.('drawings')
    const { error } = await client.rpc('delete_revision', { p_revision: id })
    if (error) throw error
  }
}
