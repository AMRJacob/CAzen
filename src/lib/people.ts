import { db } from './supabase'

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

export async function listPeople(projectId: string): Promise<Person[]> {
  const { data, error } = await db().from('project_people')
    .select('id, project_id, name, company, phone, email').eq('project_id', projectId).order('name')
  if (error) throw error
  return (data ?? []) as Person[]
}

export async function addPerson(projectId: string, p: { name: string; company?: string; phone?: string; email?: string }): Promise<Person> {
  const row: Person = {
    id: crypto.randomUUID(), project_id: projectId, name: p.name.trim(),
    company: p.company?.trim() || null, phone: p.phone?.trim() || null, email: p.email?.trim() || null,
  }
  const { error } = await db().from('project_people').insert(row)
  if (error) throw error
  return row
}

export async function removePerson(id: string): Promise<void> {
  const { error } = await db().from('project_people').delete().eq('id', id)
  if (error) throw error
}

/** A person as the report templates take a participant: Name | Company | Email. */
export const asLine = (p: Pick<Person, 'name' | 'company' | 'email'>) =>
  [p.name, p.company ?? '', p.email ?? ''].join(' | ').replace(/(\s\|\s)+$/, '')

/** The names on a page, one a line, as people (name first; the rest as it was written). */
export const linesOf = (names: string | null) =>
  (names ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
export const nameIn = (line: string) => line.split('|')[0].trim()
