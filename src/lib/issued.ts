import { db } from './supabase'
import { openFile, putFile, SECTIONS, type ProjectStore } from './files'
import type { FormKind } from './templates/types'

export interface IssuedForm {
  id: string
  project_id: string
  kind: FormKind
  number: string | null
  title: string | null
  values: Record<string, string>
  file_path: string | null
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
}

/** Next number after the last one used: "ASI-003" → "ASI-004", "09 30 00 - 001" → "09 30 00 - 002". */
export function nextNumber(kind: FormKind, last: string | null | undefined): string {
  if (!last) return `${PREFIX[kind]}001`
  const m = last.match(/^(.*?)(\d+)(\D*)$/)
  if (!m) return last
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0')
  return `${m[1]}${n}${m[3]}`
}
