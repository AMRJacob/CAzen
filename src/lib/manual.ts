import { db } from './supabase'
import { putFile, SECTIONS, type ProjectStore } from './files'
import { divisionLabel, CSI_DIVISIONS } from './csi'
import { FRONT, sortKeyOf } from './pdf/splitManual'
import type { IssuanceKind } from './types'

/**
 * The project manual.
 *
 * Specs behave like drawings and are stored like them: a section is the unit, each section has
 * revisions, and each revision belongs to an issuance. Reissuing 09 91 00 with Addendum 2 adds a
 * revision to that section and leaves every other section alone — which is what an addendum
 * actually does, and what makes "what does the spec say now" answerable at all.
 */

export interface CurrentSpec {
  section_id: string
  project_id: string
  number: string
  title: string | null
  division: string | null
  is_void: boolean
  sort_key: string | null
  revision_id: string
  revision_index: number
  revision_label: string | null
  file_path: string
  pages: number | null
  issuance_kind: IssuanceKind
  issuance_number: string | null
  issued_on: string
  revision_count: number
}

export interface SpecRevision {
  id: string
  revision_index: number
  revision_label: string | null
  title_at_rev: string | null
  file_path: string
  pages: number | null
  created_at: string
  issuances: { kind: IssuanceKind; number: string | null; issued_on: string } | null
}

export interface SectionToSave {
  number: string
  title: string
  revisionLabel: string
  pages: number
  bytes: Uint8Array
  /** The words of the section, for searching it. */
  body?: string
}

export async function listManual(projectId: string): Promise<CurrentSpec[]> {
  const { data, error } = await db()
    .from('current_specs').select('*').eq('project_id', projectId)
  if (error) throw error
  return sortManual((data ?? []) as CurrentSpec[])
}

/** Front matter first, then by section number. */
export const sortManual = <T extends { number: string; sort_key?: string | null }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (a.sort_key ?? sortKeyOf(a.number)).localeCompare(b.sort_key ?? sortKeyOf(b.number), undefined, { numeric: true }))

/** The label a section is filed under in the index: its division, or Front matter. */
export function divisionOf(number: string): string {
  if (number === FRONT) return FRONT
  const two = number.trim().slice(0, 2)
  const found = CSI_DIVISIONS.find(([n]) => n === two)
  return found ? divisionLabel(found[0], found[1]) : two ? `${two} - Division ${two}` : 'Other'
}

/** The manual grouped for an index: divisions in order, sections in order inside them. */
export function byDivision<T extends { number: string; sort_key?: string | null }>(rows: T[]) {
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const row of sortManual(rows)) {
    const label = divisionOf(row.number)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(row)
    else groups.push({ key: label, label, items: [row] })
  }
  return groups
}

export async function listSectionRevisions(sectionId: string): Promise<SpecRevision[]> {
  const { data, error } = await db()
    .from('spec_revisions')
    .select('id, revision_index, revision_label, title_at_rev, file_path, pages, created_at, issuances(kind, number, issued_on)')
    .eq('section_id', sectionId)
    .order('revision_index', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as SpecRevision[]
}

/**
 * Put a manual, or part of one, into a project.
 *
 * The same call does both jobs — the whole book at bid, and the four sections an addendum
 * reissues — because they are the same job. A section already in the project gains a revision;
 * one that isn't is created. The issuance is what says which of the two this was.
 */
export async function saveManual(
  project: ProjectStore,
  issuance: { kind: IssuanceKind; number: string; issuedOn: string },
  sections: SectionToSave[],
  onProgress?: (done: number, total: number, section: string) => void,
  /** File the sections under an issuance already made — a change document's drawings went in first. */
  into?: string,
): Promise<{ id: string; added: number; revised: number }> {
  const client = db()
  const projectId = project.id
  const { data: u } = await client.auth.getUser()
  const userId = u.user?.id ?? null

  const kindLabel: Record<IssuanceKind, string> = {
    bid_set: 'Bid Set', conformed_set: 'Conformed Set', addendum: 'Addendum', asi: 'ASI',
    bulletin: 'Bulletin', ccd: 'CCD', change_order: 'Change Order', pr: 'PR', other: 'Revision',
  }
  const setFolder = `${issuance.issuedOn} ${issuance.number || kindLabel[issuance.kind]}`

  let iss: { id: string }
  if (into) iss = { id: into }
  else {
    const made = await client
      .from('issuances')
      .insert({
        project_id: projectId,
        kind: issuance.kind,
        number: issuance.number || null,
        issued_on: issuance.issuedOn,
        created_by: userId,
      })
      .select('id')
      .single()
    if (made.error) throw made.error
    iss = made.data as { id: string }
  }

  let added = 0
  let revised = 0
  let done = 0
  for (const s of sections) {
    const number = s.number.trim()
    onProgress?.(done, sections.length, number)

    let { data: section } = await client
      .from('spec_sections').select('id, title').eq('project_id', projectId).eq('number', number).maybeSingle()
    if (!section) {
      const made = await client
        .from('spec_sections')
        .insert({ project_id: projectId, number, title: s.title || null, sort_key: sortKeyOf(number) })
        .select('id, title')
        .single()
      if (made.error) throw made.error
      section = made.data
      added++
    } else {
      revised++
    }

    const { count } = await client
      .from('spec_revisions').select('id', { count: 'exact', head: true }).eq('section_id', section.id)
    const revisionIndex = count ?? 0

    let path: string
    try {
      path = await putFile(project, s.bytes, `${projectId}/specs/${section.id}/${revisionIndex}.pdf`, {
        dirs: [SECTIONS.manual, setFolder],
        name: `${number}${s.title ? ' ' + s.title : ''}.pdf`,
      })
    } catch (e) {
      throw new Error(`${number}: ${e instanceof Error ? e.message : String(e)}`)
    }

    const rev = await client.from('spec_revisions').insert({
      section_id: section.id,
      issuance_id: iss.id,
      revision_index: revisionIndex,
      revision_label: s.revisionLabel || null,
      title_at_rev: s.title || section.title || null,
      pages: s.pages,
      bytes: s.bytes.length,
      file_path: path,
      created_by: userId,
    }).select('id').single()
    if (rev.error) throw new Error(`${number}: ${rev.error.message}`)

    // The words, for searching. A failure here doesn't lose the section.
    if (s.body?.trim()) {
      await client.from('spec_text').insert({ revision_id: rev.data.id, project_id: projectId, body: s.body })
    }
    done++
    onProgress?.(done, sections.length, number)
  }

  return { id: iss.id as string, added, revised }
}

export interface SpecHit {
  section_id: string
  revision_id: string
  number: string
  title: string | null
  revision_index: number
  file_path: string
  is_current: boolean
  snippet: string
  rank: number
}

export async function searchManual(projectId: string, query: string, allRevisions = false): Promise<SpecHit[]> {
  const { data, error } = await db().rpc('search_specs', {
    p_project: projectId, p_query: query, p_all_revisions: allRevisions,
  })
  if (error) throw error
  return (data ?? []) as SpecHit[]
}

/** Correct a section's number or title after the fact. */
export async function renameSection(sectionId: string, next: { number: string; title: string }): Promise<void> {
  const number = next.number.trim()
  if (!number) throw new Error('A section needs a number.')
  const { error } = await db()
    .from('spec_sections')
    .update({ number, title: next.title.trim() || null, sort_key: sortKeyOf(number) })
    .eq('id', sectionId)
  if (error) {
    if (error.code === '23505') throw new Error(`${number} is already in this project’s manual.`)
    throw error
  }
}
