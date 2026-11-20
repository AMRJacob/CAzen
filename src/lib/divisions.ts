/**
 * Which CSI division a pay line or a schedule activity belongs to, guessed from its words.
 *
 * Contractors name their pay lines and their schedule activities differently and break them
 * down differently, so neither can be tied to the other line by line. Both can be filed under a
 * division, though, and a division's billing can then be read against its schedule. This makes
 * the first guess; the trade board is where it is checked and corrected.
 *
 * The rules are tried in order and the first that matches wins, so a phrase that names a trade
 * outright ("HVAC equipment", "steel fabrication") is caught before a word that only suggests
 * one ("equipment", "fabrication"). Nothing here is from CSI's own text — the division numbers
 * and titles are the public list in csi.ts; the words are a contractor's.
 *
 * Dependency-free (`checks/divisions.test.ts`).
 */
const RULES: [RegExp, string][] = [
  // Phrases that would otherwise be caught by a later, looser word.
  [/\btraffic\s*control\b/, '01'],
  [/\b(overhead|coiling|rolling|sectional)\s*doors?\b/, '08'],
  [/\b(metal\s*(stud\w*|framing)|drywall|gyp\w*|sheet\s*rock)\b/, '09'],
  [/\b(demo|demolition|abatement|asbestos)\b/, '02'],
  [/\b(hvac|mechanical|duct\w*|air\s*handl\w*|chiller\w*|boilers?|rtus?|vav|diffusers?|chilled\s*water|hot\s*water\s*heat\w*)\b/, '23'],
  [/\b(sprinkler\w*|fire\s*(protection|suppression|sprinkler\w*))\b/, '21'],
  [/\bfire\s*alarm\b|\b(access\s*control|security|cctv|cameras?|intrusion)\b/, '28'],
  [/\b(data|telecom\w*|communications?|low\s*voltage|av|audio\s*visual|cabling)\b/, '27'],
  [/\b(electric\w*|lighting|lights?|light\s*poles?|power|conduit|switchgear|panels?board|generators?|transformers?)\b/, '26'],
  [/\b(plumb\w*|water\s*heaters?|domestic\s*water|sanitary|fixtures?\s*(&|and)\s*trim)\b/, '22'],
  [/\b(?<!(erosion|traffic|access)\s)(controls?|bas|building\s*automation)\b/, '23'],
  [/\b(pemb|pre\s?engineered|metal\s*(storage\s*)?building\w*)\b/, '13'],
  [/\belevators?\b|\bconveying\b/, '14'],
  // General requirements: what the contractor charges for running the job.
  [/\b(general\s*conditions?|general\s*requirements?|gc\s*fee|fee|overhead|profit|bonds?|insurances?|builder'?s?'?\s*risk|general\s*liability|ocp|payment\s*(&|and)\s*performance|performance\s*(&|and)\s*payment|mobili[sz]ation|demobili[sz]ation|supervision|contingenc\w*|permits?|testing|inspections?|hoisting|cranes?|traffic\s*control|temporary|substantial\s*completion|punch\s*list|submittals?|clean\s?up|close\s?out|construction\s*entrance|balance\s*of\s*work|dumpsters?\b(?!\s*pad))\b/, '01'],
  [/\b(demo\w*|abatement|asbestos|lead\s*paint|selective\s*removal)\b/, '02'],
  // Site work, before concrete: a curb or a sidewalk is concrete, but it is site work.
  [/\b(earthwork|grading|dirt\s*work|dirtwork|excavat\w*|undercut|rock\s*exc\w*|mass\s*rock|tree\s*removal|clearing|grubbing|silt\s*fence|erosion|swppp|fill|compaction)\b/, '31'],
  [/\b(storm\s*(drain\w*|water|sewer)|stormwater|sewer|water\s*lines?|site\s*utilit\w*|utilit\w*|district\s*loop|tie\s?in|manholes?|culverts?|detention)\b/, '33'],
  [/\b(paving|pavement|pavemt|asphalt|curbs?|gutters?\s*(&|and)?|sidewalks?|striping|parking|fenc\w*|gates?|landscap\w*|irrigation|planting|plants|sod|seeding|wheel\s*stops?|bike\s*racks?|site\s*furnish\w*|decomposed\s*granite|gabion\w*|retaining\s*walls?|dumpster\s*pad|boat\s*pad|turndown|bollards?|site\s*concrete)\b/, '32'],
  [/\b(concrete|footings?|foundations?|slabs?|rebar|reinforc\w*|cast\s?in\s?place|precast|tilt\s?up|piers?|grade\s*beams?)\b/, '03'],
  [/\b(masonry|block|brick|cmu|stone\s*veneer|cast\s*stone)\b/, '04'],
  [/\b(steel|metals?|railings?|joists?|metal\s*deck|stairs?|fabrication|ornamental|canop(y|ies))\b/, '05'],
  [/\b(carpentry|millwork|casework|cabinets?|counter\s*tops?|countertops?|laminated\s*timber|glulam|clt|wood|lumber|trusses|blocking|finish\s*trim)\b/, '06'],
  [/\b(roof\w*|waterproof\w*|damp\s*proof\w*|sealants?|caulk\w*|flashings?|insulation|insul|vapor|air\s*barrier|eifs|efis|metal\s*panels?|siding|gutters?|downspouts?|fireproof\w*|firestop\w*)\b/, '07'],
  [/\b(doors?|frames?|hardware|storefront|glaz\w*|glass|windows?|curtain\s*wall|louvers?|skylights?|entrances?|coiling|overhead\s*doors?)\b/, '08'],
  [/\b(drywall|gyp\w*|sheet\s*rock|framing|demising|partitions?\s*walls?|ceilings?|acoustic\w*|accoustic\w*|act|floor\w*|carpet|tile|vct|lvt|resilient|base|epoxy|paint\w*|wall\s*cover\w*|stucco|plaster|terrazzo|polished|sealed\s*floors?)\b/, '09'],
  [/\b(toilet\s*(accessor\w*|partitions?)|special\w*|signage|signs?|lockers?|fire\s*extinguish\w*|corner\s*guards?|flagpoles?|markerboards?|whiteboards?)\b/, '10'],
  [/\b(appliances?|kitchen\s*equipment|food\s*service|laundry|equipment)\b/, '11'],
  [/\b(blinds?|shades?|window\s*treatments?|furniture|furnishings?|mats?)\b/, '12'],
]

const tidy = (s: string) => s.toLowerCase().replace(/[^a-z0-9&'/ -]+/g, ' ').replace(/[/-]/g, ' ').replace(/\s+/g, ' ')

/** The division as two digits, or null where the words say nothing a rule knows. */
export function guessDivision(text: string): string | null {
  const t = tidy(text)
  for (const [re, d] of RULES) if (re.test(t)) return d
  return null
}

/**
 * Every division the words name. A schedule activity is often several trades' work —
 * "Rough-in Plbg, Elec, HVAC" — so its name is read a part at a time, split at commas, slashes
 * and "and", and each part guessed alone. Short trade abbreviations are spelled out first.
 */
export function guessDivisions(text: string): string[] {
  const t = text.replace(/\bplbg\b/gi, 'plumbing').replace(/\belec\b/gi, 'electrical').replace(/\bmech\b/gi, 'mechanical')
  const whole = guessDivision(t)
  const parts = t.split(/,|;|\/|\s(?:&|and)\s/i).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  // "Rough-In Plbg, Elec, HVAC": a part with no trade of its own ("Rough-In") borrows nothing.
  for (const p of parts.length > 1 ? parts : [t]) { const d = guessDivision(p); if (d && !out.includes(d)) out.push(d) }
  if (!out.length && whole) out.push(whole)
  // A part that names only a stage of work ("Delivery", "Other") is not a trade; but when the
  // whole names one trade and the parts are its pieces ("Concrete Footings / Pads"), keep one.
  if (whole && out.length > 1 && parts.length > 1 && parts.every((p) => guessDivision(p) === whole || !guessDivision(p))) return [whole]
  return out.sort()
}

/**
 * A schedule activity's guess may use its heading as well — "Rough-in" under "PLUMBING" is
 * plumbing — but its own words come first.
 */
export function guessActivity(name: string, heading: string | null): string[] {
  const own = guessDivisions(name)
  if (own.length) return own
  const h = heading ? guessDivision(heading) : null
  return h ? [h] : []
}

/** The divisions a building job is usually filed under, shown on the board even when empty. */
export const USUAL = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '21', '22', '23', '26', '27', '28', '31', '32', '33']
