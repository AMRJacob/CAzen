import { db } from './supabase'
import type { CurrentSheet, IssuanceKind, SheetRevision } from './types'
import { disciplineOf } from './pdf/splitSet'

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

/** A short-lived private link to open a stored PDF. */
export async function openStoredPdf(path: string) {
  const { data, error } = await db().storage.from('documents').createSignedUrl(path, 60 * 10)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}

/**
 * Save an issuance (bid set, addendum, ASI…) and one new revision per sheet in it.
 * Sheets that already exist get their next revision number; new sheet numbers become new sheets.
 * Nothing is overwritten: each revision is its own file.
 */
export async function saveIssuance(
  projectId: string,
  issuance: IssuanceInput,
  sheets: SheetToSave[],
  onProgress?: (done: number, total: number) => void,
) {
  const client = db()
  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id

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
        .insert({ project_id: projectId, number, title: s.title || null, discipline: disciplineOf(number) })
        .select('id, title')
        .single()
      if (created.error) throw created.error
      sheet = created.data
    }

    // Next revision number for this sheet.
    const { count } = await client
      .from('sheet_revisions').select('id', { count: 'exact', head: true }).eq('sheet_id', sheet.id)
    const revisionIndex = count ?? 0

    const path = `${projectId}/sheets/${sheet.id}/${revisionIndex}.pdf`
    const up = await client.storage
      .from('documents')
      .upload(path, new Blob([s.bytes as BlobPart], { type: 'application/pdf' }), { upsert: false })
    if (up.error) throw new Error(`${number}: ${up.error.message}`)

    const rev = await client.from('sheet_revisions').insert({
      sheet_id: sheet.id,
      issuance_id: iss.id,
      revision_index: revisionIndex,
      revision_label: s.revisionLabel || null,
      title_at_rev: s.title || sheet.title || null,
      file_path: path,
      created_by: userId,
    })
    if (rev.error) throw new Error(`${number}: ${rev.error.message}`)

    onProgress?.(++done, sheets.length)
  }
}
