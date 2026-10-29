/**
 * CSI MasterFormat helpers.
 * Division titles as listed by Archtoolbox (https://archtoolbox.com/masterformat-divisions),
 * which notes the list was current as of 2020. Full section titles are CSI-licensed, so section
 * suggestions come from each project's own spec sections and earlier submittals instead.
 */
export const CSI_DIVISIONS: [string, string][] = [
  ['00', 'Procurement and Contracting Requirements'],
  ['01', 'General Requirements'],
  ['02', 'Existing Conditions'],
  ['03', 'Concrete'],
  ['04', 'Masonry'],
  ['05', 'Metals'],
  ['06', 'Wood, Plastics, and Composites'],
  ['07', 'Thermal and Moisture Protection'],
  ['08', 'Openings'],
  ['09', 'Finishes'],
  ['10', 'Specialties'],
  ['11', 'Equipment'],
  ['12', 'Furnishings'],
  ['13', 'Special Construction'],
  ['14', 'Conveying Equipment'],
  ['21', 'Fire Suppression'],
  ['22', 'Plumbing'],
  ['23', 'Heating, Ventilating, and Air Conditioning (HVAC)'],
  ['25', 'Integrated Automation'],
  ['26', 'Electrical'],
  ['27', 'Communications'],
  ['28', 'Electronic Safety and Security'],
  ['31', 'Earthwork'],
  ['32', 'Site Improvements'],
  ['33', 'Utilities'],
  ['34', 'Transportation'],
  ['35', 'Waterway and Marine Construction'],
  ['40', 'Process Interconnections'],
  ['41', 'Material Processing and Handling Equipment'],
  ['42', 'Process Heating, Cooling, and Drying Equipment'],
  ['43', 'Process Gas and Liquid Handling, Purification, and Storage Equipment'],
  ['44', 'Pollution and Waste Control Equipment'],
  ['45', 'Industry-Specific Manufacturing Equipment'],
  ['46', 'Water and Wastewater Equipment'],
  ['48', 'Electrical Power Generation'],
]

/** "09 - FINISHES", the way it prints on a transmittal. */
export const divisionLabel = (num: string, title: string) => `${num} - ${title.toUpperCase()}`

export const DIVISION_OPTIONS = CSI_DIVISIONS.map(([n, t]) => divisionLabel(n, t))

/** The division a section or submittal number belongs to: "09 30 00 - 002" → "09 - FINISHES". */
export function divisionFor(number: string): string {
  const m = number.trim().match(/^(\d{2})(?:[\s.-]?\d{2})?/)
  if (!m) return ''
  const d = CSI_DIVISIONS.find(([n]) => n === m[1])
  return d ? divisionLabel(d[0], d[1]) : ''
}

/** Normalise a typed section to "NN NN NN": "093000", "09 30", "09.30.00" → "09 30 00". */
export function normaliseSection(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length < 4) return null
  const d = digits.padEnd(6, '0').slice(0, 6)
  return `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)}`
}

/** Section part of a submittal number: "09 30 00 - 002" → "09 30 00". */
export function sectionOf(number: string): string | null {
  const m = number.match(/^\s*(\d{2})[\s.]?(\d{2})[\s.]?(\d{2})/)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : null
}

/** Next submittal number within a section, given the numbers already used on the project. */
export function nextInSection(section: string, used: string[]): string {
  const seqs = used.filter((u) => sectionOf(u) === section).map((u) => Number(u.match(/(\d+)\D*$/)?.[1] ?? 0))
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1
  return `${section} - ${String(next).padStart(3, '0')}`
}
