/**
 * A meeting agenda kept on a notebook page as a block (Jacob, 11/23): what is carried forward
 * from an earlier page to be checked off as resolved, the open observations to walk through, and
 * new business. It lives in the page's `widgets` like a checklist, under the block's id.
 *
 * No imports beyond types, so it can be checked on its own (checks/agenda.test.ts).
 */

export interface AgendaItem { text: string; done: boolean }
export interface Agenda {
  /** The page it was picked up from. */
  from?: string | null
  /** Carried forward from that page: its notes, and its own agenda's unresolved items. */
  old: AgendaItem[]
  /** Observations to check, by id; ticking one off closes the observation itself. */
  obs: string[]
  fresh: AgendaItem[]
}
export const emptyAgenda = (): Agenda => ({ from: null, old: [], obs: [], fresh: [] })

/**
 * What a page's typed notes give an agenda: each line under a heading, as "Heading — line", and
 * a heading with nothing under it as itself. The notes are the numbered outline the report prints
 * (1. / a. / i.); "Unsorted" is the board's tray, so its lines are carried without the heading.
 */
export function notesToItems(notes: string): string[] {
  const out: string[] = []
  let head: string | null = null, headUsed = true
  const flush = () => { if (head && !headUsed) out.push(head) }
  for (const raw of notes.split('\n')) {
    if (!raw.trim()) continue
    const top = /^(\d+)\.\s+(.*)$/.exec(raw)
    if (top) { flush(); head = top[2].trim(); headUsed = false; continue }
    const line = raw.trim().replace(/^([a-z]+|[ivx]+|\d+|[-•*])[.)]?\s+/i, '').trim()
    if (!line) continue
    out.push(head && head.toLowerCase() !== 'unsorted' ? `${head} — ${line}` : line)
    headUsed = true
  }
  flush()
  return out
}

/**
 * Picking up from an earlier page: its notes, and whatever its own agenda left unresolved, as old
 * business; the open observations on that page and on its agenda to check. Nothing already on
 * this agenda is added twice.
 */
export function pickUp(now: Agenda, from: { id: string; notes: string | null; agendas: Agenda[]; openObs: string[] }): Agenda {
  const have = new Set(now.old.map((i) => i.text.trim().toLowerCase()))
  const old = [...now.old]
  const add = (t: string) => { const k = t.trim().toLowerCase(); if (k && !have.has(k)) { have.add(k); old.push({ text: t.trim(), done: false }) } }
  for (const a of from.agendas) for (const i of [...a.old, ...a.fresh]) if (!i.done) add(i.text)
  for (const t of notesToItems(from.notes ?? '')) add(t)
  const obs = [...now.obs]
  for (const id of [...from.agendas.flatMap((a) => a.obs), ...from.openObs]) if (!obs.includes(id)) obs.push(id)
  return { ...now, from: from.id, old, obs }
}

/** The agenda as the numbered outline the letterhead PDF and the report print. */
export function agendaOutline(a: Agenda, obs: (id: string) => { name: string; title: string; open: boolean } | null): string {
  const out: string[] = []
  let n = 0
  const letter = (i: number) => String.fromCharCode(97 + (i % 26))
  const section = (title: string, lines: string[]) => {
    if (!lines.length) return
    n += 1
    out.push(`${n}. ${title}`, ...lines.map((l, i) => `  ${letter(i)}. ${l}`))
  }
  section('Old business', a.old.filter((i) => i.text.trim()).map((i) => `${i.text.trim()}${i.done ? ' — resolved' : ''}`))
  section('Observations to review', a.obs.map(obs).filter((o): o is NonNullable<typeof o> => !!o)
    .map((o) => `${o.name} ${o.title}${o.open ? '' : ' — resolved'}`))
  section('New business', a.fresh.filter((i) => i.text.trim()).map((i) => `${i.text.trim()}${i.done ? ' — resolved' : ''}`))
  return out.join('\n')
}
