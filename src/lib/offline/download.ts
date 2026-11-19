import { db as sb } from '../supabase'
import { readFile, storageUsage, type ProjectStore } from '../files'
import { all, cacheFile, fileFromCache, held, put, release, remove, replace, space, askToKeep, type CachedFile, type Held } from './store'

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

export interface RevisionRow {
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
export async function revisions(projectId: string): Promise<RevisionRow[]> {
  const ask = (columns: string) =>
    sb().from('sheet_revisions').select(columns).eq('sheets.project_id', projectId)

  let { data, error } = await ask('id, sheet_id, revision_index, file_path, bytes, sheets!inner(project_id)')
  if (error && /bytes/.test(error.message ?? '')) {
    ({ data, error } = await ask('id, sheet_id, revision_index, file_path, sheets!inner(project_id)'))
  }
  if (error) throw error
  return (data ?? []).map((r) => ({ bytes: null, ...(r as object) })) as unknown as RevisionRow[]
}

export const currentOnly = (rows: RevisionRow[]): RevisionRow[] => {
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
    // The words on each sheet have no id of their own on the server — one row a revision — and
    // the device's store is keyed by id, so the revision's stands in. The search index column is
    // left behind: it is the server's, and several times the size of the words.
    sheetText: (await one('sheet_text', 'revision_id, project_id, body')).map((t) => ({ ...t, id: t.revision_id })),
    markups: await one('sheet_markups'),
    observations: await one('observations'),
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
  await replace('observations', project.id, data.observations)
  await put('projects', { ...project, id: project.id, project_id: project.id })

  // Observation types belong to the firm, not the project, so they are fetched whole and stored
  // against this project — a device holding two projects keeps a copy for each, which is cheap.
  const { data: types } = await sb().from('observation_types').select('*')
  if (types?.length) await replace('observationTypes', project.id, types.map((c) => ({ ...c, project_id: project.id })))

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
  // Taking the current set means the current set: a revision that has since been superseded is
  // dead weight on a phone, and the whole point of the choice was to save the space.
  //
  // Never on an empty list. A query that comes back with nothing — a dropped connection, a
  // permission that lapsed — looks exactly like a project with no sheets, and acting on it would
  // clear the drawings off a device that is about to go somewhere with no signal.
  if (scope === 'current' && !signal?.aborted && wanted.length > 0) {
    const keep = new Set(wanted.map((r) => r.file_path))
    bytes -= await prune(project.id, keep)
  }
  onProgress({ done, total: wanted.length, bytes, what: '' })

  await bringNotebooks(project.id).catch(() => { /* the drawings are what was asked for */ })

  const note: Held = {
    key: `held:${project.id}`, project_id: project.id, scope,
    at: Date.now(), files: done, bytes, checked: Date.now(),
  }
  await put('meta', note)
  return note
}

/**
 * The notebooks as they stand, so that last week's page can be turned back to on site. Reading
 * them is what keeps them: every list below leaves its rows on this device as it goes.
 */
async function bringNotebooks(projectId: string): Promise<void> {
  const [{ listVisits }, { listPads, listMarks }, { listPeople }] = await Promise.all([
    import('../visits'), import('../pads'), import('../people'),
  ])
  await Promise.all([listVisits(projectId, 'visit'), listVisits(projectId, 'meeting'), listPeople(projectId)])
  for (const kind of ['field_report', 'meeting_notes'] as const) {
    for (const pad of await listPads(projectId, kind)) await listMarks(pad.id)
  }
}

/** Drop held files that aren't in `keep`. Returns the bytes given back. */
async function prune(projectId: string, keep: Set<string>): Promise<number> {
  let freed = 0
  for (const f of await all<CachedFile>('files', projectId)) {
    if (keep.has(f.path)) continue
    // Only drawings are given back. A photograph taken on site may not have been sent yet, and
    // the pages that show it expect to find it here.
    if (!/\.pdf$/i.test(f.path)) continue
    freed += f.bytes.size
    await remove('files', f.path)
  }
  return freed
}

/**
 * Whether this device is holding drawings the job has moved past.
 *
 * Marking up a superseded sheet is worse than having no drawings at all: the markup is real, the
 * drawing under it isn't, and nothing on screen says so. So a device that holds a project is
 * asked this every time it finds the internet, and the answer names the sheets rather than
 * saying "updates available", because which sheets changed is the thing that decides whether it
 * matters this afternoon.
 */
export interface Behind {
  /** Sheets whose current revision this device hasn't got. */
  sheets: { number: string; title: string | null }[]
  /** How many files that is, which is what a sync would fetch. */
  files: number
  at: number
}

export async function behind(projectId: string): Promise<Behind | null> {
  const note = await held(projectId)
  if (!note) return null
  const rows = await revisions(projectId)
  const wanted = note.scope === 'current' ? currentOnly(rows) : rows
  const have = new Set((await all<CachedFile>('files', projectId)).map((f) => f.path))
  const short = wanted.filter((r) => !have.has(r.file_path))
  if (!short.length) return { sheets: [], files: 0, at: Date.now() }

  const { data } = await sb().from('sheets').select('id, number, title').eq('project_id', projectId)
  const byId = new Map(((data ?? []) as { id: string; number: string; title: string | null }[]).map((s) => [s.id, s]))
  const seen = new Set<string>()
  const sheets: { number: string; title: string | null }[] = []
  for (const r of short) {
    if (seen.has(r.sheet_id)) continue
    seen.add(r.sheet_id)
    const s = byId.get(r.sheet_id)
    sheets.push({ number: s?.number ?? '—', title: s?.title ?? null })
  }
  sheets.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  return { sheets, files: short.length, at: Date.now() }
}

export { release, space }
