import { db } from './supabase'
import { openFile, putFile, SECTIONS, type ProjectStore } from './files'
import type { FormKind } from './templates/types'
import type { IssuanceKind } from './types'

export interface IssuedForm {
  id: string
  project_id: string
  kind: FormKind
  number: string | null
  title: string | null
  values: Record<string, string>
  file_path: string | null
  /** The upload that brought the sheets this document issued, where it came from one. */
  issuance_id?: string | null
  issued_by: string | null
  issued_at: string
}

export async function listIssued(projectId: string, kind: FormKind): Promise<IssuedForm[]> {
  const { data, error } = await db()
    .from('issued_forms').select('*').eq('project_id', projectId).eq('kind', kind)
    .order('issued_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []) as IssuedForm[]
}

/** Keep an issued form with the project: the PDF in storage, the values for the log and autofill. */
const SECTION_FOR: Record<FormKind, string> = {
  submittal_cover: SECTIONS.submittals, asi: SECTIONS.asis, rfi_response: SECTIONS.rfis,
  pr: SECTIONS.prs, ccd: SECTIONS.ccds, field_report: SECTIONS.fieldReports,
  meeting_notes: SECTIONS.meetings,
  change_order: SECTIONS.changeOrders,
}

export async function saveIssued(project: ProjectStore, kind: FormKind, values: Record<string, string>, pdf: Uint8Array) {
  const client = db()
  const projectId = project.id
  const { data: u } = await client.auth.getUser()
  const id = crypto.randomUUID()
  const number = Object.entries(values).find(([k]) => k.endsWith('.number') && !k.startsWith('project.'))?.[1] ?? null
  const title = ['sub.title', 'asi.title', 'rfi.subject', 'pr.title', 'ccd.title', 'fr.date'].map((k) => values[k]).find(Boolean) ?? null
  // In a project folder: "06 ASIs\ASI-003 Revised Storefront.pdf". Dates use dashes, which Windows allows.
  const label = [number, title].filter(Boolean).join(' ').replace(/\//g, '-') || id
  const path = await putFile(project, pdf, `${projectId}/forms/${kind}/${id}.pdf`, { dirs: [SECTION_FOR[kind]], name: `${label}.pdf` })
  const { error } = await client.from('issued_forms').insert({
    id, project_id: projectId, kind, number, title, values, file_path: path, issued_by: u.user?.id,
  })
  if (error) throw error
}

export const openIssued = (project: ProjectStore, path: string) => openFile(project, path)

const PREFIX: Record<FormKind, string> = {
  submittal_cover: '', asi: 'ASI-', rfi_response: 'RFI-', pr: 'PR-', ccd: 'CCD-', field_report: 'FR-',
  meeting_notes: 'MN-',
  change_order: 'CO-',
}

/** Next number after the last one used: "ASI-003" → "ASI-004", "09 30 00 - 001" → "09 30 00 - 002". */
export function nextNumber(kind: FormKind, last: string | null | undefined): string {
  if (!last) return `${PREFIX[kind]}001`
  const m = last.match(/^(.*?)(\d+)(\D*)$/)
  if (!m) return last
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0')
  return `${m[1]}${n}${m[3]}`
}

// ---------- The register of clarifications and changes ----------

/** The documents that change or clarify the Contract, in the order the story happened. */
export const CHANGE_KINDS: FormKind[] = ['asi', 'rfi_response', 'pr', 'ccd', 'change_order']

export interface RegisterRow extends IssuedForm {
  /** For a change order: the proposal requests it was issued with. */
  covers?: IssuedForm[]
  /** For a proposal request: the change order that took it up, if one has. */
  rolledInto?: { id: string; number: string | null } | null
}

/** Everything issued on a project, newest first, with change orders and their PRs joined up. */
export async function listRegister(projectId: string, kinds?: FormKind[]): Promise<RegisterRow[]> {
  const client = db()
  let q = client.from('issued_forms').select('*').eq('project_id', projectId)
  if (kinds?.length) q = q.in('kind', kinds)
  const { data, error } = await q.order('issued_at', { ascending: false }).limit(500)
  if (error) throw error
  const rows = (data ?? []) as RegisterRow[]

  const { data: links, error: linkError } = await client
    .from('issued_form_links').select('parent_id, child_id').eq('project_id', projectId)
  // The links are an enrichment: a register that can't read them is still a register.
  if (linkError) return rows

  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const l of links ?? []) {
    const parent = byId.get(l.parent_id), child = byId.get(l.child_id)
    if (parent) (parent.covers ??= []).push(child ?? ({ id: l.child_id } as IssuedForm))
    if (child) child.rolledInto = parent ? { id: parent.id, number: parent.number } : { id: l.parent_id, number: null }
  }
  for (const r of rows) r.covers?.sort((a, b) => (a.number ?? '').localeCompare(b.number ?? ''))
  return rows
}

/**
 * Say that a change order covers a proposal request.
 *
 * A PR belongs to one change order — that is what makes the money add up — so attaching one that
 * is already in another change order moves it rather than quietly doing nothing.
 */
export async function coverWith(projectId: string, changeOrderId: string, prIds: string[]): Promise<void> {
  if (!prIds.length) return
  const client = db()
  await client.from('issued_form_links').delete().in('child_id', prIds)
  const { error } = await client.from('issued_form_links')
    .insert(prIds.map((child_id) => ({ parent_id: changeOrderId, child_id, project_id: projectId })))
  if (error) throw error
}

export async function uncover(childIds: string[]): Promise<void> {
  if (!childIds.length) return
  const { error } = await db().from('issued_form_links').delete().in('child_id', childIds)
  if (error) throw error
}

// ---------- A change document that arrived with its drawings ----------

/**
 * Which upload categories are also change documents.
 *
 * Only the four an architect actually issues as a cover sheet plus revised sheets. A bid set or
 * a conformed set is drawings and nothing else; an addendum has a cover, but it belongs to
 * bidding rather than to the record of changes during construction, so its cover is kept with
 * the set instead of becoming an entry in the tracker.
 */
export const DOCUMENT_FOR: Partial<Record<IssuanceKind, FormKind>> = {
  asi: 'asi',
  pr: 'pr',
  ccd: 'ccd',
  change_order: 'change_order',
}

/**
 * Uploads that should be in the register and aren't.
 *
 * An ASI uploaded as drawings is an ASI that was issued, but until CAzen filed it here that
 * only happened when a page in the upload had been ticked as the cover — so a job loaded
 * retroactively, which is most of them, came out with ten ASIs in the drawings and an empty
 * register. Rather than leave that to be typed back in by hand, the uploads are matched against
 * the register and the gap is offered as one action.
 */
export interface MissingChangeDocument {
  issuanceId: string
  kind: IssuanceKind
  name: string
  issuedOn: string
  coverPath: string | null
  sheets: number
}

export async function missingChangeDocuments(projectId: string): Promise<MissingChangeDocument[]> {
  const client = db()
  const kinds = Object.keys(DOCUMENT_FOR) as IssuanceKind[]
  const { data: issuances, error } = await client
    .from('issuances').select('id, kind, number, issued_on, cover_path')
    .eq('project_id', projectId).in('kind', kinds)
  if (error) throw error
  if (!issuances?.length) return []

  const { data: filed, error: filedError } = await client
    .from('issued_forms').select('issuance_id').eq('project_id', projectId).not('issuance_id', 'is', null)
  if (filedError) throw filedError
  const already = new Set((filed ?? []).map((f) => (f as { issuance_id: string }).issuance_id))

  type Row = { id: string; kind: IssuanceKind; number: string | null; issued_on: string; cover_path: string | null }
  const want = (issuances as unknown as Row[]).filter((i) => !already.has(i.id))
  if (!want.length) return []

  // How many sheets came with each, which is what makes the offer worth reading.
  const counts = new Map<string, number>()
  const { data: revs } = await client
    .from('sheet_revisions').select('issuance_id').in('issuance_id', want.map((i) => i.id))
  for (const r of (revs ?? []) as { issuance_id: string }[]) {
    counts.set(r.issuance_id, (counts.get(r.issuance_id) ?? 0) + 1)
  }

  return want
    .map((i) => ({
      issuanceId: i.id, kind: i.kind, name: i.number || ISSUANCE_WORD[i.kind],
      issuedOn: i.issued_on, coverPath: i.cover_path, sheets: counts.get(i.id) ?? 0,
    }))
    .sort((a, b) => a.issuedOn.localeCompare(b.issuedOn))
}

/** File every upload that should be in the register. Returns how many entries were made. */
export async function fileMissingChangeDocuments(projectId: string): Promise<number> {
  const missing = await missingChangeDocuments(projectId)
  let made = 0
  for (const m of missing) {
    await documentForIssuance({
      projectId, issuanceId: m.issuanceId, kind: m.kind,
      name: m.name, issuedOn: m.issuedOn, filePath: m.coverPath,
    })
    made++
  }
  return made
}

const ISSUANCE_WORD: Record<IssuanceKind, string> = {
  bid_set: 'Bid set', conformed_set: 'Conformed set', addendum: 'Addendum', asi: 'ASI',
  bulletin: 'Bulletin', ccd: 'CCD', change_order: 'Change Order', pr: 'PR', other: 'Revision',
}

/**
 * File the change document an upload came with.
 *
 * Uploading sheets as an ASI or a PR *is* issuing that ASI or PR, so the entry in the change
 * register is made by the upload rather than typed again afterwards. A cover sheet is welcome
 * and not required: a sketch issued with no narrative is still an ASI, and an entry with no
 * file attached is still the record that it went out — the cover can be added later.
 *
 * The number is the set's own name, because they are the same thing said twice: a package called
 * "ASI 003" is ASI-003. The two rows point at each other, so the register can say how many
 * sheets came with the document and the drawings can say which document brought them.
 */
export async function documentForIssuance(args: {
  projectId: string
  issuanceId: string
  kind: IssuanceKind
  name: string
  issuedOn: string
  filePath?: string | null
}): Promise<void> {
  const formKind = DOCUMENT_FOR[args.kind]
  if (!formKind) return
  const { data: u } = await db().auth.getUser()
  const { error } = await db().from('issued_forms').insert({
    project_id: args.projectId,
    issuance_id: args.issuanceId,
    kind: formKind,
    number: args.name || null,
    title: null,
    values: {},
    file_path: args.filePath ?? null,
    issued_by: u.user?.id ?? null,
    issued_at: new Date(`${args.issuedOn}T12:00:00`).toISOString(),
  })
  if (error) throw error
}

// ---------- A proposal request, after it comes back ----------

/**
 * What the owner said to a priced proposal request. With no price yet it is simply waiting on
 * the contractor; "pending" with a price is waiting on the owner.
 */
export type PrDecision = 'pending' | 'approved' | 'rejected'

/**
 * The price and the decision live with the proposal request's own values, beside what it was
 * issued with, so a PR filed from an upload and one written here are answered the same way.
 */
export const prPrice = (row: IssuedForm): number | null => {
  const raw = row.values?.['pr.price']
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
export const prDecision = (row: IssuedForm): PrDecision => {
  const v = row.values?.['pr.decision']
  return v === 'approved' || v === 'rejected' ? v : 'pending'
}

export async function setPrResponse(row: IssuedForm, patch: { price?: number | null; decision?: PrDecision }): Promise<Record<string, string>> {
  const values = { ...(row.values ?? {}) }
  if ('price' in patch) { if (patch.price == null) delete values['pr.price']; else values['pr.price'] = String(patch.price) }
  if (patch.decision) values['pr.decision'] = patch.decision
  const { error } = await db().from('issued_forms').update({ values }).eq('id', row.id)
  if (error) throw error
  return values
}

/** Where the project's proposal requests stand, in money. */
export function prStanding(rows: RegisterRow[]) {
  const out = { unpriced: 0, deciding: 0, approvedLoose: 0, inOrders: 0, rejected: 0, count: 0 }
  for (const r of rows) {
    if (r.kind !== 'pr') continue
    out.count++
    const price = prPrice(r), decision = prDecision(r)
    if (decision === 'rejected') { out.rejected += price ?? 0; continue }
    if (r.rolledInto) { out.inOrders += price ?? 0; continue }
    if (price == null) { out.unpriced++; continue }
    if (decision === 'approved') out.approvedLoose += price; else out.deciding += price
  }
  return out
}
