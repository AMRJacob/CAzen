/**
 * Sheet and section titles, in a shape a person reads rather than a title block shouts.
 *
 * Title blocks are set in capitals, so that is what comes out of a PDF: FIRST FLOOR PLAN,
 * COMMON WORK RESULTS FOR HVAC. A register of ninety of those is a wall. Capitalising the first
 * letter and lowering the rest reads as a list rather than a shout.
 *
 * Only titles that arrive in capitals are touched. A title somebody has already written properly
 * is left exactly as written, which also means a correction typed by hand always wins.
 *
 * Acronyms are the one thing a blanket lowercase gets wrong, and gets wrong loudly — "common
 * work results for hvac" is worse than the shout. They are kept by name rather than guessed at,
 * because there is no rule that separates HVAC from PLAN by looking at the letters. Anything
 * missing from the list is a word to add to it.
 */

const ACRONYMS = new Set([
  // Trades and systems
  'HVAC', 'MEP', 'AV', 'IT', 'TV', 'CCTV', 'UPS', 'VAV', 'AHU', 'RTU', 'FCU', 'VFD', 'VRF',
  'DDC', 'BAS', 'EF', 'MAU', 'DX', 'EV', 'PV', 'LED', 'CT', 'ATS', 'MDP', 'MCC',
  // Materials and assemblies
  'CMU', 'EIFS', 'FRP', 'GFRC', 'PVC', 'CPVC', 'HDPE', 'GWB', 'ACT', 'VCT', 'LVT', 'SIP',
  'OSB', 'MDF', 'HM', 'SS', 'TPO', 'EPDM', 'AESS', 'ICF',
  // Drawings and contracting
  'RCP', 'NIC', 'TYP', 'EQ', 'OFCI', 'OFOI', 'CIP', 'GC', 'CA', 'ASI', 'PR', 'CCD', 'RFI',
  'CO', 'AIA', 'BIM',
  // Codes and standards
  'ADA', 'ADAAG', 'NFPA', 'OSHA', 'ASTM', 'ANSI', 'UL', 'NEC', 'IBC', 'IECC', 'IPC', 'IMC',
  'ASHRAE', 'LEED', 'FEMA', 'EPA', 'DOT', 'USGBC',
])

const SHOUTING = /[A-Z]/

/**
 * "FIRST FLOOR PLAN" → "First floor plan". "COMMON WORK RESULTS FOR HVAC" → "Common work
 * results for HVAC". "First Floor Plan" → unchanged.
 */
export function niceTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  if (!t) return ''
  // Already written by a person: leave it alone.
  if (!SHOUTING.test(t) || t !== t.toUpperCase()) return t

  let first = true
  return t
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part
      const word = part
      const wasFirst = first
      first = false
      // Keep anything with a digit in it: A-201, 2ND, 12", 1/4.
      if (/\d/.test(word)) return word
      // Single letters and letter pairs are references, not words: SECTION A-A, DETAIL B.
      if (/^[A-Z](?:[-/.][A-Z])*[.,:;]?$/.test(word)) return word
      const letters = word.replace(/[^A-Z]/g, '')
      if (letters && ACRONYMS.has(letters)) return word
      const lower = word.toLowerCase()
      return wasFirst ? lower.replace(/[a-z]/, (c) => c.toUpperCase()) : lower
    })
    .join('')
}

/** The same, for a title that may be null — null stays null so "no title" stays "no title". */
export const niceTitleOrNull = (title: string | null | undefined): string | null =>
  title == null ? null : niceTitle(title)
