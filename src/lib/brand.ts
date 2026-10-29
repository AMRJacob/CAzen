import { db } from './supabase'
import type { DocKind, Firm } from './types'

/** Everything a generated document needs to look like the firm's own paperwork. */
export interface Brand {
  firmName: string
  addressLines: string[]       // printed under the name, in order
  contactLine: string          // phone · email · website
  licenseText: string
  accent: string               // #rrggbb
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg' }
  letterhead?: Uint8Array      // full-page PDF drawn behind page 1
}

export const PLACEHOLDER_BRAND: Brand = {
  firmName: 'Your Firm Name',
  addressLines: ['Street address', 'City, State ZIP'],
  contactLine: 'phone · email · website',
  licenseText: '',
  accent: '#5f7a61',
}

/** Wording a firm can edit per document type. Missing keys fall back to these defaults. */
export interface SubmittalWording {
  title: string
  actions: Record<'no_exceptions' | 'exceptions_noted' | 'revise_resubmit' | 'rejected' | 'for_record', string>
  disclaimer: string
}

export interface GeneralWording {
  footer: string
}

export const DEFAULT_WORDING = {
  general: {
    footer: '',
  } as GeneralWording,
  submittal_cover: {
    title: 'Submittal Review',
    actions: {
      no_exceptions: 'No Exceptions Taken',
      exceptions_noted: 'Make Corrections Noted',
      revise_resubmit: 'Revise and Resubmit',
      rejected: 'Rejected',
      for_record: 'Received for Record Only',
    },
    disclaimer:
      'Review is for general conformance with the design concept and the information given in the contract documents. ' +
      'The Contractor remains responsible for dimensions, quantities, fabrication processes and techniques, ' +
      'coordination with other trades, and safe performance of the work.',
  } as SubmittalWording,
}

type WordingMap = typeof DEFAULT_WORDING

export function brandFromFirm(firm: Firm, assets: Pick<Brand, 'logo' | 'letterhead'> = {}): Brand {
  const contact = [firm.phone, firm.email, firm.website].filter(Boolean).join('  ·  ')
  return {
    firmName: firm.name,
    addressLines: [firm.address_line1, firm.address_line2, firm.city_state_zip].filter(Boolean) as string[],
    contactLine: contact,
    licenseText: firm.license_text ?? '',
    accent: firm.accent_color,
    ...assets,
  }
}

async function download(path: string | null): Promise<Uint8Array | undefined> {
  if (!path) return undefined
  const { data, error } = await db().storage.from('templates').download(path)
  if (error || !data) return undefined
  return new Uint8Array(await data.arrayBuffer())
}

/** Firm brand with its logo and letterhead files loaded. */
export async function loadBrand(firm: Firm): Promise<Brand> {
  const [logoBytes, letterhead] = await Promise.all([download(firm.logo_path), download(firm.letterhead_path)])
  const logo = logoBytes && firm.logo_path
    ? { bytes: logoBytes, type: (firm.logo_path.toLowerCase().endsWith('.png') ? 'png' : 'jpg') as 'png' | 'jpg' }
    : undefined
  return brandFromFirm(firm, { logo, letterhead })
}

export async function loadWording<K extends keyof WordingMap>(firmId: string, kind: K): Promise<WordingMap[K]> {
  const { data } = await db().from('doc_templates').select('settings').eq('firm_id', firmId).eq('kind', kind).maybeSingle()
  return mergeDeep(DEFAULT_WORDING[kind], (data?.settings ?? {}) as Partial<WordingMap[K]>)
}

export async function saveWording(firmId: string, kind: DocKind, settings: object) {
  const { data: u } = await db().auth.getUser()
  const { error } = await db().from('doc_templates').upsert({
    firm_id: firmId, kind, settings, updated_at: new Date().toISOString(), updated_by: u.user?.id,
  })
  if (error) throw error
}

/** Upload a logo or letterhead for the firm; returns the stored path. */
export async function uploadBrandFile(firmId: string, which: 'logo' | 'letterhead', file: File): Promise<string> {
  const ext = which === 'letterhead' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
  const path = `${firmId}/${which}.${ext}`
  const { error } = await db().storage.from('templates').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const column = which === 'logo' ? 'logo_path' : 'letterhead_path'
  const upd = await db().from('firms').update({ [column]: path }).eq('id', firmId)
  if (upd.error) throw upd.error
  return path
}

export async function removeBrandFile(firmId: string, which: 'logo' | 'letterhead', path: string) {
  await db().storage.from('templates').remove([path])
  const column = which === 'logo' ? 'logo_path' : 'letterhead_path'
  const upd = await db().from('firms').update({ [column]: null }).eq('id', firmId)
  if (upd.error) throw upd.error
}

function mergeDeep<T>(base: T, over: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(over ?? {})) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object'
      ? mergeDeep(b, v as object)
      : v === '' || v == null ? b : v
  }
  return out as T
}
