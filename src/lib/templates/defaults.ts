import { DEFAULT_CONTINUATION, newId, type El, type FieldEl, type Layout, type TemplateKind, type TextEl } from './types'
import { SUBMITTAL_ACTIONS } from './fields'

// Small builders so the defaults read like a drawing schedule. Units: points, from top-left.
const text = (x: number, y: number, w: number, h: number, t: string, o: Partial<TextEl> = {}): TextEl =>
  ({ id: newId(), type: 'text', x, y, w, h, text: t, size: 9, bold: false, align: 'left', color: 'ink', ...o })

const field = (x: number, y: number, w: number, h: number, key: string, o: Partial<FieldEl> = {}): FieldEl =>
  ({ id: newId(), type: 'field', x, y, w, h, field: key, label: '', labelMode: 'none', labelWidth: 80, labelAlign: 'right', size: 9, bold: false, align: 'left', color: 'ink', ...o })

const labeled = (x: number, y: number, w: number, key: string, label: string, labelWidth = 80, o: Partial<FieldEl> = {}) =>
  field(x, y, w, 13, key, { label, labelMode: 'left', labelWidth, ...o })

const hline = (x: number, y: number, w: number, o: { stroke?: 'ink' | 'muted' | 'accent'; lineWidth?: number; repeat?: boolean } = {}): El =>
  ({ id: newId(), type: 'line', x, y, w, h: 2, stroke: o.stroke ?? 'muted', lineWidth: o.lineWidth ?? 0.6, repeat: o.repeat })

const heading = (x: number, y: number, t: string) => text(x, y, 260, 13, t, { bold: true, size: 9, caps: true })

/** Title and project lines that sit beside the logo on every form. */
function formHeader(title: string, rows: [string, string][]): El[] {
  const els: El[] = [text(118, 30, 320, 18, title, { size: 13.5, bold: true, color: 'accent', caps: true, repeat: true })]
  rows.forEach(([label, key], i) => {
    els.push(labeled(118, 54 + i * 13.5, 320, key, label, 70, { size: 8.5, bold: true, repeat: true }))
  })
  return els
}

function signature(y: number, key: string, label = 'By:', labelWidth = 30): El[] {
  const line = 316 + labelWidth
  return [
    labeled(316, y, 260, key, label, labelWidth, { labelAlign: 'left' }),
    hline(line, y + 13, 576 - line, { stroke: 'ink', lineWidth: 0.5 }),
    labeled(316, y + 20, 260, 'doc.date', 'Date:', labelWidth, { labelAlign: 'left' }),
    hline(line, y + 33, 576 - line, { stroke: 'ink', lineWidth: 0.5 }),
  ]
}

const LETTERHEAD = (): Layout => ({
  useLetterhead: true,
  elements: [
    { id: newId(), type: 'logo', x: 36, y: 26, w: 74, h: 74 },
    { id: newId(), type: 'line', x: 446, y: 30, w: 3, h: 56, stroke: 'accent', lineWidth: 2.5 },
    field(456, 30, 130, 11, 'firm.name', { size: 8, bold: true, color: 'accent', serif: false }),
    field(456, 42, 130, 22, 'firm.address', { size: 7.5, color: 'muted' }),
    field(456, 66, 130, 22, 'firm.contact', { size: 7.5, color: 'muted' }),
    hline(36, 112, 540, { stroke: 'muted', lineWidth: 0.6 }),
    field(36, 756, 260, 11, 'firm.license', { size: 7, color: 'muted' }),
    field(406, 756, 170, 11, 'doc.page', { size: 7.5, color: 'muted', align: 'right' }),
  ],
})

const SUBMITTAL = (): Layout => ({
  useLetterhead: true,
  elements: [
    ...formHeader('Shop Drawing Transmittal', [['Project:', 'project.name'], ['Division:', 'sub.division'], ['Name:', 'sub.title'], ['Reference #:', 'sub.number']]),
    labeled(36, 126, 330, 'project.contractor', 'Contractor:', 86, { bold: true }),
    labeled(36, 142, 330, 'sub.subcontractor', 'Sub Contractor:', 86),
    labeled(36, 158, 330, 'project.address', 'Location:', 86),
    labeled(36, 174, 330, 'sub.contact_name', 'Contact Name:', 86),
    labeled(36, 190, 330, 'sub.contact_phone', 'Contact #:', 86),
    labeled(380, 126, 196, 'sub.received', 'Date Received:', 100),
    labeled(380, 142, 196, 'sub.to_consultant', 'Date Forwarded:', 100),
    labeled(380, 158, 196, 'sub.from_consultant', 'Date Returned:', 100),
    labeled(380, 174, 196, 'sub.returned', 'Date Forwarded:', 100),
    hline(36, 212, 540),
    heading(36, 222, 'Items Transmitted:'),
    field(36, 236, 540, 30, 'sub.items'),
    heading(36, 276, 'Review Comments:'),
    field(36, 290, 540, 112, 'sub.comments', { rich: true }),
    { id: newId(), type: 'box', x: 300, y: 412, w: 276, h: 330, stroke: 'accent', lineWidth: 1, fill: 'none' },
    {
      id: newId(), type: 'choices', x: 312, y: 424, w: 252, h: 150, field: 'sub.action', size: 8.5, direction: 'vertical',
      options: [
        SUBMITTAL_ACTIONS[0],
        { ...SUBMITTAL_ACTIONS[1], note: 'Fabrication MAY be undertaken. Approval does not authorize changes to Contract Sum unless stated in separate letter or Change Order.' },
        { ...SUBMITTAL_ACTIONS[2], note: 'Fabrication MAY NOT be undertaken. Resubmit corrected copies for final approval. Correction shall be limited to items marked.' },
      ],
    },
    text(312, 588, 252, 84,
      'Review is only for conformance with the design concept of the Project and compliance with the information given in the Contract Documents. The Contractor is responsible for dimensions to be confirmed and correlated at the site, for information that pertains solely to the fabrication processes or to the means, methods, techniques, sequences and procedures of construction, and for coordination of the Work of all trades.',
      { size: 7, color: 'muted' }),
    field(312, 680, 252, 12, 'firm.name', { bold: true, align: 'center', size: 8.5 }),
    labeled(312, 700, 252, 'sub.reviewer', 'By:', 26, { labelAlign: 'left' }),
    hline(338, 713, 226, { stroke: 'ink', lineWidth: 0.5 }),
    labeled(312, 718, 252, 'sub.returned', 'Date:', 26, { labelAlign: 'left' }),
  ],
})

const FIELD_REPORT = (): Layout => ({
  useLetterhead: true,
  continuation: DEFAULT_CONTINUATION,
  elements: [
    text(118, 30, 320, 18, 'Field Report / Meeting Minutes', { size: 13.5, bold: true, color: 'accent', caps: true, repeat: true }),
    field(118, 54, 320, 14, 'project.name', { size: 10, bold: true, repeat: true }),
    field(118, 72, 320, 14, 'project.owner', { size: 10, bold: true, repeat: true }),
    labeled(36, 126, 180, 'fr.date', 'DATE:', 62, { labelAlign: 'left', size: 8.5 }),
    labeled(36, 152, 180, 'fr.time', 'TIME:', 62, { labelAlign: 'left', size: 8.5 }),
    field(36, 178, 180, 26, 'fr.location', { label: 'LOCATION:', labelMode: 'left', labelWidth: 62, labelAlign: 'left', size: 8.5 }),
    labeled(36, 212, 180, 'fr.weather', 'WEATHER:', 62, { labelAlign: 'left', size: 8.5 }),
    heading(226, 122, 'Participants:'),
    { id: newId(), type: 'table', x: 226, y: 136, w: 350, h: 104, field: 'fr.participants', size: 8, header: false,
      columns: [{ label: 'Name', width: 110 }, { label: 'Company', width: 90 }, { label: 'Email', width: 150 }] },
    hline(36, 250, 540),
    text(36, 256, 540, 34,
      'This confirms and records our interpretation of the discussions which occurred and our understanding reached during this meeting. Unless notified in writing within seven days of receipt, we will assume that the following interpretation or description is complete and accurate.',
      { size: 7.5, color: 'muted' }),
    hline(36, 294, 540),
    field(54, 306, 514, 438, 'fr.observations', {
      size: 9.5, rich: true, flow: true,
      headings: 'bold',
      combine: [{ field: 'fr.observations', heading: 'Field Observations' }, { field: 'fr.notes', heading: 'Meeting Notes' }],
    }),
  ],
})

/* The field report's header without the site: who was there, when and where, then the notes. */
const MEETING_NOTES = (): Layout => ({
  useLetterhead: true,
  continuation: DEFAULT_CONTINUATION,
  elements: [
    text(118, 30, 320, 18, 'Meeting Minutes', { size: 13.5, bold: true, color: 'accent', caps: true, repeat: true }),
    field(118, 54, 320, 14, 'project.name', { size: 10, bold: true, repeat: true }),
    field(118, 72, 320, 14, 'project.owner', { size: 10, bold: true, repeat: true }),
    labeled(36, 126, 180, 'mn.title', 'MEETING:', 62, { labelAlign: 'left', size: 8.5 }),
    labeled(36, 152, 180, 'mn.date', 'DATE:', 62, { labelAlign: 'left', size: 8.5 }),
    labeled(36, 178, 180, 'mn.time', 'TIME:', 62, { labelAlign: 'left', size: 8.5 }),
    field(36, 204, 180, 26, 'mn.location', { label: 'LOCATION:', labelMode: 'left', labelWidth: 62, labelAlign: 'left', size: 8.5 }),
    heading(226, 122, 'Participants:'),
    { id: newId(), type: 'table', x: 226, y: 136, w: 350, h: 104, field: 'mn.participants', size: 8, header: false,
      columns: [{ label: 'Name', width: 110 }, { label: 'Company', width: 90 }, { label: 'Email', width: 150 }] },
    hline(36, 250, 540),
    text(36, 256, 540, 34,
      'This confirms and records our interpretation of the discussions which occurred and our understanding reached during this meeting. Unless notified in writing within seven days of receipt, we will assume that the following interpretation or description is complete and accurate.',
      { size: 7.5, color: 'muted' }),
    hline(36, 294, 540),
    field(54, 306, 514, 438, 'mn.notes', { size: 9.5, rich: true, flow: true, headings: 'bold' }),
  ],
})

/**
 * A meeting agenda on the firm's letterhead (Jacob, 11/23) — made from a notebook page's Agenda
 * block, downloaded, and not entered in the issued register, so it is drawn from this layout
 * rather than from a stored, editable template. The meeting notes' header, then the agenda.
 */
export const AGENDA = (): Layout => ({
  useLetterhead: true,
  continuation: DEFAULT_CONTINUATION,
  elements: [
    text(118, 30, 320, 18, 'Meeting Agenda', { size: 13.5, bold: true, color: 'accent', caps: true, repeat: true }),
    field(118, 54, 320, 14, 'project.name', { size: 10, bold: true, repeat: true }),
    field(118, 72, 320, 14, 'project.owner', { size: 10, bold: true, repeat: true }),
    labeled(36, 126, 180, 'ag.title', 'MEETING:', 62, { labelAlign: 'left', size: 8.5 }),
    labeled(36, 152, 180, 'ag.date', 'DATE:', 62, { labelAlign: 'left', size: 8.5 }),
    labeled(36, 178, 180, 'ag.time', 'TIME:', 62, { labelAlign: 'left', size: 8.5 }),
    field(36, 204, 180, 26, 'ag.location', { label: 'LOCATION:', labelMode: 'left', labelWidth: 62, labelAlign: 'left', size: 8.5 }),
    heading(226, 122, 'Invited:'),
    { id: newId(), type: 'table', x: 226, y: 136, w: 350, h: 104, field: 'ag.participants', size: 8, header: false,
      columns: [{ label: 'Name', width: 110 }, { label: 'Company', width: 90 }, { label: 'Email', width: 150 }] },
    hline(36, 250, 540),
    field(54, 262, 514, 482, 'ag.items', { size: 9.5, rich: true, flow: true, headings: 'bold' }),
  ],
})

/* Where the contract total actually moves. The sums sit in a column so they read as the
   arithmetic they are, and the signatures are the point of the page. */
const CHANGE_ORDER = (): Layout => ({
  useLetterhead: true,
  continuation: DEFAULT_CONTINUATION,
  elements: [
    ...formHeader('Change Order', [['Project:', 'project.name'], ['Owner:', 'co.owner'], ['Contractor:', 'co.contractor'], ['Change Order #:', 'co.number']]),
    labeled(36, 126, 540, 'co.title', 'Subject:', 70, { bold: true }),
    labeled(36, 144, 540, 'doc.date', 'Date:', 70),
    hline(36, 164, 540),

    heading(36, 174, 'The Contract is changed as follows:'),
    field(36, 190, 540, 230, 'co.description', { size: 9, rich: true, flow: true, headings: 'plain' }),

    hline(36, 430, 540),
    labeled(36, 440, 400, 'co.original_sum', 'Original contract sum:', 250, { labelAlign: 'left', align: 'right' }),
    labeled(36, 458, 400, 'co.previous_sum', 'Net change by previously authorized change orders:', 250, { labelAlign: 'left', align: 'right' }),
    labeled(36, 476, 400, 'co.before_sum', 'Contract sum before this change order:', 250, { labelAlign: 'left', align: 'right' }),
    labeled(36, 494, 400, 'co.this_sum', 'Amount of this change order:', 250, { labelAlign: 'left', align: 'right', bold: true }),
    labeled(36, 512, 400, 'co.new_sum', 'New contract sum:', 250, { labelAlign: 'left', align: 'right', bold: true }),
    hline(36, 530, 400),
    labeled(36, 540, 400, 'co.time_change', 'Change in contract time:', 250, { labelAlign: 'left', align: 'right' }),
    labeled(36, 558, 400, 'co.completion', 'Substantial completion date:', 250, { labelAlign: 'left', align: 'right' }),

    hline(36, 584, 540),
    text(36, 592, 540, 22, 'This change order is subject to the terms of the Contract Documents. The Contract Sum and Contract Time stated above are the full compensation and time for the change described.', { size: 7.5, color: 'muted' }),
    // Three signatures and their dates: 42pt each, finishing clear of the page number.
    ...signature(620, 'co.architect', 'Architect:', 64),
    ...signature(662, 'co.contractor', 'Contractor:', 64),
    ...signature(704, 'co.owner', 'Owner:', 64),
  ],
})

function simpleForm(title: string, prefix: string, numberLabel: string, body: El[]): Layout {
  return {
    useLetterhead: true,
    continuation: DEFAULT_CONTINUATION,
    elements: [
      ...formHeader(title, [['Project:', 'project.name'], ['Project #:', 'project.number'], [numberLabel, `${prefix}.number`], ['Date:', 'doc.date']]),
      labeled(36, 126, 330, 'project.owner', 'Owner:', 70),
      labeled(36, 142, 330, 'project.contractor', 'Contractor:', 70),
      hline(36, 164, 540),
      ...body,
    ],
  }
}

const ASI = (): Layout => simpleForm("Architect's Supplemental Instruction", 'asi', 'ASI #:', [
  labeled(36, 176, 540, 'asi.title', 'Subject:', 70, { bold: true }),
  text(36, 196, 540, 34, 'The Work shall be carried out in accordance with the following supplemental instructions issued in accordance with the Contract Documents without change in Contract Sum or Contract Time.', { size: 8, color: 'muted' }),
  heading(36, 238, 'Instructions:'),
  field(36, 254, 540, 260, 'asi.description', { rich: true, flow: true }),
  heading(36, 526, 'Sheets / Sections Affected:'),
  field(36, 542, 540, 40, 'asi.sheets'),
  { id: newId(), type: 'choices', x: 36, y: 594, w: 360, h: 40, field: 'asi.impact', size: 8.5, direction: 'vertical',
    options: [{ value: 'none', label: 'No change in Contract Sum or Contract Time' }, { value: 'proposal', label: 'Submit proposal before proceeding if a change is claimed' }] },
  ...signature(680, 'asi.issued_by', 'Issued:'),
])

const ADDENDUM = (): Layout => simpleForm('Addendum', 'addendum', 'Addendum No.:', [
  labeled(36, 176, 540, 'addendum.title', 'Subject:', 70, { bold: true }),
  labeled(36, 192, 540, 'addendum.bid_date', 'Bid date:', 70),
  text(36, 212, 540, 34, 'This Addendum forms a part of the Bidding Documents and modifies them as described below. Acknowledge receipt of this Addendum on the Bid Form; failure to do so may subject the bidder to disqualification.', { size: 8, color: 'muted' }),
  heading(36, 254, 'Changes:'),
  field(36, 270, 540, 250, 'addendum.description', { rich: true, flow: true }),
  heading(36, 532, 'Sheets / Sections Attached:'),
  field(36, 548, 540, 40, 'addendum.sheets'),
  ...signature(680, 'addendum.issued_by', 'Issued:'),
])

const RFI = (): Layout => simpleForm('RFI Response', 'rfi', 'RFI #:', [
  labeled(36, 176, 540, 'rfi.subject', 'Subject:', 70, { bold: true }),
  labeled(36, 192, 330, 'rfi.from', 'From:', 70),
  labeled(380, 192, 196, 'rfi.received', 'Received:', 70),
  heading(36, 216, 'Question:'),
  { id: newId(), type: 'box', x: 36, y: 232, w: 540, h: 120, stroke: 'none', lineWidth: 0, fill: 'wash' },
  field(46, 240, 520, 104, 'rfi.question'),
  heading(36, 366, 'Response:'),
  field(36, 382, 540, 280, 'rfi.response', { rich: true, flow: true }),
  ...signature(680, 'rfi.answered_by', 'By:'),
])

/* Follows AMR's own proposal request cover sheet: who it goes to on the left, the numbers on the
   right, the standing instructions, then the changes listed by discipline and sheet. */
const PR = (): Layout => ({
  useLetterhead: true,
  continuation: DEFAULT_CONTINUATION,
  elements: [
    text(118, 30, 320, 18, 'Proposal Request', { size: 13.5, bold: true, color: 'accent', caps: true, repeat: true }),
    field(118, 54, 320, 14, 'project.name', { size: 10, bold: true, repeat: true }),

    field(36, 126, 236, 62, 'pr.to', { label: 'To:', labelMode: 'left', labelWidth: 40, labelAlign: 'left', size: 8.5 }),
    labeled(36, 196, 236, 'pr.from', 'From:', 40, { labelAlign: 'left', size: 8.5 }),

    labeled(306, 126, 270, 'pr.number', 'Proposal Number:', 104, { labelAlign: 'left', size: 8.5, bold: true }),
    labeled(306, 142, 270, 'doc.date', 'Date of Issuance:', 104, { labelAlign: 'left', size: 8.5, bold: true }),
    labeled(306, 158, 270, 'pr.contract_for', 'Contract For:', 104, { labelAlign: 'left', size: 8.5, bold: true }),

    hline(36, 218, 540),
    text(36, 228, 100, 12, 'Special Instructions:', { size: 8.5, bold: true }),
    text(36, 242, 540, 40, 'Please submit an itemized quotation for changes to the Contract Sum and/or Time Incidental to proposed modifications to the Contract Documents as described herein. Submit proposal response within 14 days, or notify the Architect in writing of the day on which you anticipate submitting the proposal.', { size: 8.5 }),
    text(36, 290, 540, 12, 'This is not a Change Order nor a direction to proceed with the work described herein.', { size: 8.5, bold: true }),
    hline(36, 312, 540),

    heading(36, 324, 'Changes to Drawings:'),
    field(36, 342, 540, 384, 'pr.description', { size: 9, rich: true, flow: true, spaced: true, headings: 'plain' }),
  ],
})

const CCD = (): Layout => simpleForm('Construction Change Directive', 'ccd', 'CCD #:', [
  labeled(36, 176, 540, 'ccd.title', 'Subject:', 70, { bold: true }),
  text(36, 196, 540, 24, 'You are hereby directed to make the following change(s) in this Contract:', { size: 8, color: 'muted' }),
  field(36, 222, 540, 250, 'ccd.description', { rich: true, flow: true }),
  heading(36, 486, 'Proposed Adjustments:'),
  { id: newId(), type: 'choices', x: 36, y: 502, w: 540, h: 20, field: 'ccd.cost_basis', size: 8.5, direction: 'horizontal',
    options: [{ value: 'lump', label: 'Lump sum' }, { value: 'unit', label: 'Unit prices' }, { value: 'cost_plus', label: 'Cost plus fee' }, { value: 'tbd', label: 'To be determined' }] },
  labeled(36, 532, 300, 'ccd.amount', 'Amount:', 90),
  labeled(36, 548, 300, 'ccd.time', 'Contract time:', 90),
  ...signature(680, 'ccd.issued_by', 'Issued:'),
])

export function defaultLayout(kind: TemplateKind): Layout {
  switch (kind) {
    case 'general': return LETTERHEAD()
    case 'submittal_cover': return SUBMITTAL()
    case 'field_report': return FIELD_REPORT()
    case 'meeting_notes': return MEETING_NOTES()
    case 'change_order': return CHANGE_ORDER()
    case 'asi': return ASI()
    case 'rfi_response': return RFI()
    case 'pr': return PR()
    case 'ccd': return CCD()
    case 'addendum': return ADDENDUM()
  }
}
