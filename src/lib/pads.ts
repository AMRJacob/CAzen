import { db } from './supabase'
import type { InkPoint } from './ink'

/**
 * Notes pads: what somebody wrote in the room.
 *
 * A pad is pages, and a page is marks. Every mark is a row of its own and nothing is ever
 * rewritten, so two people writing on the same pad at the same time are never touching the
 * same row — which is what makes it safe to let them, and why the only merge needed is
 * "whatever arrives, draw it".
 */

export type PadKind = 'meeting_notes' | 'field_report'
export type MarkKind = 'ink' | 'highlight' | 'text'
/** What the paper looks like under the writing. */
export type PadRule = 'lines' | 'grid' | 'dots' | 'blank'

export interface NotePad {
  id: string
  project_id: string
  kind: PadKind
  title: string | null
  noted_on: string
  pages: number
  rule: PadRule
  /** How strongly the ruling is drawn, nought to a hundred. */
  rule_ink: number
  issued_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type MarkGeometry =
  | { points: InkPoint[] }
  | { x: number; y: number; w: number }

export interface PadMark {
  id: string
  pad_id: string
  project_id: string
  page: number
  kind: MarkKind
  geometry: MarkGeometry
  style: { colour?: string; width?: number }
  body: string | null
  created_by: string | null
  created_at: string
}

const PAD_COLUMNS = 'id, project_id, kind, title, noted_on, pages, rule, rule_ink, issued_id, created_by, created_at, updated_at'
const MARK_COLUMNS = 'id, pad_id, project_id, page, kind, geometry, style, body, created_by, created_at'

/** The colours a pen writes in. Ink first, because most notes are written in it. */
export const PAD_COLOURS = ['#2b2d2c', '#1f4e79', '#c0392b', '#1f6f3f'] as const
/** What a highlighter lays down. Pale, because it goes over words rather than instead of them. */
export const HIGHLIGHTS = ['#f4e07a', '#b8e4c9', '#f6c6b8', '#c9d9f2'] as const

export async function listPads(projectId: string, kind: PadKind): Promise<NotePad[]> {
  const { data, error } = await db()
    .from('note_pads').select(PAD_COLUMNS)
    .eq('project_id', projectId).eq('kind', kind)
    .order('noted_on', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as NotePad[]
}

export async function getPad(id: string): Promise<NotePad> {
  const { data, error } = await db().from('note_pads').select(PAD_COLUMNS).eq('id', id).single()
  if (error) throw error
  return data as NotePad
}

export async function newPad(projectId: string, kind: PadKind, fields: {
  title?: string | null
  noted_on?: string
}): Promise<NotePad> {
  const { data: u } = await db().auth.getUser()
  const { data, error } = await db().from('note_pads')
    .insert({ project_id: projectId, kind, created_by: u.user?.id ?? null, ...fields })
    .select(PAD_COLUMNS).single()
  if (error) throw error
  return data as NotePad
}

export async function setPad(id: string, patch: Partial<Pick<NotePad, 'title' | 'noted_on' | 'pages' | 'rule' | 'rule_ink' | 'issued_id'>>): Promise<void> {
  const { error } = await db().from('note_pads')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function removePad(id: string): Promise<void> {
  const { error } = await db().from('note_pads').delete().eq('id', id)
  if (error) throw error
}

export async function listMarks(padId: string): Promise<PadMark[]> {
  const { data, error } = await db()
    .from('pad_marks').select(MARK_COLUMNS).eq('pad_id', padId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PadMark[]
}

export async function addMark(mark: {
  pad_id: string
  project_id: string
  page: number
  kind: MarkKind
  geometry: MarkGeometry
  style?: { colour?: string; width?: number }
  body?: string | null
}): Promise<PadMark> {
  const { data: u } = await db().auth.getUser()
  const { data, error } = await db().from('pad_marks')
    .insert({ style: {}, body: null, created_by: u.user?.id ?? null, ...mark })
    .select(MARK_COLUMNS).single()
  if (error) throw error
  return data as PadMark
}

/** The one thing that is edited rather than added: what a text box says. */
export async function setMarkBody(id: string, body: string): Promise<void> {
  const { error } = await db().from('pad_marks').update({ body }).eq('id', id)
  if (error) throw error
}

export async function removeMarks(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await db().from('pad_marks').delete().in('id', ids)
  if (error) throw error
}

/**
 * Everything anybody else writes on this pad, as they write it.
 *
 * Marks arrive one row at a time, which is the whole shape of the collaboration: the handler
 * is told what appeared or went, and what to do about it is the caller's business. The
 * returned function stops listening.
 */
export function watchPad(padId: string, on: {
  added: (mark: PadMark) => void
  removed: (id: string) => void
  changed: (mark: PadMark) => void
}): () => void {
  const channel = db()
    .channel(`pad:${padId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pad_marks', filter: `pad_id=eq.${padId}` },
      (payload) => on.added(payload.new as PadMark))
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pad_marks', filter: `pad_id=eq.${padId}` },
      (payload) => on.changed(payload.new as PadMark))
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'pad_marks', filter: `pad_id=eq.${padId}` },
      (payload) => on.removed((payload.old as { id: string }).id))
    .subscribe()
  return () => { void db().removeChannel(channel) }
}
