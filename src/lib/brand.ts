import { db } from './supabase'
import type { Firm } from './types'

/** Everything a generated document needs to look like the firm's own paperwork. */
export interface Brand {
  firmName: string
  addressLines: string[]       // printed under the name, in order
  contactLine: string          // phone · email · website
  licenseText: string
  accent: string               // #rrggbb
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg' }
  letterhead?: Uint8Array      // full-page PDF drawn behind forms that use the letterhead
}

export const PLACEHOLDER_BRAND: Brand = {
  firmName: 'Your Firm Name',
  addressLines: ['Street address', 'City, State ZIP'],
  contactLine: 'phone  ·  website',
  licenseText: '',
  accent: '#5f7a61',
}

export function brandFromFirm(firm: Firm, assets: Pick<Brand, 'logo' | 'letterhead'> = {}): Brand {
  return {
    firmName: firm.name,
    addressLines: [firm.address_line1, firm.address_line2, firm.city_state_zip].filter(Boolean) as string[],
    contactLine: [firm.phone, firm.email, firm.website].filter(Boolean).join('  ·  '),
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
