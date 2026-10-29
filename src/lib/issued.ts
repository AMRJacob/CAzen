import { db } from './supabase'
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
export async function saveIssued(projectId: string, kind: FormKind, values: Record<string, string>, pdf: Uint8Array) {
  const client = db()
  const { data: u } = await client.auth.getUser()
  const id = crypto.randomUUID()
  const path = `${projectId}/forms/${kind}/${id}.pdf`
  const up = await client.storage.from('documents').upload(path, new Blob([pdf as BlobPart], { type: 'application/pdf' }), { upsert: false })
  if (up.error) throw up.error
  const number = Object.entries(values).find(([k]) => k.endsWith('.number') && !k.startsWith('project.'))?.[1] ?? null
  const title = ['sub.title', 'asi.title', 'rfi.subject', 'pr.title', 'ccd.title', 'fr.date'].map((k) => values[k]).find(Boolean) ?? null
  const { error } = await client.from('issued_forms').insert({
    id, project_id: projectId, kind, number, title, values, file_path: path, issued_by: u.user?.id,
  })
  if (error) throw error
}

export async function openIssued(path: string) {
  const { data, error } = await db().storage.from('documents').createSignedUrl(path, 600)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}

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
