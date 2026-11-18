import { db } from './supabase'
import { putFile, SECTIONS, type ProjectStore } from './files'
import { safeName } from './files'

/**
 * The contract library.
 *
 * What was agreed, as signed. These are the documents every other argument on the job is
 * settled against, so once one is executed it stops being editable here — a contract that can
 * be quietly replaced is not a contract. Changing one is what a change order is for, and the
 * change orders are read from the register rather than typed again.
 */

export type ContractKind =
  | 'owner_contractor' | 'owner_architect' | 'general_conditions'
  | 'supplementary_conditions' | 'bond' | 'insurance' | 'other'

export interface ContractDocument {
  id: string
  project_id: string
  kind: ContractKind
  title: string
  executed_on: string | null
  file_path: string
  is_locked: boolean
  created_at: string
}

/** The tabs, in the order a project's paperwork is usually assembled. */
export const CONTRACT_TABS: { kind: ContractKind; label: string; about: string }[] = [
  { kind: 'owner_contractor', label: 'Owner–contractor', about: 'The agreement the work is built under, and what it is worth.' },
  { kind: 'owner_architect', label: 'Owner–architect', about: 'The agreement the services are provided under.' },
  { kind: 'general_conditions', label: 'General conditions', about: 'A201 or whatever stands in its place.' },
  { kind: 'supplementary_conditions', label: 'Supplementary', about: 'What the project changed about the general conditions.' },
  { kind: 'bond', label: 'Bonds', about: 'Performance and payment.' },
  { kind: 'insurance', label: 'Insurance', about: 'Certificates and endorsements.' },
  { kind: 'other', label: 'Other', about: 'Everything else that was signed.' },
]

export const KIND_LABEL: Record<ContractKind, string> =
  Object.fromEntries(CONTRACT_TABS.map((t) => [t.kind, t.label])) as Record<ContractKind, string>

export async function listContractDocuments(projectId: string): Promise<ContractDocument[]> {
  const { data, error } = await db()
    .from('contract_documents').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ContractDocument[]
}

export async function addContractDocument(project: ProjectStore, doc: {
  kind: ContractKind
  title: string
  executed_on: string | null
  bytes: Uint8Array
  fileName: string
}): Promise<ContractDocument> {
  const name = safeName(doc.fileName.endsWith('.pdf') ? doc.fileName : `${doc.fileName}.pdf`)
  const path = await putFile(
    project, doc.bytes,
    `${project.id}/contract/${name}`,
    { dirs: [SECTIONS.contract], name },
  )
  const { data, error } = await db().from('contract_documents').insert({
    project_id: project.id,
    kind: doc.kind,
    title: doc.title,
    executed_on: doc.executed_on,
    file_path: path,
    // Executed on the day it is filed means filed as a record, not a draft.
    is_locked: !!doc.executed_on,
  }).select('*').single()
  if (error) throw error
  return data as ContractDocument
}

export async function setContractDocument(
  id: string,
  patch: Partial<Pick<ContractDocument, 'title' | 'executed_on' | 'is_locked' | 'kind'>>,
): Promise<void> {
  const { error } = await db().from('contract_documents').update(patch).eq('id', id)
  if (error) throw error
}

export async function removeContractDocument(id: string): Promise<void> {
  const { error } = await db().from('contract_documents').delete().eq('id', id)
  if (error) throw error
}
