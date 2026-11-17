import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { db } from '../lib/supabase'
import { readFile, type ProjectStore } from '../lib/files'
import { getDocument } from '../lib/pdf/pdfjs'
import { readPageText, type PageText, type PageWord } from '../lib/pdf/pageText'
import { usePageRender, usePageZoom } from '../lib/pdf/zoomPan'
import { openStoredPdf } from '../lib/sheets'

/** A sheet the viewer can show: the current revision of a sheet, or a specific older one. */
export interface ViewSheet {
  number: string
  title: string | null
  revisionId: string
  revisionLabel: string | null
  filePath: string
  superseded?: boolean
}

interface Box { x: number; y: number; w: number; h: number }
interface AutoLink extends Box { target: string }
interface ManualLink extends Box { id: string; target_number: string; label: string | null }

/** "A-501", "A 501" and "a501" are the same sheet. */
const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '')

/**
 * Full-screen sheet viewer. Sheet numbers printed on the drawing (callouts, the sheet index,
 * "SEE 3/A501") become links to that sheet's current revision; links can also be drawn by hand.
 *
 * Built to be used standing up: one finger pans, two fingers zoom, a double tap zooms to the spot
 * under it, and the sheet index is one tap away. The point being looked at is held in the middle
 * through any change of size, so unfolding the phone — which re-lays out the page with no reload —
 * keeps the same detail in view instead of jumping back to the corner of the sheet.
 */
export function SheetViewer({ project, sheets, start, highlight, onClose }: {
  project: ProjectStore
  /** Current sheets in set order, for links and next/previous. */
  sheets: ViewSheet[]
  start: ViewSheet
  highlight?: string
  onClose: () => void
}) {
  const [stack, setStack] = useState<ViewSheet[]>([start])
  const sheet = stack[stack.length - 1]
  const [text, setText] = useState<PageText | null>(null)
  const [manual, setManual] = useState<ManualLink[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [draft, setDraft] = useState<Box | null>(null)
  const [pending, setPending] = useState<Box | null>(null)
  const [target, setTarget] = useState('')
  const [hl, setHl] = useState(highlight ?? '')
  const [indexOpen, setIndexOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [filter, setFilter] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<Awaited<ReturnType<typeof getDocument>['promise']> | null>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [aspect, setAspect] = useState(1.5)

  const { zoom, setZoom, width, height, centre, onScroll, recentre, fit, zoomIn, zoomOut } = usePageZoom(scroller, aspect)
  usePageRender(canvas, page, width, !busy)

  const byNumber = useMemo(() => new Map(sheets.map((s) => [norm(s.number), s])), [sheets])
  const index = sheets.findIndex((s) => norm(s.number) === norm(sheet.number))

  const go = useCallback((s: ViewSheet) => {
    setStack((st) => [...st, s])
    setZoom(1)
    setIndexOpen(false)
    setMore(false)
  }, [setZoom])
  const back = () => stack.length > 1 && setStack(stack.slice(0, -1))

  // Load the PDF, its words and its hand-drawn links.
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)
    setText(null)
    centre.current = { x: 0.5, y: 0.5 }
    ;(async () => {
      try {
        const pdf = await getDocument({ data: await readFile(project, sheet.filePath) }).promise
        if (cancelled) return
        pdfRef.current?.loadingTask.destroy()
        pdfRef.current = pdf
        const first = await pdf.getPage(1)
        const vp = first.getViewport({ scale: 1 })
        setAspect(vp.width / vp.height)
        setPage(first)
        setText(await readPageText(first))
        const links = await db().from('sheet_links').select('id, target_number, label, x, y, w, h').eq('revision_id', sheet.revisionId)
        if (!cancelled) setManual((links.data ?? []) as ManualLink[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [sheet.filePath, sheet.revisionId, project])

  useEffect(() => () => { pdfRef.current?.loadingTask.destroy() }, [])

  // Put the reader back where they were once a new sheet has drawn.
  useEffect(() => { if (!busy) recentre() }, [busy, recentre])

  const autoLinks = useMemo<AutoLink[]>(() => {
    if (!text) return []
    const own = norm(sheet.number)
    const out: AutoLink[] = []
    for (const w of text.words) {
      for (const m of tokens(w.str)) {
        const n = norm(m.token)
        if (n === own || !byNumber.has(n)) continue
        out.push({ ...subBox(w, m.start, m.token.length), target: byNumber.get(n)!.number })
      }
    }
    return out
  }, [text, byNumber, sheet.number])

  const hits = useMemo<Box[]>(() => {
    const q = hl.trim().toLowerCase()
    if (!text || q.length < 2) return []
    const terms = q.split(/\s+/).filter((t) => t.length > 1)
    const out: Box[] = []
    for (const w of text.words) {
      const s = w.str.toLowerCase()
      for (const t of terms) {
        let i = s.indexOf(t)
        while (i >= 0) { out.push(subBox(w, i, t.length)); i = s.indexOf(t, i + t.length) }
      }
    }
    return out
  }, [text, hl])

  // Put the first match in the middle of the view, zoomed in enough to read.
  useEffect(() => {
    if (!hits.length || !scroller.current) return
    const h = hits[0]
    centre.current = { x: h.x + h.w / 2, y: h.y + h.h / 2 }
    if (zoom < 2) { setZoom(2.5); return }
    scroller.current.scrollTo({
      left: centre.current.x * width - scroller.current.clientWidth / 2,
      top: centre.current.y * height - scroller.current.clientHeight / 2,
      behavior: 'smooth',
    })
  }, [hits, zoom, width, height])

  const follow = useCallback((number: string) => {
    const s = byNumber.get(norm(number))
    if (s) go(s)
  }, [byNumber, go])

  // Drawing a link box.
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const frac = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const down = (e: React.PointerEvent) => {
    if (!linkMode || (e.target as HTMLElement).closest('.sv-link, .sv-pop')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = frac(e)
    setPending(null)
    setDraft({ ...startRef.current, w: 0, h: 0 })
  }
  const move = (e: React.PointerEvent) => {
    if (!startRef.current) return
    const p = frac(e), s = startRef.current
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const up = () => {
    if (!startRef.current) return
    startRef.current = null
    if (draft && draft.w > 0.003 && draft.h > 0.003) { setPending(draft); setTarget('') }
    setDraft(null)
  }

  async function saveLink() {
    if (!pending || !target) return
    const { data: u } = await db().auth.getUser()
    const { data, error } = await db().from('sheet_links')
      .insert({ revision_id: sheet.revisionId, project_id: project.id, target_number: target, ...pending, created_by: u.user?.id })
      .select('id, target_number, label, x, y, w, h').single()
    if (error) { setError(error.message); return }
    setManual([...manual, data as ManualLink])
    setPending(null)
  }

  async function removeLink(id: string) {
    const { error } = await db().from('sheet_links').delete().eq('id', id)
    if (error) setError(error.message)
    else setManual(manual.filter((l) => l.id !== id))
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      if (e.key === 'Escape') {
        if (pending) setPending(null)
        else if (more) setMore(false)
        else if (indexOpen) setIndexOpen(false)
        else if (linkMode) setLinkMode(false)
        else onClose()
      }
      if (e.key === 'ArrowRight' && index >= 0 && index < sheets.length - 1) go(sheets[index + 1])
      if (e.key === 'ArrowLeft' && index > 0) go(sheets[index - 1])
      if (e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const pct = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` })

  const q = filter.trim().toUpperCase()
  const listed = q
    ? sheets.filter((s) => norm(s.number).includes(norm(q)) || (s.title ?? '').toUpperCase().includes(q))
    : sheets
  const stepTo = (i: number) => go(sheets[i])

  return (
    <div className="sheet-viewer" role="dialog" aria-label={`Sheet ${sheet.number}`}>
      <div className="sv-bar">
        <div className="sv-bar-group">
          <button className="sv-index-toggle" onClick={() => setIndexOpen(!indexOpen)} aria-expanded={indexOpen}>
            Sheets
          </button>
          {stack.length > 1 && <button onClick={back} title="Back to the previous sheet">← Back</button>}
        </div>
        <div className="sv-title">
          <span className="mono">{sheet.number}</span>
          <span>{sheet.title ?? ''}</span>
          {sheet.revisionLabel && <span className="tag">Rev {sheet.revisionLabel}</span>}
          {sheet.superseded && <span className="tag muted">superseded</span>}
        </div>
        <div className="sv-bar-group sv-inline-tools">
          <button className="icon" disabled={index <= 0} onClick={() => stepTo(index - 1)} aria-label="Previous sheet">‹</button>
          <button className="icon" disabled={index < 0 || index >= sheets.length - 1} onClick={() => stepTo(index + 1)} aria-label="Next sheet">›</button>
          <span className="sv-sep" />
          <button className="icon" onClick={zoomOut} aria-label="Zoom out">−</button>
          <button onClick={fit} title="Fit the sheet to the screen">{Math.round(zoom * 100)}%</button>
          <button className="icon" onClick={zoomIn} aria-label="Zoom in">+</button>
          <span className="sv-find-group">
            <span className="sv-sep" />
            <input className="sv-find" placeholder="Find on sheet" value={hl} onChange={(e) => setHl(e.target.value)} />
            {hl.trim().length > 1 && <span className="muted small">{hits.length}</span>}
          </span>
        </div>
        <div className="sv-bar-group sv-more-wrap">
          <button onClick={() => setMore(!more)} aria-expanded={more} aria-label="More tools">⋯</button>
          {more && (
            <div className="sv-more">
              <input className="sv-find sv-mid-only" placeholder="Find on sheet" value={hl} onChange={(e) => setHl(e.target.value)} />
              {hl.trim().length > 1 && <span className="muted small sv-mid-only">{hits.length} on this sheet</span>}
              <div className="sv-more-row sv-narrow-only">
                <button disabled={index <= 0} onClick={() => stepTo(index - 1)}>‹ Previous</button>
                <button disabled={index < 0 || index >= sheets.length - 1} onClick={() => stepTo(index + 1)}>Next ›</button>
              </div>
              <div className="sv-more-row sv-narrow-only">
                <button onClick={zoomOut} aria-label="Zoom out">−</button>
                <button onClick={fit}>Fit</button>
                <button onClick={zoomIn} aria-label="Zoom in">+</button>
              </div>
              <button className={linkMode ? 'on' : ''} onClick={() => { setLinkMode(!linkMode); setPending(null); setMore(false) }}>
                {linkMode ? 'Done linking' : 'Add link'}
              </button>
              <button onClick={() => { setMore(false); openStoredPdf(project, sheet.filePath).catch((e) => setError(e instanceof Error ? e.message : String(e))) }}>
                Open PDF
              </button>
            </div>
          )}
        </div>
        <div className="sv-bar-group">
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
      </div>
      {linkMode && <div className="sv-hint">Drag a box over a detail tag or note, then choose the sheet it should open. Click × on a link you drew to remove it.</div>}
      <div className="sv-body">
        <aside className={`sv-index${indexOpen ? ' open' : ''}`} aria-label="Sheets in this set">
          <div className="sv-jump">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Jump to a sheet (${sheets.length})`} aria-label="Filter sheets" />
          </div>
          <div className="sv-index-list">
            {listed.length === 0 && <p className="sv-index-empty">No sheet matches “{filter.trim()}”.</p>}
            {listed.map((s) => (
              <button key={s.number} className={norm(s.number) === norm(sheet.number) ? 'on' : ''} onClick={() => go(s)}>
                <span className="sv-ix-number">{s.number}</span>
                {s.title && <span className="sv-ix-title">{s.title}</span>}
              </button>
            ))}
          </div>
        </aside>
        {indexOpen && <button className="sv-scrim" aria-label="Close the sheet list" onClick={() => setIndexOpen(false)} />}
        <div className="sv-scroll" ref={scroller} onScroll={onScroll}>
          {busy && <p className="muted sv-msg">Loading {sheet.number}…</p>}
          {error && <div className="notice error sv-msg">{error}</div>}
          <div className={`sv-page ${linkMode ? 'linking' : ''}`} style={{ width, height, visibility: busy ? 'hidden' : 'visible' }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            <canvas ref={canvas} style={{ width, height }} />
            {hits.map((b, i) => <span key={'h' + i} className="sv-hit" style={pct(b)} />)}
            {!linkMode && autoLinks.map((l, i) => (
              <button key={'a' + i} className="sv-link auto" style={pct(l)} title={`Open ${l.target}`} onClick={() => follow(l.target)} />
            ))}
            {manual.map((l) => (
              <span key={l.id} className="sv-link manual" style={pct(l)}>
                {linkMode
                  ? <button className="sv-x" onClick={() => removeLink(l.id)} aria-label={`Remove link to ${l.target_number}`}>×</button>
                  : <button className="sv-fill" title={`Open ${l.target_number}`} onClick={() => follow(l.target_number)} />}
                <span className="sv-tag">{l.target_number}</span>
              </span>
            ))}
            {draft && <span className="sv-draft" style={pct(draft)} />}
            {pending && (
              <>
                <span className="sv-draft" style={pct(pending)} />
                <div className="sv-pop" style={{ left: `${pending.x * 100}%`, top: `${(pending.y + pending.h) * 100}%` }}>
                  <select autoFocus value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Opens sheet…</option>
                    {sheets.filter((s) => norm(s.number) !== norm(sheet.number)).map((s) => <option key={s.number} value={s.number}>{s.number} {s.title ?? ''}</option>)}
                  </select>
                  <button className="primary" disabled={!target} onClick={saveLink}>Save link</button>
                  <button onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pieces of a text run that could be sheet numbers: "SEE 3/A501" → "SEE", "3", "A501". */
function tokens(s: string): { token: string; start: number }[] {
  const out: { token: string; start: number }[] = []
  const re = /[A-Za-z]{1,3}[-.]?\d{1,4}(?:\.\d{1,3})?[A-Za-z]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const before = s[m.index - 1], after = s[m.index + m[0].length]
    if ((before && /[A-Za-z0-9]/.test(before)) || (after && /[A-Za-z0-9]/.test(after))) continue
    out.push({ token: m[0], start: m.index })
  }
  return out
}

/** The part of a run covering characters [start, start+len), estimated from character position. */
function subBox(w: PageWord, start: number, len: number): Box {
  const n = Math.max(1, w.str.length)
  const a = start / n, b = len / n
  if (w.vertical) return { x: w.x, y: w.y + w.h * (1 - a - b), w: w.w, h: w.h * b }
  return { x: w.x + w.w * a, y: w.y, w: w.w * b, h: w.h }
}
