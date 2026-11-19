import { db } from './supabase'
import type { Change, Line } from './scheduleDiff'

/** One issue of the schedule, as kept: what it said and what it changed. */
export interface ScheduleVersion {
  id: string
  project_id: string
  label: string | null
  issued_on: string
  snapshot: Line[]
  changes: Change[]
  created_at: string
}

/** Thrown where the history has nowhere to be kept yet (migration 0039). */
export class VersionsNotSetUp extends Error { constructor() { super('Schedule history needs migration 0039.') } }
const notThere = (e: { code?: string; message?: string } | null) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || /schedule_versions|schema cache/i.test(e?.message ?? '')

export async function listVersions(projectId: string): Promise<ScheduleVersion[]> {
  const { data, error } = await db().from('schedule_versions').select('id, project_id, label, issued_on, snapshot, changes, created_at')
    .eq('project_id', projectId).order('issued_on', { ascending: false }).order('created_at', { ascending: false })
  if (error) { if (notThere(error)) throw new VersionsNotSetUp(); throw error }
  return (data ?? []) as ScheduleVersion[]
}

export async function keepVersion(v: { project_id: string; label: string | null; issued_on: string; snapshot: Line[]; changes: Change[] }): Promise<ScheduleVersion> {
  const { data: u } = await db().auth.getUser()
  const { data, error } = await db().from('schedule_versions').insert({ ...v, created_by: u.user?.id ?? null })
    .select('id, project_id, label, issued_on, snapshot, changes, created_at').single()
  if (error) { if (notThere(error)) throw new VersionsNotSetUp(); throw error }
  return data as ScheduleVersion
}
