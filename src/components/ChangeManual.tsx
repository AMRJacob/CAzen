import { useEffect, useMemo, useState } from 'react'
import { detectSections, placeOnPage, readManual, sectionInRegion, troubleText, FRONT, type ManualPage } from '../lib/pdf/splitManual'
import { pageBody, type PageText, type Region } from '../lib/pdf/pageText'
import { placeText, splicePages, suggestAction, type SpecAction, type Splice } from '../lib/pdf/changeDoc'
import { assemble, joinPages } from '../lib/pdf/bundle'
import { listManual, type CurrentSpec, type SectionToSave } from '../lib/manual'
import { readFile, type ProjectStore } from '../lib/files'
import { PREFS, usePref } from '../lib/prefs'
import { message } from '../lib/errors'
import { niceTitle } from '../lib/titles'

/**
 * The project manual pages that came inside a change document.
 *
 * They are cut into sections by the same reader the manual upload uses — the section number in
 * each page's running footer or header, END OF SECTION, the heading — and each section is set
 * against the manual already in the project: a section it doesn't have yet is added; one it has
 * is either replaced whole, or has the reissued pages put into it by their page numbers (page 3
 * replaces page 3; page 3A goes in after it). Which of the two is suggested from the footers and
 * can be changed per section.
 */

export interface SpecPageIn {
  /** The page's place in the upload (0-based), so the list can say "pages 4–6". */
  at: number
  text: PageText
  bytes: Uint8Array
}

interface Edit { number?: string; title?: string; include?: boolean; action?: SpecAction }
interface OldRead { status: 'loading' | 'ready' | 'failed'; error?: string; bytes?: Uint8Array; places?: ReturnType<typeof placeOnPage>[]; bodies?: string[] }

export interface PlannedSection {
  key: string
  number: string
  title: string
  action: SpecAction
  /** What the section becomes, built only when it is saved. */
  build: () => Promise<SectionToSave>
}

export interface ManualPlan {
  sections: PlannedSection[]
  /** Something that stops the save, said in a line. */
  problem: string | null
}

const span = (ats: number[]) => {
  const runs: string[] = []
  let start = ats[0], prev = ats[0]
  for (const a of [...ats.slice(1), Infinity]) {
    if (a === prev + 1) { prev = a; continue }
    runs.push(start === prev ? `${start + 1}` : `${start + 1}–${prev + 1}`)
    start = prev = a
  }
  return runs.join(', ')
}

export function ChangeManual({ project, pages, revisionLabel, onPlan, onPeek }: {
  project: ProjectStore
  pages: SpecPageIn[]
  /** Written on each section revision: the set's mark, or its name. */
  revisionLabel: string
  onPlan: (plan: ManualPlan) => void
  onPeek?: (at: number) => void
}) {
  const [current, setCurrent] = useState<CurrentSpec[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [olds, setOlds] = useState<Record<string, OldRead>>({})
  // Where the manual upload was told the section number sits; used here only if it reads more.
  const [box] = usePref<Region | null>(PREFS.manualNumberBox, null)

  useEffect(() => {
    listManual(project.id).then(setCurrent).catch((e) => { setLoadError(message(e)); setCurrent([]) })
  }, [project.id])

  // The pages cut into sections. The footers are read automatically; the box drawn on the manual
  // upload is tried too, and whichever finds a section number on more pages is used.
  const cut = useMemo(() => {
    const mp: ManualPage[] = pages.map((p, i) => ({ index: i, text: p.text, found: null, declares: false, at: null, of: null, ends: false }))
    const auto = detectSections(mp, null)
    if (!box) return auto
    const boxed = mp.filter((p) => sectionInRegion(p.text, box)).length
    const autoRead = auto.pages.filter((p) => p.found).length
    return boxed > autoRead ? detectSections(mp, box) : auto
  }, [pages, box])

  const rows = useMemo(() => cut.sections.map((s) => {
    const key = String(pages[s.pages[0]]?.at ?? s.pages[0])
    const e = edits[key] ?? {}
    const number = (e.number ?? (s.number === FRONT ? '' : s.number)).trim()
    const cur = current?.find((c) => c.number === number) ?? null
    const places = s.pages.map((i) => placeOnPage(cut.pages[i].text))
    const ends = s.pages.some((i) => cut.pages[i].ends)
    const of = s.pages.map((i) => cut.pages[i].of).find((n): n is number => n != null) ?? null
    const suggested = suggestAction({ places, ends, of }, !!cur)
    const action: SpecAction = !cur ? 'new' : e.action && e.action !== 'new' ? e.action : suggested
    const title = e.title ?? (niceTitle(s.title) || (cur?.title ?? ''))
    const old = cur ? olds[cur.revision_id] : undefined
    const splice: Splice | null = action === 'pages' && old?.status === 'ready' ? splicePages(old.places!, places) : null
    return { s, key, number, title, include: e.include ?? true, cur, places, suggested, action, old, splice }
  }), [cut, pages, edits, current, olds])

  // The current section is read only when its pages are to be put into it.
  useEffect(() => {
    for (const r of rows) {
      if (r.action !== 'pages' || !r.cur || olds[r.cur.revision_id]) continue
      const cur = r.cur
      setOlds((o) => ({ ...o, [cur.revision_id]: { status: 'loading' } }))
      readFile(project, cur.file_path)
        .then(async (bytes) => {
          const read = await readManual(bytes.slice().buffer)
          setOlds((o) => ({ ...o, [cur.revision_id]: { status: 'ready', bytes, places: read.map((p) => placeOnPage(p.text)), bodies: read.map((p) => pageBody(p.text)) } }))
        })
        .catch((e) => setOlds((o) => ({ ...o, [cur.revision_id]: { status: 'failed', error: message(e) } })))
    }
  }, [rows, olds, project])

  const twice = useMemo(() => {
    const numbers = rows.filter((r) => r.include).map((r) => r.number)
    return new Set(numbers.filter((n, i) => n && numbers.indexOf(n) !== i))
  }, [rows])

  const plan = useMemo<ManualPlan>(() => {
    const chosen = rows.filter((r) => r.include)
    let problem: string | null = null
    if (current === null) problem = 'Reading the project manual…'
    else if (chosen.some((r) => !r.number)) problem = 'A manual section needs its number.'
    else if (twice.size) problem = `${[...twice].join(', ')} ${twice.size === 1 ? 'is' : 'are'} in this upload more than once.`
    else if (chosen.some((r) => r.action === 'pages' && r.old?.status === 'loading')) problem = 'Reading the current sections…'
    else if (chosen.some((r) => r.action === 'pages' && !r.splice)) problem = 'A section can’t take its pages by number. Replace it whole, or leave it out.'
    const sections = chosen.map((r): PlannedSection => ({
      key: r.key, number: r.number, title: r.title, action: r.action,
      build: async () => {
        const newBytes = r.s.pages.map((i) => pages[i].bytes)
        const newBodies = r.s.pages.map((i) => pageBody(pages[i].text))
        if (r.action === 'pages' && r.splice && r.old?.bytes) {
          const bytes = await assemble(r.old.bytes, newBytes, r.splice.order)
          const bodies = r.splice.order.map((o) => (o.from === 'old' ? r.old!.bodies![o.i] : newBodies[o.i]))
          return { number: r.number, title: r.title, revisionLabel, pages: r.splice.order.length, bytes, body: bodies.join('\n') }
        }
        return { number: r.number, title: r.title, revisionLabel, pages: newBytes.length, bytes: await joinPages(newBytes), body: newBodies.join('\n') }
      },
    }))
    return { sections, problem }
  }, [rows, current, twice, pages, revisionLabel])

  useEffect(() => { onPlan(plan) }, [plan, onPlan])

  const edit = (key: string, patch: Edit) => setEdits((es) => ({ ...es, [key]: { ...es[key], ...patch } }))

  return (
    <div className="card change-manual">
      <h3>Project manual pages <span className="muted small">{pages.length} {pages.length === 1 ? 'page' : 'pages'} · {rows.length} {rows.length === 1 ? 'section' : 'sections'}</span></h3>
      <p className="muted small">
        Read from each page’s running footer or header. A section the manual doesn’t have yet is added; one it has is replaced whole,
        or takes these pages in place of the pages with the same numbers — a lettered page (3A) goes in after the page it follows.
      </p>
      {loadError && <div className="notice error">Couldn’t read the project manual: {loadError}</div>}
      <table className="change-manual-table">
        <thead><tr><th></th><th>Section</th><th>Title</th><th>Upload pages</th><th>Footer pages</th><th>Goes in as</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const ats = r.s.pages.map((i) => pages[i].at)
            // Some of a section's pages, on their way into it, are expected to start late, fall short
            // of "of N" and have no heading or END OF SECTION; only what is wrong with them is said.
            const partial = new Set(['late-start', 'short', 'missing', 'no-heading', 'no-end'])
            const trouble = r.s.trouble.filter((t) => r.action !== 'pages' || !partial.has(t.kind)).map(troubleText)
            return (
              <tr key={r.key} className={r.include ? '' : 'skipped'}>
                <td><input type="checkbox" checked={r.include} onChange={(e) => edit(r.key, { include: e.target.checked })} aria-label={`Include ${r.number || 'this section'}`} /></td>
                <td><input className={`cell mono ${r.include && (!r.number || twice.has(r.number)) ? 'bad' : ''}`} value={r.number} placeholder="09 91 00"
                  onChange={(e) => edit(r.key, { number: e.target.value })} aria-label="Section number" /></td>
                <td><input className="cell" value={r.title} onChange={(e) => edit(r.key, { title: e.target.value })} aria-label={`Title of ${r.number}`} /></td>
                <td className="small nowrap">
                  {onPeek ? <button className="link" onClick={() => onPeek(ats[0])}>{span(ats)}</button> : span(ats)}
                </td>
                <td className="small mono">{r.places.map(placeText).join(', ')}</td>
                <td>
                  {r.cur ? (
                    <select className="cell" value={r.action} onChange={(e) => edit(r.key, { action: e.target.value as SpecAction })} aria-label={`How ${r.number} goes in`}>
                      <option value="whole">Replaces the whole section{r.suggested === 'whole' ? ' (suggested)' : ''}</option>
                      <option value="pages">Into its pages, by number{r.suggested === 'pages' ? ' (suggested)' : ''}</option>
                    </select>
                  ) : <span className="small">{r.number ? 'New section' : '—'}</span>}
                </td>
                <td className="small">
                  {!r.include ? 'skip'
                    : !r.number ? <span className="bad-text">needs number</span>
                    : twice.has(r.number) ? <span className="bad-text">twice</span>
                    : r.action === 'new' ? 'added to the manual'
                    : r.action === 'whole' ? `revision ${(r.cur?.revision_count ?? 0) + 1} of ${r.number}, replacing ${r.cur?.pages ?? '?'} pages with ${r.s.pages.length}`
                    : r.old?.status === 'loading' || !r.old ? <span className="muted">reading the current {r.number}…</span>
                    : r.old.status === 'failed' ? <span className="bad-text">couldn’t read the current {r.number}: {r.old.error}</span>
                    : !r.splice ? <span className="bad-text">{r.places.some((p) => !p) ? 'a page here has no readable page number' : `the current ${r.number} has a page with no readable page number`}</span>
                    : <>
                        {[r.splice.replaced.length ? `replaces page ${r.splice.replaced.join(', ')}` : '', r.splice.inserted.length ? `adds page ${r.splice.inserted.join(', ')}` : ''].filter(Boolean).join('; ')}
                        <span className="muted"> · {r.old.places!.length} → {r.splice.order.length} pages</span>
                      </>}
                  {r.include && trouble.length > 0 && <div className="muted">{trouble.join(' · ')}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
