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

function signature(y: number, key: string, label = 'By:'): El[] {
  return [
    labeled(316, y, 260, key, label, 30, { labelAlign: 'left' }),
    hline(346, y + 13, 230, { stroke: 'ink', lineWidth: 0.5 }),
    labeled(316, y + 20, 260, 'doc.date', 'Date:', 30, { labelAlign: 'left' }),
    hline(346, y + 33, 230, { stroke: 'ink', lineWidth: 0.5 }),
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
      combine: [{ field: 'fr.observations', heading: 'Field Observations' }, { field: 'fr.notes', heading: 'Meeting Notes' }],
    }),
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

const PR = (): Layout => simpleForm('Proposal Request', 'pr', 'PR #:', [
  labeled(36, 176, 540, 'pr.title', 'Subject:', 70, { bold: true }),
  text(36, 196, 540, 34, 'Please submit an itemized proposal for changes in the Contract Sum and Contract Time for the proposed modifications described below. This is not a change order or a direction to proceed with the work described.', { size: 8, color: 'muted' }),
  labeled(36, 236, 300, 'pr.due', 'Proposal due:', 80, { bold: true }),
  heading(36, 260, 'Description of Proposed Change:'),
  field(36, 276, 540, 280, 'pr.description', { rich: true, flow: true }),
  heading(36, 568, 'Attachments:'),
  field(36, 584, 540, 60, 'pr.attachments'),
  ...signature(680, 'pr.issued_by', 'Issued:'),
])

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
    case 'asi': return ASI()
    case 'rfi_response': return RFI()
    case 'pr': return PR()
    case 'ccd': return CCD()
  }
}
