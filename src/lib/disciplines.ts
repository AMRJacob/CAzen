/**
 * Discipline designators and the order sheets appear in a set.
 *
 * Default order and names: Archtoolbox, "Construction Document Sheet Numbers"
 * (https://www.archtoolbox.com/construction-document-sheet-numbers/), which follows the
 * U.S. National CAD Standard's single-letter designators and says the list gives "the order
 * that the disciplines should take". Firms and projects can reorder, rename and add codes
 * (two-letter codes such as FP or FA are allowed).
 */
export interface Discipline {
  code: string
  name: string
}

export const DEFAULT_DISCIPLINES: Discipline[] = [
  { code: 'G', name: 'General' },
  { code: 'H', name: 'Hazardous Materials' },
  { code: 'V', name: 'Survey / Mapping' },
  { code: 'B', name: 'Geotechnical' },
  { code: 'C', name: 'Civil' },
  { code: 'L', name: 'Landscape' },
  { code: 'S', name: 'Structural' },
  { code: 'A', name: 'Architectural' },
  { code: 'I', name: 'Interiors' },
  { code: 'Q', name: 'Equipment' },
  { code: 'F', name: 'Fire Protection' },
  { code: 'P', name: 'Plumbing' },
  { code: 'D', name: 'Process' },
  { code: 'M', name: 'Mechanical' },
  { code: 'E', name: 'Electrical' },
  { code: 'W', name: 'Distributed Energy' },
  { code: 'T', name: 'Telecommunications' },
  { code: 'R', name: 'Resource' },
  { code: 'X', name: 'Other Disciplines' },
  { code: 'Z', name: 'Contractor / Shop Drawings' },
  { code: 'O', name: 'Operations' },
]

/** The order in force: the project's own if it has one, else the firm's, else the default. */
export function effectiveOrder(firmOrder?: Discipline[] | null, projectOrder?: Discipline[] | null): Discipline[] {
  if (projectOrder?.length) return projectOrder
  if (firmOrder?.length) return firmOrder
  return DEFAULT_DISCIPLINES
}

/** Clean a list for saving: trimmed upper-case codes, no blanks, first of any duplicate kept. */
export function cleanOrder(list: Discipline[]): Discipline[] {
  const seen = new Set<string>()
  const out: Discipline[] = []
  for (const d of list) {
    const code = d.code.trim().toUpperCase().replace(/[^A-Z]/g, '')
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push({ code, name: d.name.trim() })
  }
  return out
}

/**
 * The discipline a sheet belongs to: the longest code that its leading letters start with,
 * so "FP-101" matches FP when FP is listed and F when it isn't.
 */
export function disciplineFor(sheetNumber: string, order: Discipline[]): { index: number; discipline: Discipline | null } {
  const letters = sheetNumber.toUpperCase().match(/^[A-Z]+/)?.[0] ?? ''
  let best = -1
  for (let i = 0; i < order.length; i++) {
    const c = order[i].code
    if (letters.startsWith(c) && (best < 0 || c.length > order[best].code.length)) best = i
  }
  return best < 0 ? { index: order.length, discipline: null } : { index: best, discipline: order[best] }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Sort by discipline order, then by sheet number within a discipline (A-101 before A-102 before A-201). */
export function sortSheets<T>(items: T[], numberOf: (t: T) => string, order: Discipline[]): T[] {
  return items
    .map((t) => ({ t, n: numberOf(t), d: disciplineFor(numberOf(t), order).index }))
    .sort((a, b) => a.d - b.d || collator.compare(a.n, b.n))
    .map((x) => x.t)
}

/** Group sorted items under their discipline, for headed lists. Unlisted letters come last, under their letters. */
export function groupByDiscipline<T>(items: T[], numberOf: (t: T) => string, order: Discipline[]) {
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const t of sortSheets(items, numberOf, order)) {
    const n = numberOf(t)
    const { discipline } = disciplineFor(n, order)
    const key = discipline?.code ?? (n.toUpperCase().match(/^[A-Z]+/)?.[0] || '#')
    const label = discipline ? `${discipline.code} · ${discipline.name}` : key === '#' ? 'Other' : `${key} · Not in sheet order`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(t)
    else groups.push({ key, label, items: [t] })
  }
  return groups
}
