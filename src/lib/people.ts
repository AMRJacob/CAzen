import { db } from './supabase'
import { all as localAll, get as localGet, put as localPut, remove as localRemove } from './offline/store'
import { queue } from './offline/outbox'
import { localFirst } from './offline/mirror'

/**
 * The people on a job — what a sign-in sheet asks for, kept once per project so that a page's
 * names are picked and not typed again.
 */
export interface Person {
  id: string
  project_id: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
}

/** Who is on the job. Kept on this device too: the people at a site meeting are added at it. */
export function listPeople(projectId: string): Promise<Person[]> {
  return localFirst<Person>({
    store: 'people',
    here: () => localAll<Person>('people', projectId),
    theirs: async () => {
      const { data, error } = await db().from('project_people')
        .select('id, project_id, name, company, phone, email').eq('project_id', projectId).order('name')
      if (error) throw error
      return (data ?? []) as Person[]
    },
    sort: (x, y) => x.name.localeCompare(y.name),
  })
}

export async function addPerson(projectId: string, p: { name: string; company?: string; phone?: string; email?: string }): Promise<Person> {
  const row: Person = {
    id: crypto.randomUUID(), project_id: projectId, name: p.name.trim(),
    company: p.company?.trim() || null, phone: p.phone?.trim() || null, email: p.email?.trim() || null,
  }
  await localPut('people', row)
  await queue(projectId, { kind: 'row.put', table: 'project_people', row: row as unknown as Record<string, unknown> })
  return row
}

/**
 * A person's details corrected (Jacob, 11/24: right-click an attendee to edit). Kept on the
 * project's list, so every page from now on offers them as they are now. Pages already written
 * keep the line they had.
 */
export async function setPerson(id: string, patch: { name?: string; company?: string | null; phone?: string | null; email?: string | null }): Promise<Person | null> {
  const had = await localGet<Person>('people', id).catch(() => undefined)
  const clean = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || (k === 'name' ? v : null)) : v]))
  const next = had ? { ...had, ...clean } as Person : null
  if (next) await localPut('people', next)
  await queue(had?.project_id ?? '', { kind: 'row.patch', table: 'project_people', id, patch: clean })
  return next
}

export async function removePerson(id: string): Promise<void> {
  const had = await localGet<Person>('people', id).catch(() => undefined)
  await localRemove('people', id).catch(() => {})
  await queue(had?.project_id ?? '', { kind: 'row.remove', table: 'project_people', ids: [id] })
}

/** A person as the report templates take a participant: Name | Company | Email. */
export const asLine = (p: Pick<Person, 'name' | 'company' | 'email'>) =>
  [p.name, p.company ?? '', p.email ?? ''].join(' | ').replace(/(\s\|\s)+$/, '')

/** The names on a page, one a line, as people (name first; the rest as it was written). */
export const linesOf = (names: string | null) =>
  (names ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
export const nameIn = (line: string) => line.split('|')[0].trim()

/**
 * Everyone on the firm's other projects, once each — the same superintendent and the same
 * owner's rep turn up job after job. They are offered when adding attendees, and picking one
 * puts them on this project too.
 */
export async function listPeopleElsewhere(projectId: string): Promise<Person[]> {
  const { data, error } = await db().from('project_people')
    .select('id, project_id, name, company, phone, email').neq('project_id', projectId).order('name').limit(1000)
  if (error) throw error
  const seen = new Set<string>()
  return ((data ?? []) as Person[]).filter((p) => {
    const key = `${p.name.trim().toLowerCase()}|${(p.company ?? '').trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
