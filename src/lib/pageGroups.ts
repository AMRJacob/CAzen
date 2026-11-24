import { renumber } from './outline.ts'

/**
 * Notebook pages grouped into one report (Jacob, 11/24: three UCA sites on one trip, one field
 * report, not three). A group is the pages sharing a `group_id`; each carries the group's name.
 * The report puts each page in as a section of its own — its title or place as the heading, its
 * notes under it — with the attendees, photographs and observations of all of them together.
 *
 * Imports nothing that runs in a browser, so it can be checked on its own (checks/groups.test.ts).
 */

export interface GroupPage {
  id: string
  visited_on: string
  visited_at: string | null
  title: string | null
  location?: string | null
  weather?: string | null
  names: string | null
  notes: string | null
  group_id?: string | null
  group_name?: string | null
}

const start = (p: GroupPage) => `${p.visited_on}T${p.visited_at ?? '00:00:00'}`

/** The groups among a book's pages, each with its pages in the order they were written. */
export function groupsOf<P extends GroupPage>(pages: P[]): { id: string; name: string; pages: P[] }[] {
  const by = new Map<string, P[]>()
  for (const p of pages) if (p.group_id) by.set(p.group_id, [...(by.get(p.group_id) ?? []), p])
  return [...by.entries()]
    .map(([id, ps]) => {
      const sorted = [...ps].sort((a, b) => start(a).localeCompare(start(b)))
      return { id, name: sorted.find((p) => p.group_name)?.group_name || defaultName(sorted), pages: sorted }
    })
    .sort((a, b) => start(b.pages[0]).localeCompare(start(a.pages[0])))
}

/** What a new group is called until it is renamed: the pages' shared title, or how many. */
export function defaultName(pages: GroupPage[]): string {
  const titles = [...new Set(pages.map((p) => p.title?.trim()).filter(Boolean))]
  return titles.length === 1 ? titles[0]! : `${pages.length} pages`
}

/** A page's heading in the report: its title, its place, or its time. */
export function sectionTitle(p: GroupPage): string {
  const place = (p.location ?? '').split('\n').map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== 'job site')[0]
  return [p.title?.trim(), place].filter(Boolean).join(' — ') || (p.visited_at ? `Visit at ${p.visited_at.slice(0, 5)}` : 'Visit')
}

/**
 * The group's notes as one outline: each page a top-level heading, its own outline set one level
 * in under it and renumbered (1. a. i.). `extra` is what each page adds after its notes — its text
 * boxes and checklists — already written as an outline of its own.
 */
export function groupNotes(pages: GroupPage[], extra: (p: GroupPage) => string = () => ''): string {
  const lines: string[] = []
  for (const p of pages) {
    lines.push(`1. ${sectionTitle(p)}`)
    const own = `${p.notes ?? ''}${extra(p)}`.split('\n').filter((l) => l.trim() && !/^\s*[a-z0-9ivx]+[.)]\s*$/i.test(l))
    for (const l of own) lines.push(`  ${l}`)
  }
  return renumber(lines).join('\n')
}

/** Everyone on any of the pages, once each (by name), in the order first written. */
export function groupNames(pages: GroupPage[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of pages) for (const line of (p.names ?? '').split('\n')) {
    const key = line.split('|')[0].trim().toLowerCase()
    if (key && !seen.has(key)) { seen.add(key); out.push(line.trim()) }
  }
  return out.join('\n')
}

/** The places visited, one to a line, each once. */
export function groupPlaces(pages: GroupPage[]): string {
  return [...new Set(pages.map(sectionTitle))].join('\n')
}
