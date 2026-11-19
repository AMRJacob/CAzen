import { db } from './supabase'
import { copyToFolder, deleteProjectCloudFiles, deleteStoredFiles, folderReady, isFolderPath, isR2Path, openFile, putFile, SECTIONS, type ProjectStore } from './files'
import { backupProject } from './projectData'
import type { CurrentSheet, IssuanceKind, SheetRevision } from './types'
import type { BundleSheet } from './pdf/bundle'
import { all as localAll } from './offline/store'

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
  /** The date printed on the sheet itself, where its title block carries one. */
  sheetDate?: string | null
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

type Row = Record<string, unknown>
const localIssuances = async (projectId: string) =>
  new Map((await localAll<Row>('issuances', projectId)).map((i) => [i.id as string, i]))

/** The revisions this device holds, newest issue first, each with the issue it came in. */
async function localRevisions(projectId: string) {
  const issued = await localIssuances(projectId)
  return (await localAll<Row>('revisions', projectId))
    .map((r) => ({ r, i: issued.get(r.issuance_id as string) }))
    .filter((x): x is { r: Row; i: Row } => !!x.i)
    .sort((a, b) =>
      String(b.i.issued_on).localeCompare(String(a.i.issued_on)) ||
      (b.r.revision_index as number) - (a.r.revision_index as number))
}

/**
 * The current set, from the copy on this device — the same answer the current_sheets view gives,
 * worked out from the rows a project taken to the field brought with it. Empty when the project
 * isn't held here.
 */
export async function localCurrentSheets(projectId: string): Promise<CurrentSheet[]> {
  const sheets = await localAll<Row>('sheets', projectId)
  if (!sheets.length) return []
  const revs = await localRevisions(projectId)
  const out: CurrentSheet[] = []
  for (const s of sheets) {
    const mine = revs.filter((x) => x.r.sheet_id === s.id)
    const top = mine[0]
    if (!top) continue
    out.push({
      sheet_id: s.id as string,
      project_id: projectId,
      number: s.number as string,
      title: (top.r.title_at_rev as string | null) ?? (s.title as string | null) ?? null,
      discipline: (s.discipline as string | null) ?? null,
      filed_under: (s.filed_under as string | null) ?? null,
      is_void: !!s.is_void,
      revision_id: top.r.id as string,
      revision_index: top.r.revision_index as number,
      revision_label: (top.r.revision_label as string | null) ?? null,
      file_path: top.r.file_path as string,
      issuance_kind: top.i.kind as IssuanceKind,
      issuance_number: (top.i.number as string | null) ?? null,
      issued_on: top.i.issued_on as string,
      revision_count: mine.length,
    })
  }
  return out.sort((a, b) => a.number.localeCompare(b.number))
}

/** A sheet's history from the copy on this device. */
export async function localSheetRevisions(projectId: string, sheetId: string): Promise<SheetRevision[]> {
  return (await localRevisions(projectId))
    .filter((x) => x.r.sheet_id === sheetId)
    .sort((a, b) => (b.r.revision_index as number) - (a.r.revision_index as number))
    .map(({ r, i }) => ({
      id: r.id as string,
      revision_index: r.revision_index as number,
      revision_label: (r.revision_label as string | null) ?? null,
      sheet_date: (r.sheet_date as string | null) ?? null,
      title_at_rev: (r.title_at_rev as string | null) ?? null,
      file_path: r.file_path as string,
      created_at: r.created_at as string,
      issuances: { kind: i.kind as IssuanceKind, number: (i.number as string | null) ?? null, issued_on: i.issued_on as string },
    }))
}

export async function listSheetsAsOf(projectId: string, date: string) {
  const { data, error } = await db().rpc('sheets_as_of', { p_project: projectId, p_date: date })
  if (error) throw error
  return (data ?? []) as { sheet_number: string; sheet_title: string | null; revision_index: number; file_path: string; issued_on: string }[]
}

/** The discipline CAzen files a sheet under, from the characters before the first digit or dash. */
export const disciplineOf = (number: string) => (number.trim().match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase() || null

/**
 * Correct a sheet's number or title after the fact — a typo at upload, a titleblock read wrong.
 *
 * The number and title live on the sheet, and each revision also keeps the title it carried when
 * it was issued. A correction here fixes the sheet and the revision on screen, and leaves the
 * other revisions' titles alone: those are a record of what that issue actually said.
 *
 * filedUnder moves the sheet to another discipline without touching its number, for sheets whose
 * numbers don't say their trade. Empty or absent files it by its number again.
 */
export async function renameSheet(
  sheetId: string,
  next: { number: string; title: string; filedUnder?: string | null },
  revisionId?: string,
): Promise<void> {
  const number = next.number.trim()
  const title = next.title.trim()
  if (!number) throw new Error('A sheet needs a number.')
  // Filing is separate from numbering: a sheet can sit under M while still being called Q-101.
  const filedUnder = (next.filedUnder ?? '').trim().toUpperCase() || null

  const { error } = await db()
    .from('sheets')
    .update({ number, title: title || null, discipline: disciplineOf(number), filed_under: filedUnder })
    .eq('id', sheetId)
  if (error) {
    // unique (project_id, number)
    if (error.code === '23505') throw new Error(`${number} is already used by another sheet in this project.`)
    throw error
  }

  if (revisionId) {
    const { error: revError } = await db()
      .from('sheet_revisions')
      .update({ title_at_rev: title || null })
      .eq('id', revisionId)
    if (revError) throw revError
  }
}

export async function listRevisions(sheetId: string): Promise<SheetRevision[]> {
  try {
    const { data, error } = await db()
      .from('sheet_revisions')
      .select('id, revision_index, revision_label, sheet_date, title_at_rev, file_path, created_at, issuances(kind, number, issued_on)')
      .eq('sheet_id', sheetId)
      .order('revision_index', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as SheetRevision[]
  } catch (e) {
    // No signal: a sheet taken to the field still has its history on the device.
    const row = (await localAll<Row>('revisions').catch(() => [])).find((r) => r.sheet_id === sheetId)
    const here = row ? await localSheetRevisions(row.project_id as string, sheetId).catch(() => []) : []
    if (here.length) return here
    throw e
  }
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
): Promise<{ id: string; setFolder: string }> {
  const client = db()
  const projectId = project.id
  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id
  // In a project folder, each upload round gets its own folder: "2026-02-10 Addendum 1".
  const kindLabel: Record<IssuanceKind, string> = { bid_set: 'Bid Set', conformed_set: 'Conformed Set', addendum: 'Addendum', asi: 'ASI', bulletin: 'Bulletin', ccd: 'CCD', change_order: 'Change Order', pr: 'PR', other: 'Revision' }
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
      sheet_date: s.sheetDate || null,
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

  return { id: iss.id as string, setFolder }
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

/**
 * Correct how a set or revision round is labelled — the kind, its number, a title, the date it
 * went out. The sheets it brought in are untouched; only what the register calls it changes.
 */
export async function renameIssuance(
  issuanceId: string,
  next: { kind: IssuanceKind; number: string; title: string; issuedOn: string },
): Promise<void> {
  if (!next.issuedOn) throw new Error('A set needs an issue date.')
  const client = db()

  // What it was called, so sheets that took their revision label from the old name follow the
  // new one. A sheet whose mark came off its own title block is left alone — that is a record of
  // what the drawing says, not of what the set was called.
  const { data: before } = await client.from('issuances').select('number').eq('id', issuanceId).maybeSingle()
  const wasCalled = (before as { number: string | null } | null)?.number ?? null
  const nowCalled = next.number.trim() || null

  const { error } = await client
    .from('issuances')
    .update({ kind: next.kind, number: nowCalled, title: next.title.trim() || null, issued_on: next.issuedOn })
    .eq('id', issuanceId)
  if (error) throw error

  if (wasCalled !== nowCalled) {
    const { error: labelError } = await client
      .from('sheet_revisions')
      .update({ revision_label: nowCalled })
      .eq('issuance_id', issuanceId)
      .or(wasCalled ? `revision_label.eq.${wasCalled},revision_label.is.null` : 'revision_label.is.null')
    // The set is renamed either way; the labels following it are a convenience.
    if (labelError) console.warn('Sheet revision labels kept their old value:', labelError.message)
  }
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

/** The sheets one set or revision round brought in, for downloading that package. */
// BundleSheet is defined with the bundler, since that is what consumes it.
export async function listIssuanceSheets(issuanceId: string): Promise<BundleSheet[]> {
  const { data, error } = await db()
    .from('sheet_revisions')
    .select('revision_label, title_at_rev, file_path, sheets(number, title, filed_under)')
    .eq('issuance_id', issuanceId)
  if (error) throw error
  type Raw = { revision_label: string | null; title_at_rev: string | null; file_path: string; sheets: { number: string; title: string | null; filed_under: string | null } | null }
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    number: r.sheets?.number ?? '',
    title: r.title_at_rev ?? r.sheets?.title ?? null,
    revisionLabel: r.revision_label,
    filePath: r.file_path,
    filedUnder: r.sheets?.filed_under ?? null,
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

// ---------- Naming a set ----------

const KIND_WORD: Record<IssuanceKind, string> = {
  bid_set: 'Bid set', conformed_set: 'Conformed set', addendum: 'Addendum',
  asi: 'ASI', bulletin: 'Bulletin', ccd: 'CCD', change_order: 'Change Order', pr: 'PR', other: 'Revision',
}

/**
 * What to call a set, before anyone types anything.
 *
 * A set left unnamed shows up as its category and nothing else — two addenda a year apart both
 * reading "Addendum", with no way to tell from the register which is which. So the name is
 * suggested rather than asked for.
 *
 * The suggestion copies how this project already writes them rather than imposing one house
 * style, because the names are read off the drawings and the transmittals, not invented here: a
 * project whose last set was "Addendum #2" gets "Addendum #3", one whose last was "ASI-004" gets
 * "ASI-005", padding and all. The style carries across categories too — a project writing
 * "Addendum #2" gets "ASI #1" for its first ASI — since the punctuation is a habit of the person
 * typing, not of the category.
 *
 * Categories that only happen once on a job don't get a number; a bid set is the bid set.
 */
export function suggestSetName(kind: IssuanceKind, existing: SetName[]): string {
  const word = KIND_WORD[kind]
  if (kind === 'bid_set' || kind === 'conformed_set') return word

  const used = existing.filter((i) => i.kind === kind)
  // Follow on from the highest number already in use, so deleting the second of three doesn't
  // hand the next upload a name somebody is already holding.
  const highest = used.reduce((n, i) => Math.max(n, numberIn(i.number) ?? 0), 0)
  const next = Math.max(highest, used.length) + 1

  // This category's own last numbered set is the format to copy, wording and all. Failing that,
  // the last numbered set of any category, with its own word swapped for this one's.
  const sameKind = newest(used.filter((i) => numberIn(i.number) !== null))
  if (sameKind) return inFormatOf(sameKind.number ?? '', null, next)
  const anyKind = newest(existing.filter((i) => numberIn(i.number) !== null))
  return anyKind ? inFormatOf(anyKind.number ?? '', word, next) : `${word} ${next}`
}

export interface SetName {
  kind: IssuanceKind
  number: string | null
  issued_on?: string
  created_at?: string | null
}

/**
 * The counter at the end of a set's name, and how it is written.
 *
 * Sets are numbered two ways on real jobs — "Addendum 2" and "Addendum B" — so both count as a
 * sequence. A lone trailing letter only counts when something non-alphabetic comes before it,
 * which is what keeps the "m" of a bare "Addendum" from reading as number 13.
 */
function seqIn(name: string | null): { value: number; digits: number; letter: boolean } | null {
  const text = (name ?? '').trim()
  const num = /(\d+)\s*$/.exec(text)
  if (num) return { value: Number(num[1]), digits: num[1].length, letter: false }
  const alpha = /[^A-Za-z]([A-Za-z])$/.exec(text)
  if (alpha) return { value: alpha[1].toUpperCase().charCodeAt(0) - 64, digits: 1, letter: true }
  return null
}

const numberIn = (name: string | null) => seqIn(name)?.value ?? null

/** The set most recently issued; the later-created one breaks a tie on the same date. */
function newest(list: SetName[]): SetName | null {
  return list.reduce<SetName | null>((best, i) => {
    if (!best) return i
    const a = `${i.issued_on ?? ''}${i.created_at ?? ''}`
    const b = `${best.issued_on ?? ''}${best.created_at ?? ''}`
    return a > b ? i : best
  }, null)
}

/**
 * `next`, written the way `previous` was written: the same wording in front of it, the same
 * separator, the same zero padding, and letters where the project uses letters. "ASI-004" and 5
 * gives "ASI-005"; "Addendum No. 2" and 3 gives "Addendum No. 3"; "Addendum B" and 3 gives
 * "Addendum C"; a project numbering its sets plainly "2" gets "3".
 *
 * `word` swaps the leading category word, for borrowing one category's format for another —
 * "Addendum #2" with word "ASI" gives "ASI #1". Pass null to keep the wording as it stands,
 * which is what a set of the same category wants.
 */
export function inFormatOf(previous: string, word: string | null, next: number): string {
  const text = previous.trim()
  const seq = seqIn(text)
  if (!seq) return word ? `${word} ${next}` : String(next)
  const head = text.slice(0, text.length - (seq.letter ? 1 : seq.digits) - trailingSpace(text))
  const front = word === null ? head : head.replace(/^[A-Za-z]+/, word)
  // Letters run out at Z; past that it is a number, which is what a 27th addendum should be anyway.
  const counter = seq.letter && next <= 26
    ? String.fromCharCode(64 + next)
    : String(next).padStart(seq.letter ? 1 : seq.digits, '0')
  return `${front}${counter}`
}

/** Trailing blanks after the counter, which "Addendum 2 " has and most names don't. */
const trailingSpace = (text: string) => (/\s+$/.exec(text)?.[0].length ?? 0)

/** The sets already on a project, for working out what to call the next one and how to write it. */
export async function existingSets(projectId: string): Promise<SetName[]> {
  const { data, error } = await db().from('issuances').select('kind, number, issued_on, created_at').eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as SetName[]
}

/** Keep the cover that came up with a set, so it isn't filed as a drawing. */
export async function setIssuanceCover(issuanceId: string, path: string): Promise<void> {
  const { error } = await db().from('issuances').update({ cover_path: path }).eq('id', issuanceId)
  if (error) throw error
}
