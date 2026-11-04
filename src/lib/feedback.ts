import { db } from './supabase'

/** Requests and issues, kept in the database (Settings → Requests & issues). */
export type FeedbackKind = 'request' | 'issue'
export type FeedbackStatus = 'new' | 'under_review' | 'planned' | 'in_progress' | 'complete' | 'infeasible' | 'duplicate' | 'wont_do'

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  under_review: 'Under review',
  planned: 'Planned',
  in_progress: 'In progress',
  complete: 'Complete – closed',
  infeasible: 'Infeasible – closed',
  duplicate: 'Duplicate – closed',
  wont_do: 'Won’t do – closed',
}
export const CLOSED: FeedbackStatus[] = ['complete', 'infeasible', 'duplicate', 'wont_do']

export interface Feedback {
  id: string
  firm_id: string
  kind: FeedbackKind
  title: string
  details: string | null
  status: FeedbackStatus
  notes: string | null
  page: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export async function listFeedback(firmId: string): Promise<Feedback[]> {
  const { data, error } = await db().from('feedback').select('*').eq('firm_id', firmId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Feedback[]
}

export async function addFeedback(firmId: string, f: { kind: FeedbackKind; title: string; details?: string; page?: string }) {
  const { data: u } = await db().auth.getUser()
  const { data, error } = await db().from('feedback')
    .insert({ firm_id: firmId, kind: f.kind, title: f.title.trim(), details: f.details?.trim() || null, page: f.page ?? null, created_by: u.user?.id })
    .select('*').single()
  if (error) throw error
  return data as Feedback
}

export async function updateFeedback(id: string, patch: Partial<Pick<Feedback, 'kind' | 'title' | 'details' | 'status' | 'notes'>>) {
  const { data, error } = await db().from('feedback').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as Feedback
}

export async function deleteFeedback(id: string) {
  const { error } = await db().from('feedback').delete().eq('id', id)
  if (error) throw error
}
