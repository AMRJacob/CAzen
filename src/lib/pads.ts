import { db } from './supabase'
import type { InkPoint } from './ink'
import { today } from './dates'
import { all as localAll, get as localGet, marksOfPad, put as localPut, remove as localRemove } from './offline/store'
import { queue } from './offline/outbox'
import { localFirst, localFirstOne } from './offline/mirror'

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
  /** Every mark drawn with a thin white edge, to read over a photograph. */
  contrast?: boolean
  issued_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type MarkGeometry =
  | { points: InkPoint[] }
  | { x: number; y: number; w: number; h?: number }

export interface PadMark {
  id: string
  pad_id: string
  project_id: string
  page: number
  kind: MarkKind
  geometry: MarkGeometry
  /** `nib` says whether a stroke is ink or graphite; they are drawn differently. */
  /** `size` is a text box's type size, in page units like everything else on the pad. */
  /** `align`, `bold`, `italic`, `underline` are a text box's, and apply to the whole box. */
  style: { colour?: string; width?: number; nib?: 'pencil'; size?: number; align?: 'left' | 'center' | 'right'; bold?: boolean; italic?: boolean; underline?: boolean;
    /** A picture laid on the paper to draw over — a photograph, or a piece cut from a drawing: the
     *  path of its file. It is kept as a `text` mark with no words (the database knows three
     *  kinds of mark and this needed no fourth); `isPicture` tells the two apart. */
    image?: string
    /** An ink mark drawn as a straight arrow from its first point to its last. */
    arrow?: boolean
    /** A text box's leaders: the points they run to, in page units. */
    leaders?: [number, number][] }
  body: string | null
  created_by: string | null
  created_at: string
}

const PAD_COLUMNS = 'id, project_id, kind, title, noted_on, pages, rule, rule_ink, contrast, issued_id, created_by, created_at, updated_at'
const MARK_COLUMNS = 'id, pad_id, project_id, page, kind, geometry, style, body, created_by, created_at'

/** The colours a pen writes in. Ink first, because most notes are written in it. */
export const PAD_COLOURS = ['#2b2d2c', '#1f4e79', '#4aa3df', '#c0392b', '#e67e22', '#1f6f3f'] as const
/** What a highlighter lays down. Pale, because it goes over words rather than instead of them. */
export const HIGHLIGHTS = ['#f4e07a', '#b8e4c9', '#f6c6b8', '#c9d9f2'] as const

/** Who is signed in, from what this device already holds — asking the server needs signal. */
async function me(): Promise<string | null> {
  try { return (await db().auth.getSession()).data.session?.user.id ?? null } catch { return null }
}

const newestPad = (a: NotePad, b: NotePad) =>
  b.noted_on.localeCompare(a.noted_on) || b.created_at.localeCompare(a.created_at)

/*
 * Pads are written on in the field. Every read below answers from this device when the server
 * can't, and every write lands here first and goes to the server through the outbox — the same
 * road whether there are four bars or none.
 */

export function listPads(projectId: string, kind: PadKind): Promise<NotePad[]> {
  return localFirst<NotePad>({
    store: 'pads',
    here: async () => (await localAll<NotePad>('pads', projectId)).filter((p) => p.kind === kind),
    theirs: async () => {
      const { data, error } = await db()
        .from('note_pads').select(PAD_COLUMNS)
        .eq('project_id', projectId).eq('kind', kind)
        .order('noted_on', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as NotePad[]
    },
    sort: newestPad,
  })
}

export async function getPad(id: string): Promise<NotePad> {
  const here = await localGet<NotePad>('pads', id).catch(() => undefined)
  return localFirstOne<NotePad>('pads', id, here, async () => {
    const { data, error } = await db().from('note_pads').select(PAD_COLUMNS).eq('id', id).single()
    if (error) throw error
    return data as NotePad
  })
}

export async function newPad(projectId: string, kind: PadKind, fields: {
  title?: string | null
  noted_on?: string
}): Promise<NotePad> {
  const now = new Date().toISOString()
  // Everything the database would have filled in, filled in here, so the pad can be written on
  // before the database has heard of it.
  const pad: NotePad = {
    id: crypto.randomUUID(), project_id: projectId, kind,
    title: fields.title ?? null, noted_on: fields.noted_on ?? today(),
    pages: 1, rule: 'lines', rule_ink: 40, issued_id: null,
    created_by: await me(), created_at: now, updated_at: now,
  }
  await localPut('pads', pad)
  await queue(projectId, { kind: 'row.put', table: 'note_pads', row: pad as unknown as Record<string, unknown> })
  return pad
}

export async function setPad(id: string, patch: Partial<Pick<NotePad, 'title' | 'noted_on' | 'pages' | 'rule' | 'rule_ink' | 'contrast' | 'issued_id'>>): Promise<void> {
  const updated_at = new Date().toISOString()
  const had = await localGet<NotePad>('pads', id).catch(() => undefined)
  if (had) await localPut('pads', { ...had, ...patch, updated_at })
  await queue(had?.project_id ?? '', { kind: 'row.patch', table: 'note_pads', id, patch: { ...patch, updated_at } })
}

export async function removePad(id: string): Promise<void> {
  const had = await localGet<NotePad>('pads', id).catch(() => undefined)
  for (const m of await marksOfPad<PadMark>(id).catch(() => [] as PadMark[])) await localRemove('padMarks', m.id).catch(() => {})
  await localRemove('pads', id).catch(() => {})
  // Its marks go with it on the server: they hang off the pad.
  await queue(had?.project_id ?? '', { kind: 'row.remove', table: 'note_pads', ids: [id] })
}

const oldestMark = (a: PadMark, b: PadMark) => a.created_at.localeCompare(b.created_at)

export function listMarks(padId: string): Promise<PadMark[]> {
  return localFirst<PadMark>({
    store: 'padMarks',
    here: () => marksOfPad<PadMark>(padId),
    theirs: async () => {
      const { data, error } = await db()
        .from('pad_marks').select(MARK_COLUMNS).eq('pad_id', padId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PadMark[]
    },
    sort: oldestMark,
  })
}

export async function addMark(mark: {
  /** Chosen by the caller, so the stroke can be on screen before the server has heard of it. */
  id?: string
  pad_id: string
  project_id: string
  page: number
  kind: MarkKind
  geometry: MarkGeometry
  style?: PadMark['style']
  body?: string | null
}): Promise<PadMark> {
  const row: PadMark = {
    style: {}, body: null, created_by: await me(), created_at: new Date().toISOString(),
    ...mark, id: mark.id ?? crypto.randomUUID(),
  }
  await localPut('padMarks', row)
  await queue(row.project_id, { kind: 'row.put', table: 'pad_marks', row: row as unknown as Record<string, unknown> })
  return row
}

async function patchMark(id: string, patch: Partial<Pick<PadMark, 'body' | 'geometry' | 'style'>>): Promise<void> {
  const had = await localGet<PadMark>('padMarks', id).catch(() => undefined)
  if (had) await localPut('padMarks', { ...had, ...patch })
  await queue(had?.project_id ?? '', { kind: 'row.patch', table: 'pad_marks', id, patch })
}

/** The one thing that is edited rather than added: what a text box says. */
export const setMarkBody = (id: string, body: string) => patchMark(id, { body })

/** A text box made wider, narrower or taller: where it wraps is part of what was written. */
export const setMarkGeometry = (id: string, geometry: MarkGeometry) => patchMark(id, { geometry })

/** A stroke or a text box given another colour or width after the fact. */
export const setMarkStyle = (id: string, style: PadMark['style']) => patchMark(id, { style })

export async function removeMarks(ids: string[]): Promise<void> {
  if (!ids.length) return
  let project = ''
  for (const id of ids) {
    project ||= (await localGet<PadMark>('padMarks', id).catch(() => undefined))?.project_id ?? ''
    await localRemove('padMarks', id).catch(() => {})
  }
  await queue(project, { kind: 'row.remove', table: 'pad_marks', ids })
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
      // Unfiltered, for the reason given in markups.ts: a delete carries only the row's id.
      { event: 'DELETE', schema: 'public', table: 'pad_marks' },
      (payload) => { const id = (payload.old as { id?: string })?.id; if (id) on.removed(id) })
    .subscribe()
  return () => { void db().removeChannel(channel) }
}

/** A mark that is a picture on the paper rather than words. */
export const isPicture = (m: { kind: MarkKind; style?: { image?: string } }): boolean => m.kind === 'text' && !!m.style?.image
