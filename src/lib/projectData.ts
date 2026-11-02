import { db } from './supabase'
import { saveToFolder, SECTIONS, type ProjectStore } from './files'

/**
 * A project's records as one JSON file: project details, upload rounds, sheets and every revision,
 * the words on each sheet, links, issued forms with their values, and the firm's settings and
 * templates. Saved into the project folder (CAzen\00 Project Data) so the records exist somewhere
 * you control, not only in the database. The free Supabase plan has no automatic backups:
 * https://supabase.com/docs/guides/platform/backups
 */
export async function projectData(projectId: string) {
  const q = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
    const { data, error } = await p
    if (error) throw new Error(error.message)
    return data ?? ([] as unknown as T)
  }
  const project = await q(db().from('projects').select('*').eq('id', projectId).single())
  const firmId = (project as unknown as { firm_id: string }).firm_id
  const [issuances, sheets, revisions, text, links, forms, firm, docTemplates, titleblocks] = await Promise.all([
    q(db().from('issuances').select('*').eq('project_id', projectId)),
    q(db().from('sheets').select('*').eq('project_id', projectId)),
    q(db().from('sheet_revisions').select('*, sheets!inner(project_id)').eq('sheets.project_id', projectId)),
    q(db().from('sheet_text').select('revision_id, body').eq('project_id', projectId)),
    q(db().from('sheet_links').select('*').eq('project_id', projectId)),
    q(db().from('issued_forms').select('*').eq('project_id', projectId)),
    q(db().from('firms').select('*').eq('id', firmId).single()),
    q(db().from('doc_templates').select('*').eq('firm_id', firmId)),
    q(db().from('titleblock_templates').select('*').eq('firm_id', firmId)),
  ])
  return {
    cazen_backup: 1,
    saved_at: new Date().toISOString(),
    project, issuances, sheets,
    sheet_revisions: (revisions as Record<string, unknown>[]).map(({ sheets: _s, ...r }) => r),
    sheet_text: text, sheet_links: links, issued_forms: forms,
    firm, doc_templates: docTemplates, titleblock_templates: titleblocks,
  }
}

/** Save the project data into the project folder; returns where it went. */
export async function backupProject(project: ProjectStore & { number?: string }): Promise<string> {
  const data = await projectData(project.id)
  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 1))
  const where = await saveToFolder(project, [SECTIONS.data], `${stamp} project data.json`, bytes)
  try { localStorage.setItem(`cazen.backup.${project.id}`, now.toISOString().slice(0, 10)) } catch { /* fine */ }
  return where
}

/** Has this computer saved a backup of the project today? */
export function backedUpToday(projectId: string) {
  try { return localStorage.getItem(`cazen.backup.${projectId}`) === new Date().toISOString().slice(0, 10) } catch { return false }
}
