export interface Project {
  id: string
  number: string
  name: string
  owner_name: string | null
  contractor_name: string | null
  address: string | null
  status: 'active' | 'closed' | 'archived'
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
