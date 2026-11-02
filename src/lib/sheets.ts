import { db } from './supabase'
import { copyToFolder, deleteProjectCloudFiles, deleteStoredFiles, folderReady, isFolderPath, isR2Path, openFile, putFile, SECTIONS, type ProjectStore } from './files'
import { backupProject } from './projectData'
import type { CurrentSheet, IssuanceKind, SheetRevision } from './types'

export interface IssuanceInput {
  kind: IssuanceKind
  number: string
  title?: string
  issuedOn: string // YYYY-MM-DD
}

export interface SheetToSave {
  number: string
  title: string
  revisionLabel: string
  bytes: Uint8Array
  /** The sheet's words, for search. */
  body?: string
}

export async function listCurrentSheets(projectId: string): Promise<CurrentSheet[]> {
  const { data, error } = await db()
    .from('current_sheets')
    .select('*')
    .eq('project_id', projectId)
    .order('number')
  if (error) throw error
  return (data ?? []) as CurrentSheet[]
}

export async function listSheetsAsOf(projectId: string, date: string) {
  const { data, error } = await db().rpc('sheets_as_of', { p_project: projectId, p_date: date })
  if (error) throw error
  return (data ?? []) as { sheet_number: string; sheet_title: string | null; revision_index: number; file_path: string; issued_on: string }[]
}

export async function listRevisions(sheetId: string): Promise<SheetRevision[]> {
  const { data, error } = await db()
    .from('sheet_revisions')
    .select('id, revision_index, revision_label, title_at_rev, file_path, created_at, issuances(kind, number, issued_on)')
    .eq('sheet_id', sheetId)
    .order('revision_index', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as SheetRevision[]
}

/** Open a stored sheet PDF in a new tab, from cloud storage or the project folder. */
export const openStoredPdf = (project: ProjectStore, path: string) => openFile(project, path)

/**
 * Save an issuance (bid set, addendum, ASI…) and one new revision per sheet in it.
 * Sheets that already exist get their next revision number; new sheet numbers become new sheets.
 * Nothing is overwritten: each revision is its own file.
 */
export async function saveIssuance(
  project: ProjectStore,
  issuance: IssuanceInput,
  sheets: SheetToSave[],
  onProgress?: (done: number, total: number) => void,
) {
  const client = db()
  const projectId = project.id
  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id
  // In a project folder, each upload round gets its own folder: "2026-02-10 Addendum 1".
  const kindLabel: Record<IssuanceKind, string> = { bid_set: 'Bid Set', conformed_set: 'Conformed Set', addendum: 'Addendum', asi: 'ASI', bulletin: 'Bulletin', ccd: 'CCD', change_order: 'Change Order', other: 'Revision' }
  const setFolder = `${issuance.issuedOn} ${issuance.number || kindLabel[issuance.kind]}`

  const { data: iss, error: issErr } = await client
    .from('issuances')
    .insert({
      project_id: projectId,
      kind: issuance.kind,
      number: issuance.number || null,
      title: issuance.title || null,
      issued_on: issuance.issuedOn,
      created_by: userId,
    })
    .select()
    .single()
  if (issErr) throw issErr

  let done = 0
  for (const s of sheets) {
    const number = s.number.trim().toUpperCase()

    // Find or create the sheet slot.
    let { data: sheet } = await client
      .from('sheets').select('id, title').eq('project_id', projectId).eq('number', number).maybeSingle()
    if (!sheet) {
      const created = await client
        .from('sheets')
        .insert({ project_id: projectId, number, title: s.title || null, discipline: number.match(/^[A-Z]+/)?.[0] ?? null })
        .select('id, title')
        .single()
      if (created.error) throw created.error
      sheet = created.data
    }

    // Next revision number for this sheet.
    const { count } = await client
      .from('sheet_revisions').select('id', { count: 'exact', head: true }).eq('sheet_id', sheet.id)
    const revisionIndex = count ?? 0

    let path: string
    try {
      path = await putFile(project, s.bytes, `${projectId}/sheets/${sheet.id}/${revisionIndex}.pdf`, {
        dirs: [SECTIONS.drawings, setFolder],
        name: `${number}${s.title ? ' ' + titleCase(s.title) : ''}${s.revisionLabel ? ` (Rev ${s.revisionLabel})` : ''}.pdf`,
      })
    } catch (e) {
      throw new Error(`${number}: ${e instanceof Error ? e.message : String(e)}`)
    }

    const rev = await client.from('sheet_revisions').insert({
      sheet_id: sheet.id,
      issuance_id: iss.id,
      revision_index: revisionIndex,
      revision_label: s.revisionLabel || null,
      title_at_rev: s.title || sheet.title || null,
      file_path: path,
      created_by: userId,
    }).select('id').single()
    if (rev.error) throw new Error(`${number}: ${rev.error.message}`)

    // Words on the sheet, for search. A failure here doesn't lose the sheet.
    if (s.body?.trim()) {
      await client.from('sheet_text').insert({ revision_id: rev.data.id, project_id: projectId, body: s.body })
    }

    onProgress?.(++done, sheets.length)
  }
}

export interface SearchHit {
  sheet_id: string
  revision_id: string
  number: string
  title: string | null
  revision_index: number
  file_path: string
  is_current: boolean
  snippet: string
}

/** Words on the sheets themselves. Current set only unless allRevisions. */
export async function searchSheets(projectId: string, query: string, allRevisions = false): Promise<SearchHit[]> {
  const { data, error } = await db().rpc('search_sheets', { p_project: projectId, p_query: query, p_all_revisions: allRevisions })
  if (error) throw error
  return (data ?? []) as SearchHit[]
}

export interface IssuanceRow {
  id: string
  kind: IssuanceKind
  number: string | null
  title: string | null
  issued_on: string
  sheets: { number: string; revision_label: string | null }[]
}

/** Every set or revision round uploaded, newest first, with the sheets it brought in. */
export async function listIssuances(projectId: string): Promise<IssuanceRow[]> {
  const { data, error } = await db()
    .from('issuances')
    .select('id, kind, number, title, issued_on, created_at, sheet_revisions(revision_label, sheets(number))')
    .eq('project_id', projectId)
    .order('issued_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  type Raw = Omit<IssuanceRow, 'sheets'> & { sheet_revisions: { revision_label: string | null; sheets: { number: string } | null }[] }
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id, kind: r.kind, number: r.number, title: r.title, issued_on: r.issued_on,
    sheets: r.sheet_revisions.map((x) => ({ number: x.sheets?.number ?? '', revision_label: x.revision_label })),
  }))
}

/** "FIRST FLOOR PLAN" → "First Floor Plan" for file names; mixed-case titles are left alone. */
function titleCase(t: string) {
  if (t !== t.toUpperCase()) return t
  const small = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
  return t.toLowerCase().split(' ').map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/^([a-z])/, (m) => m.toUpperCase()))).join(' ')
}

/** Every stored file of a project (all sheet revisions and issued forms), for copying to the project folder. */
export async function projectFilePaths(projectId: string): Promise<string[]> {
  const [revs, forms] = await Promise.all([
    db().from('sheet_revisions').select('file_path, sheets!inner(project_id)').eq('sheets.project_id', projectId),
    db().from('issued_forms').select('file_path').eq('project_id', projectId),
  ])
  if (revs.error) throw revs.error
  if (forms.error) throw forms.error
  return [...(revs.data ?? []), ...(forms.data ?? [])].map((r) => (r as { file_path: string | null }).file_path).filter((p): p is string => !!p)
}

/** setof text from an RPC comes back as strings (or one-key rows); take the text either way. */
const asPaths = (data: unknown) => ((data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : String(Object.values(x as object)[0] ?? ''))).filter(Boolean)

/** Delete one upload round (firm admins): its records, then its files. Sheets fall back to their previous revision. */
export async function deleteIssuance(project: ProjectStore, issuanceId: string, alsoFolder: boolean) {
  const { data, error } = await db().rpc('delete_issuance', { p_issuance: issuanceId })
  if (error) throw error
  return deleteStoredFiles(project, asPaths(data), alsoFolder)
}

/** Delete one revision of a sheet (firm admins). */
export async function deleteRevision(project: ProjectStore, revisionId: string, alsoFolder: boolean) {
  const { data, error } = await db().rpc('delete_revision', { p_revision: revisionId })
  if (error) throw error
  return deleteStoredFiles(project, asPaths(data), alsoFolder)
}

/** Delete a whole project (firm admins): every record, then every cloud file. Project-folder copies are left alone. */
export async function deleteProject(project: ProjectStore) {
  const { error } = await db().from('projects').delete().eq('id', project.id)
  if (error) throw error
  // Nothing deleted means the database refused (not an admin, or already gone).
  const { data: still } = await db().from('projects').select('id').eq('id', project.id).maybeSingle()
  if (still) throw new Error('Only firm admins can delete projects.')
  if (project.storage === 'r2' || !project.storage) return deleteProjectCloudFiles(project.id)
  return { deleted: 0, failed: 0 }
}

/**
 * Archive a finished project (firm admins), in steps that stop at the first problem:
 * copy every file into the project folder and check each one is there, save the project data
 * there too, point the records at the folder copies, then remove the files from the cloud.
 */
export async function archiveProject(project: ProjectStore & { number?: string }, step: (msg: string) => void) {
  if (!(await folderReady(project.id))) throw new Error('Connect the project folder on this computer first.')
  step('Listing files…')
  const paths = await projectFilePaths(project.id)
  const other = paths.filter((p) => !isR2Path(p) && !isFolderPath(p))
  if (other.length) throw new Error(`${other.length} files are in CAzen’s starter storage, which archiving doesn’t handle yet. Nothing was changed.`)
  const r = await copyToFolder(project, paths, (d, t) => step(`Copying files to the project folder: ${d} of ${t}…`))
  if (r.failed) throw new Error(`${r.failed} of ${r.total} files couldn’t be copied to the project folder, so nothing was removed from the cloud. Try again.`)
  step('Saving the project data…')
  await backupProject(project)
  step('Pointing the records at the folder copies…')
  const { error } = await db().rpc('archive_project', { p_project: project.id })
  if (error) throw error
  step('Removing the files from the cloud…')
  const d = await deleteProjectCloudFiles(project.id)
  return { copied: r.copied, alreadyThere: r.already, removedFromCloud: d.deleted, failedToRemove: d.failed }
}
