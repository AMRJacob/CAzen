import type { Discipline } from './disciplines'

export interface Project {
  id: string
  number: string
  name: string
  owner_name: string | null
  contractor_name: string | null
  address: string | null
  status: 'active' | 'closed' | 'archived'
  /** Sheet order for this project; null = the firm's. */
  discipline_order?: Discipline[] | null
  /** Where files are saved: CAzen cloud storage, or a folder on each user's computer (a mapped shared folder). */
  storage?: 'cloud' | 'folder' | null
  /** The chosen folder's name, to help people connect the same folder. */
  folder_name?: string | null
  created_at: string
}

export type IssuanceKind =
  | 'bid_set' | 'conformed_set' | 'addendum' | 'asi' | 'bulletin' | 'ccd' | 'change_order' | 'other'

export const ISSUANCE_LABELS: Record<IssuanceKind, string> = {
  bid_set: 'Bid set',
  conformed_set: 'Conformed set',
  addendum: 'Addendum',
  asi: 'ASI',
  bulletin: 'Bulletin',
  ccd: 'CCD',
  change_order: 'Change order',
  other: 'Other',
}

export interface CurrentSheet {
  sheet_id: string
  project_id: string
  number: string
  title: string | null
  discipline: string | null
  is_void: boolean
  revision_id: string
  revision_index: number
  revision_label: string | null
  file_path: string
  issuance_kind: IssuanceKind
  issuance_number: string | null
  issued_on: string
  revision_count: number
}

export interface SheetRevision {
  id: string
  revision_index: number
  revision_label: string | null
  title_at_rev: string | null
  file_path: string
  created_at: string
  issuances: { kind: IssuanceKind; number: string | null; issued_on: string } | null
}

export interface Firm {
  id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city_state_zip: string | null
  phone: string | null
  email: string | null
  website: string | null
  license_text: string | null
  accent_color: string
  logo_path: string | null
  letterhead_path: string | null
  /** Default sheet order for the firm's projects; null = the standard order. */
  discipline_order?: Discipline[] | null
  created_at: string
}

export type FirmRole = 'owner' | 'admin' | 'member'

export type DocKind = 'general' | 'submittal_cover' | 'asi' | 'pr' | 'rfi_response' | 'ccd' | 'field_report' | 'transmittal'
