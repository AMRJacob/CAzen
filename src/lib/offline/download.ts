import { db as sb } from '../supabase'
import { readFile, storageUsage, type ProjectStore } from '../files'
import { cacheFile, fileFromCache, put, release, replace, space, askToKeep, type Held } from './store'

/**
 * Taking a project to the field.
 *
 * What a site visit actually needs is the drawings, the markups already on them, and the punch
 * list. What it does not need is every superseded revision — but sometimes it does, because the
 * argument on site is about what the bid set said. So the choice is offered with what each one
 * costs, because the decision gets made on a phone on LTE and "Current set" means nothing
 * without "298 MB" next to it.
 *
 * Sizes come from sheet_revisions.bytes, recorded as each file is uploaded. Files that went up
 * before that column existed have no size yet, so those are estimated from the project's own
 * average — and the estimate says so rather than pretending to a precision it hasn't got.
 */

export type Scope = 'current' | 'all'

export interface Plan {
  scope: Scope
  files: number
  bytes: number
  /** True when some files had no recorded size and the total is partly an average. */
  estimated: boolean
}

export interface Progress {
  done: number
  total: number
  bytes: number
  /** The sheet being fetched, for something to read while it runs. */
  what: string
}

interface RevisionRow {
  id: string
  sheet_id: string
  revision_index: number
  file_path: string
  bytes: number | null
}

/**
 * Every revision of every sheet on the project.
 *
 * `bytes` arrived with migration 0017, so a database that hasn't had it yet answers without the
 * column rather than failing — the sizes are then all estimated, which is what the caller says.
 */
async function revisions(projectId: string): Promise<RevisionRow[]> {
  const ask = (columns: string) =>
    sb().from('sheet_revisions').select(columns).eq('sheets.project_id', projectId)

  let { data, error } = await ask('id, sheet_id, revision_index, file_path, bytes, sheets!inner(project_id)')
  if (error && /bytes/.test(error.message ?? '')) {
    ({ data, error } = await ask('id, sheet_id, revision_index, file_path, sheets!inner(project_id)'))
  }
  if (error) throw error
  return (data ?? []).map((r) => ({ bytes: null, ...(r as object) })) as unknown as RevisionRow[]
}

const currentOnly = (rows: RevisionRow[]): RevisionRow[] => {
  const best = new Map<string, RevisionRow>()
  for (const r of rows) {
    const had = best.get(r.sheet_id)
    if (!had || r.revision_index > had.revision_index) best.set(r.sheet_id, r)
  }
  return [...best.values()]
}

/** Bytes for a set of revisions, filling gaps with the project's own average file size. */
async function weigh(projectId: string, rows: RevisionRow[]): Promise<{ bytes: number; estimated: boolean }> {
  const known = rows.filter((r) => r.bytes != null)
  const missing = rows.length - known.length
  let bytes = known.reduce((n, r) => n + (r.bytes ?? 0), 0)
  if (!missing) return { bytes, estimated: false }

  let average = known.length ? bytes / known.length : 0
  if (!average) {
    // Nothing recorded yet: fall back to what the bucket says this project holds.
    try {
      const u = await storageUsage()
      const p = u.by_project[projectId]
      if (p?.objects) average = p.bytes / p.objects
    } catch { /* an estimate we can't make is better left visible as zero than guessed at */ }
  }
  bytes += average * missing
  return { bytes, estimated: true }
}

/** What each choice would cost, for the two buttons. */
export async function plans(projectId: string): Promise<Plan[]> {
  const rows = await revisions(projectId)
  const current = currentOnly(rows)
  const [a, b] = await Promise.all([weigh(projectId, current), weigh(projectId, rows)])
  return [
    { scope: 'current', files: current.length, bytes: a.bytes, estimated: a.estimated },
    { scope: 'all', files: rows.length, bytes: b.bytes, estimated: b.estimated },
  ]
}

async function rows(projectId: string) {
  const one = async (table: string, select = '*', column = 'project_id') => {
    const { data, error } = await sb().from(table).select(select).eq(column, projectId)
    if (error) throw error
    return (data ?? []) as unknown as Record<string, unknown>[]
  }
  const sheets = await one('sheets')
  const ids = sheets.map((s) => s.id as string)
  const bySheet = async (table: string) => {
    if (!ids.length) return []
    const { data, error } = await sb().from(table).select('*').in('sheet_id', ids)
    if (error) throw error
    // Rows keyed by sheet carry no project of their own, so one is added for the local index.
    return (data ?? []).map((r) => ({ ...r, project_id: projectId })) as Record<string, unknown>[]
  }
  return {
    sheets,
    issuances: await one('issuances'),
    revisions: await bySheet('sheet_revisions'),
    sheetText: await one('sheet_text'),
    markups: await one('sheet_markups'),
    punch: await one('punch_items'),
  }
}

/**
 * Pull a project onto this device. Rows first, so the project is usable the moment the drawings
 * start arriving, then the files one at a time — a set is hundreds of megabytes and a browser
 * asked for ninety-four of those at once on a phone will drop some of them.
 *
 * A file already held is kept: asking for the full archive after taking the current set only
 * fetches the difference, and a download interrupted halfway resumes rather than starts again.
 */
export async function takeToField(
  project: ProjectStore & { number?: string; name?: string },
  scope: Scope,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<Held> {
  const persisted = await askToKeep()
  void persisted // the answer is shown by the caller; it is never a condition of going on

  const data = await rows(project.id)
  await replace('sheets', project.id, data.sheets)
  await replace('issuances', project.id, data.issuances)
  await replace('revisions', project.id, data.revisions)
  await replace('sheetText', project.id, data.sheetText)
  await replace('markups', project.id, data.markups)
  await replace('punch', project.id, data.punch)
  await put('projects', { ...project, id: project.id, project_id: project.id })

  const { data: cats } = await sb().from('punch_categories').select('*')
  if (cats?.length) await replace('punchCategories', project.id, cats.map((c) => ({ ...c, project_id: project.id })))

  const all = (data.revisions as unknown as RevisionRow[])
  const wanted = scope === 'current' ? currentOnly(all) : all
  const numbers = new Map(data.sheets.map((s) => [s.id as string, s.number as string]))

  let done = 0, bytes = 0
  for (const r of wanted) {
    if (signal?.aborted) break
    const name = numbers.get(r.sheet_id) ?? 'sheet'
    onProgress({ done, total: wanted.length, bytes, what: name })
    try {
      const had = await fileFromCache(r.file_path)
      if (had) { bytes += had.size }
      else {
        const file = await readFile(project, r.file_path)
        const blob = new Blob([file as BlobPart], { type: 'application/pdf' })
        await cacheFile(r.file_path, project.id, blob)
        bytes += blob.size
      }
    } catch { /* one sheet that won't come down shouldn't lose the other ninety-three */ }
    done++
  }
  onProgress({ done, total: wanted.length, bytes, what: '' })

  const note: Held = {
    key: `held:${project.id}`, project_id: project.id, scope,
    at: Date.now(), files: done, bytes,
  }
  await put('meta', note)
  return note
}

export { release, space }
