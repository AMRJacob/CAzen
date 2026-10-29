import type { Brand } from '../brand'
import type { FormKind, TemplateKind } from './types'

export interface FieldDef {
  key: string
  label: string
  sample: string
  multiline?: boolean
  /** How CAzen fills it in automatically (the person can always type over it):
   *  today = today's date · user = the signed-in person's name · next = next number in sequence
   *  carry = same as the last form of this type on the project · contractor = the project's contractor */
  auto?: 'today' | 'user' | 'next' | 'carry' | 'contractor' | 'division'
  /** Offer CSI MasterFormat suggestions while typing. */
  csi?: 'division' | 'section'
  /** Choice fields: the value is one of these keys. Labels are editable per template. */
  choices?: { value: string; label: string }[]
}

export const FORM_LABELS: Record<TemplateKind, string> = {
  general: 'Letterhead',
  submittal_cover: 'Submittal cover',
  asi: 'ASI',
  rfi_response: 'RFI response',
  pr: 'Proposal request',
  ccd: 'CCD',
  field_report: 'Field report',
}

/** Dates print as MM/DD/YYYY, as on US construction forms. */
export function usDate(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

const FIRM: FieldDef[] = [
  { key: 'firm.name', label: 'Firm name', sample: 'Your Firm, Architects' },
  { key: 'firm.address', label: 'Firm address', sample: '100 Main Street\nLittle Rock, AR 72201', multiline: true },
  { key: 'firm.contact', label: 'Firm phone · email · web', sample: '501-555-0100  ·  yourfirm.com' },
  { key: 'firm.license', label: 'Firm license line', sample: 'State certificate of authority no. 0000' },
]

const PROJECT: FieldDef[] = [
  { key: 'project.name', label: 'Project name', sample: 'Westrock Landing WMO' },
  { key: 'project.number', label: 'Project no.', sample: '2025-014' },
  { key: 'project.owner', label: 'Owner', sample: 'Central Arkansas Water' },
  { key: 'project.contractor', label: 'Contractor', sample: 'Sample Builders, Inc.' },
  { key: 'project.address', label: 'Project address', sample: '1 Project Way, Little Rock, AR' },
  { key: 'doc.date', auto: 'today', label: 'Date issued', sample: usDate(new Date()) },
]

const PAGE_FIELD: FieldDef = { key: 'doc.page', label: 'Page n of N', sample: 'Page 1 of 1' }

export const SUBMITTAL_ACTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'approved_noted', label: 'Approved as Noted' },
  { value: 'revise_resubmit', label: 'Revise & Resubmit' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'for_record', label: 'Received for Record Only' },
]

const FORM_FIELDS: Record<FormKind, FieldDef[]> = {
  submittal_cover: [
    { key: 'sub.number', auto: 'next', csi: 'section', label: 'Reference / submittal no.', sample: '09 30 00 - 001' },
    { key: 'sub.division', auto: 'division', csi: 'division', label: 'Division', sample: '09 - FINISHES' },
    { key: 'sub.title', label: 'Submittal name', sample: 'Tiling Finishes' },
    { key: 'sub.subcontractor', label: 'Sub contractor', sample: 'Sample Tile Co.' },
    { key: 'sub.contact_name', auto: 'carry', label: 'Contact name', sample: 'Pat Jones' },
    { key: 'sub.contact_phone', auto: 'carry', label: 'Contact no.', sample: '(501) 555-0123' },
    { key: 'sub.received', auto: 'today', label: 'Date received', sample: '02/04/2026' },
    { key: 'sub.to_consultant', label: 'Date forwarded (to consultant)', sample: '' },
    { key: 'sub.from_consultant', label: 'Date returned (from consultant)', sample: '' },
    { key: 'sub.returned', auto: 'today', label: 'Date returned to contractor', sample: '02/10/2026' },
    { key: 'sub.items', label: 'Items transmitted', sample: 'Product Data', multiline: true },
    { key: 'sub.comments', label: 'Review comments', sample: 'PT-01 - White, vertical stacked, glossy\n\nTS-02 - Coordinate installation with tile and flooring installation.\n  - Color: Satin nickel anodized aluminum', multiline: true },
    { key: 'sub.action', label: 'Action', sample: 'approved_noted', choices: SUBMITTAL_ACTIONS },
    { key: 'sub.reviewer', auto: 'user', label: 'Reviewed by', sample: 'L. Duran' },
  ],
  asi: [
    { key: 'asi.number', auto: 'next', label: 'ASI no.', sample: 'ASI-003' },
    { key: 'asi.title', label: 'Subject', sample: 'Revised storefront head detail' },
    { key: 'asi.description', label: 'Instructions', sample: 'Revise storefront head per attached detail 5/A-501. Provide continuous sealant joint at head.', multiline: true },
    { key: 'asi.sheets', label: 'Sheets / sections affected', sample: 'A-201, A-501; 08 43 13', multiline: true },
    { key: 'asi.impact', label: 'Contract impact', sample: 'none', choices: [
      { value: 'none', label: 'No change in Contract Sum or Contract Time' },
      { value: 'proposal', label: 'Submit proposal before proceeding if a change is claimed' },
    ] },
    { key: 'asi.issued_by', auto: 'user', label: 'Issued by', sample: 'J. Smith, AIA' },
  ],
  rfi_response: [
    { key: 'rfi.number', auto: 'next', label: 'RFI no.', sample: 'RFI-012' },
    { key: 'rfi.subject', label: 'Subject', sample: 'Roof drain location at grid C-4' },
    { key: 'rfi.from', auto: 'contractor', label: 'From', sample: 'Sample Builders, Inc.' },
    { key: 'rfi.received', auto: 'today', label: 'Date received', sample: '10/22/2026' },
    { key: 'rfi.question', label: 'Question', sample: 'Plumbing and structural drawings show conflicting drain locations at C-4. Please confirm.', multiline: true },
    { key: 'rfi.response', label: 'Response', sample: 'Locate drain per plumbing plan P-201. Adjust structural framing per attached sketch SK-4.', multiline: true },
    { key: 'rfi.answered_by', auto: 'user', label: 'Answered by', sample: 'J. Smith, AIA' },
  ],
  pr: [
    { key: 'pr.number', auto: 'next', label: 'PR no.', sample: 'PR-002' },
    { key: 'pr.title', label: 'Subject', sample: 'Add card reader at Vestibule 101' },
    { key: 'pr.description', label: 'Description of proposed change', sample: 'Provide card reader and electrified hardware at Door 101A as indicated on attached sketches.', multiline: true },
    { key: 'pr.due', label: 'Proposal due', sample: '11/10/2026' },
    { key: 'pr.attachments', label: 'Attachments', sample: 'SK-7, SK-8', multiline: true },
    { key: 'pr.issued_by', auto: 'user', label: 'Issued by', sample: 'J. Smith, AIA' },
  ],
  ccd: [
    { key: 'ccd.number', auto: 'next', label: 'CCD no.', sample: 'CCD-001' },
    { key: 'ccd.title', label: 'Subject', sample: 'Unforeseen rock excavation' },
    { key: 'ccd.description', label: 'Directive', sample: 'Proceed with removal of rock encountered at footing F-3 as directed in the field on 2026-10-15.', multiline: true },
    { key: 'ccd.cost_basis', label: 'Basis of adjustment', sample: 'unit', choices: [
      { value: 'lump', label: 'Lump sum' },
      { value: 'unit', label: 'Unit prices' },
      { value: 'cost_plus', label: 'Cost plus fee' },
      { value: 'tbd', label: 'To be determined' },
    ] },
    { key: 'ccd.amount', label: 'Proposed amount', sample: '$12,400' },
    { key: 'ccd.time', label: 'Change in contract time', sample: '3 days' },
    { key: 'ccd.issued_by', auto: 'user', label: 'Issued by', sample: 'J. Smith, AIA' },
  ],
  field_report: [
    { key: 'fr.number', auto: 'next', label: 'Report no.', sample: 'FR-007' },
    { key: 'fr.date', auto: 'today', label: 'Date', sample: '10/19/2026' },
    { key: 'fr.time', label: 'Time', sample: '2:00 PM' },
    { key: 'fr.location', auto: 'carry', label: 'Location', sample: 'Job site\nLittle Rock, AR', multiline: true },
    { key: 'fr.weather', label: 'Weather', sample: 'Sunny, upper 80s°F' },
    { key: 'fr.participants', auto: 'carry', label: 'Participants (Name | Company | Email per line)', sample: 'Pat Owner | Owner | pat@owner.org\nSam Super | Sample Builders | sam@builders.com\nJ. Smith | Your Firm | jsmith@yourfirm.com', multiline: true },
    { key: 'fr.notes', label: 'Observations and notes', multiline: true, sample: '# Field Observations\n1. Site / Parking\n  1. Footings excavated and Sonotubes in place for light pole bases.\n2. Framing\n  1. Interior metal stud wall framing nearly complete.\n  2. Blocking installation underway.\n# Meeting Notes\n1. Job Progress\n  1. Rain garden basins to be delivered by the end of the week.\n  2. Brick installation to begin in approximately two weeks.\n    1. Brick and block are on site.' },
    { key: 'fr.observed_by', auto: 'user', label: 'Observed by', sample: 'J. Smith, AIA' },
  ],
}

/** Fields a person fills in when issuing the form (firm fields and page numbers fill themselves). */
export function inputFieldsFor(kind: FormKind): FieldDef[] {
  return [...PROJECT, ...FORM_FIELDS[kind]]
}

/** Fields offered in the editor for a template kind. */
export function fieldsFor(kind: TemplateKind): FieldDef[] {
  return kind === 'general' ? [...FIRM, PROJECT[5], PAGE_FIELD] : [...FIRM, ...PROJECT, PAGE_FIELD, ...FORM_FIELDS[kind]]
}

export function fieldDef(kind: TemplateKind, key: string): FieldDef | undefined {
  return fieldsFor(kind).find((f) => f.key === key)
}

/** Values from the firm brand, so firm fields stay current after a rebrand. */
export function firmValues(brand: Brand): Record<string, string> {
  return {
    'firm.name': brand.firmName,
    'firm.address': brand.addressLines.join('\n'),
    'firm.contact': brand.contactLine,
    'firm.license': brand.licenseText,
  }
}

/** Sample values for previews, with the firm's real details. */
export function sampleValues(kind: TemplateKind, brand: Brand): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fieldsFor(kind)) out[f.key] = f.sample
  return { ...out, ...firmValues(brand) }
}
