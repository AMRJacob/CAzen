import { appUrl, db } from './supabase'
import type { FirmRole } from './types'

/**
 * Who can get into CAzen, and which projects each of them sees.
 *
 * The firm's owners and admins see every project. Everyone else sees the projects they have
 * been put on. Inviting someone sends them an email to choose a password; that, and adding
 * memberships for somebody other than yourself, is done by the `invite-user` function on the
 * server, which checks that the person asking is an admin before it does anything.
 */
export interface FirmPerson {
  user_id: string
  email: string
  full_name: string | null
  role: FirmRole
  joined_at: string
  last_seen: string | null
}

export type ProjectRole = 'architect' | 'consultant' | 'contractor' | 'owner'
export const PROJECT_ROLES: Record<ProjectRole, string> = {
  architect: 'Architect', consultant: 'Consultant', contractor: 'Contractor', owner: 'Owner',
}

export async function listFirmPeople(firmId: string): Promise<FirmPerson[]> {
  const { data, error } = await db().rpc('firm_people', { p_firm: firmId })
  if (error) throw error
  return (data ?? []) as FirmPerson[]
}

/** Which projects each person is on, as user id → project ids. */
export async function listProjectAccess(projectIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (!projectIds.length) return out
  const { data, error } = await db().from('project_members').select('project_id, user_id').in('project_id', projectIds)
  if (error) throw error
  for (const r of (data ?? []) as { project_id: string; user_id: string }[]) {
    if (!out.has(r.user_id)) out.set(r.user_id, new Set())
    out.get(r.user_id)!.add(r.project_id)
  }
  return out
}

export async function addToProject(projectId: string, userId: string, role: ProjectRole = 'architect'): Promise<void> {
  const { error } = await db().from('project_members').upsert({ project_id: projectId, user_id: userId, role }, { onConflict: 'project_id,user_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function removeFromProject(projectId: string, userId: string): Promise<void> {
  const { error } = await db().from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
  if (error) throw error
}

export async function setFirmRole(firmId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await db().from('firm_members').update({ role }).eq('firm_id', firmId).eq('user_id', userId)
  if (error) throw error
}

/** Take someone out of the firm altogether: they lose every project with it. */
export async function removeFromFirm(firmId: string, userId: string, projectIds: string[]): Promise<void> {
  if (projectIds.length) {
    const { error } = await db().from('project_members').delete().eq('user_id', userId).in('project_id', projectIds)
    if (error) throw error
  }
  const { error } = await db().from('firm_members').delete().eq('firm_id', firmId).eq('user_id', userId)
  if (error) throw error
}

/**
 * Put someone on the firm and the chosen projects. Nothing is emailed: what comes back is a
 * link for them to get in with, to be sent however the admin likes — or none, for someone who
 * already signs in.
 */
export async function invite(firmId: string, email: string, projectIds: string[], role: ProjectRole): Promise<{ invited: boolean; link: string | null }> {
  const { data, error } = await db().functions.invoke('invite-user', {
    body: { firm_id: firmId, email, project_ids: projectIds, role, redirect_to: appUrl() },
  })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* keep it */ }
    throw new Error(msg)
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  const d = data as { invited?: boolean; link?: string | null }
  return { invited: !!d?.invited, link: d?.link ?? null }
}
