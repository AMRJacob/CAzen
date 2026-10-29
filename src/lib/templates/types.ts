/**
 * A form template is a list of elements placed on a US Letter page.
 * Units are PDF points (72 per inch); x/y measure from the TOP-LEFT of the page,
 * like a drawing sheet, and are converted when the PDF is drawn.
 */
export const PAGE_W = 612
export const PAGE_H = 792

export type FormKind = 'submittal_cover' | 'asi' | 'rfi_response' | 'pr' | 'ccd' | 'field_report'
export type TemplateKind = 'general' | FormKind   // 'general' = the shared letterhead

export type ColorRole = 'ink' | 'muted' | 'accent'
export type Align = 'left' | 'center' | 'right'

interface Base {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Multi-page documents: draw this element on every page, not just the first. */
  repeat?: boolean
}

export interface TextEl extends Base {
  type: 'text'
  text: string
  size: number
  bold: boolean
  align: Align
  color: ColorRole
  serif?: boolean
  caps?: boolean
}

/** Fills in from the firm, the project, or the form being issued. */
export interface FieldEl extends Base {
  type: 'field'
  field: string
  label: string
  labelMode: 'none' | 'left' | 'above'
  labelWidth: number
  labelAlign: Align
  size: number
  bold: boolean
  align: Align
  color: ColorRole
  serif?: boolean
  /** Long text that continues onto further pages when it doesn't fit (one per form). */
  flow?: boolean
  /** Lines can be indented outlines: "1." / "-" markers, Tab or spaces to nest, "# " for a heading. */
  rich?: boolean
}

export interface BoxEl extends Base { type: 'box'; stroke: ColorRole | 'none'; lineWidth: number; fill: 'none' | 'wash' | 'tint' }
/** Horizontal when wider than tall, vertical otherwise. */
export interface LineEl extends Base { type: 'line'; stroke: ColorRole; lineWidth: number }
export interface LogoEl extends Base { type: 'logo' }
export interface CheckEl extends Base { type: 'checkbox'; label: string; size: number }

/** Tick boxes; the option matching the form's value is marked (e.g. submittal action). */
export interface ChoicesEl extends Base {
  type: 'choices'
  field: string
  options: { value: string; label: string; note?: string }[]
  size: number
  direction: 'vertical' | 'horizontal'
}

/** Rows from a list field, one row per line, columns split by "|". */
export interface TableEl extends Base {
  type: 'table'
  field: string
  columns: { label: string; width: number }[]
  size: number
  header: boolean
}

export type El = TextEl | FieldEl | BoxEl | LineEl | LogoEl | CheckEl | ChoicesEl | TableEl
export type ElType = El['type']

export interface Layout {
  /** Forms only: draw the shared letterhead (and letterhead PDF) underneath this layout. */
  useLetterhead: boolean
  elements: El[]
  /** Where flowing text sits on pages 2+ (top and bottom, in points from the top). */
  continuation?: { top: number; bottom: number }
}

export const DEFAULT_CONTINUATION = { top: 128, bottom: 744 }

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}
