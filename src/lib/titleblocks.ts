import { db } from './supabase'
import { textInRegion, wordsInRegion, type PageText, type Region } from './pdf/pageText'

/**
 * A title block template: boxes drawn over one sheet saying where its sheet number, title
 * and revision mark sit. Firms keep several (their own, each consultant's), and each page of
 * an upload uses whichever template reads a valid sheet number there.
 */
export type RegionKey = 'number' | 'title' | 'revision'

export const REGION_LABELS: Record<RegionKey, string> = {
  number: 'Sheet number',
  title: 'Sheet title',
  revision: 'Revision mark',
}

export interface TitleblockTemplate {
  id: string
  firm_id: string
  name: string
  regions: Partial<Record<RegionKey, Region>>
  updated_at?: string
}

// A-201, A201, A2.01, S-101A, FP-1, M1.1, G0.00, AD-101 — common US sheet numbering.
export const SHEET_NUMBER = /^[A-Z]{1,3}[-.]?\d{1,4}(\.\d{1,3})?[A-Z]?$/

/** Sheet number as stored: upper case, spaces removed. */
export function cleanNumber(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '').replace(/^SHEET(NO\.?|NUMBER)?:?/, '')
}

export interface Reading {
  number: string
  title: string
  revision: string
  /** Which template read it; null = the automatic guess. */
  templateId: string | null
}

/** Read one page with one template. */
export function readWith(text: PageText, t: TitleblockTemplate): Reading {
  const get = (k: RegionKey) => (t.regions[k] ? textInRegion(text, t.regions[k]!) : '')
  return {
    number: t.regions.number ? numberIn(text, t.regions.number) : '',
    title: tidyTitle(get('title')),
    revision: get('revision').replace(/^REV(ISION)?S?\.?\s*(NO\.?|MARK)?:?\s*/i, '').trim(),
    templateId: t.id,
  }
}

/**
 * The sheet number inside a box. A box often catches its label too ("SHEET NO.", "DWG NO."),
 * so take the sheet-number-shaped piece, preferring the largest text.
 */
function numberIn(text: PageText, r: Region): string {
  let best: { value: string; size: number } | null = null
  for (const w of wordsInRegion(text, r)) {
    for (const piece of w.str.split(/[\s:]+/)) {
      const value = cleanNumber(piece)
      const size = w.vertical ? w.w : w.h
      if (SHEET_NUMBER.test(value) && (!best || size > best.size)) best = { value, size }
    }
  }
  return best?.value ?? cleanNumber(textInRegion(text, r))
}

/** Labels printed inside the box ("SHEET TITLE:") are dropped; the rest is kept as written. */
function tidyTitle(s: string): string {
  return s.replace(/^(SHEET\s+)?(TITLE|NAME)\s*:?\s*/i, '').trim()
}

/**
 * Read a page with whichever template fits it best: it must find a valid sheet number, and the
 * more of its boxes that find something, the better (so a consultant's template whose number box
 * happens to overlap your own doesn't win on your sheets). Ties go to the preferred template.
 * Falls back to a guess from the lower right of the sheet.
 */
export function readPage(text: PageText, templates: TitleblockTemplate[], preferred?: string | null): Reading {
  let best: { r: Reading; score: number } | null = null
  for (const t of templates) {
    const r = readWith(text, t)
    if (!SHEET_NUMBER.test(r.number)) continue
    const boxes = Object.keys(t.regions).length
    const found = 1 + (r.title ? 1 : 0) + (r.revision ? 1 : 0)
    const score = found / boxes + found * 0.01 + (t.id === preferred ? 0.001 : 0)
    if (!best || score > best.score) best = { r, score }
  }
  return best?.r ?? { number: guessNumber(text) ?? '', title: '', revision: '', templateId: null }
}

/** Without a template: the sheet-number-shaped word furthest to the lower right, larger text preferred. */
export function guessNumber(text: PageText): string | null {
  let best: { value: string; score: number } | null = null
  for (const w of text.words) {
    const value = cleanNumber(w.str)
    if (!SHEET_NUMBER.test(value)) continue
    const score = w.x + w.y + w.h * 8
    if (!best || score > best.score) best = { value, score }
  }
  return best?.value ?? null
}

export async function listTemplates(firmId: string): Promise<TitleblockTemplate[]> {
  const { data, error } = await db().from('titleblock_templates').select('id, firm_id, name, regions, updated_at').eq('firm_id', firmId).order('name')
  if (error) throw error
  return (data ?? []) as TitleblockTemplate[]
}

export async function saveTemplate(t: Omit<TitleblockTemplate, 'id'> & { id?: string }): Promise<TitleblockTemplate> {
  const row = { firm_id: t.firm_id, name: t.name.trim() || 'Title block', regions: t.regions, updated_at: new Date().toISOString() }
  const q = t.id
    ? db().from('titleblock_templates').update(row).eq('id', t.id).select('id, firm_id, name, regions, updated_at').single()
    : db().from('titleblock_templates').insert(row).select('id, firm_id, name, regions, updated_at').single()
  const { data, error } = await q
  if (error) throw error
  return data as TitleblockTemplate
}

export async function deleteTemplate(id: string) {
  const { error } = await db().from('titleblock_templates').delete().eq('id', id)
  if (error) throw error
}
