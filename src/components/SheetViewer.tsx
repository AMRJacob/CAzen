import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { db } from '../lib/supabase'
import { readFile, type ProjectStore } from '../lib/files'
import { getDocument } from '../lib/pdf/pdfjs'
import { readPageText, type PageText, type PageWord } from '../lib/pdf/pageText'
import { usePageRender, usePageZoom } from '../lib/pdf/zoomPan'
import { openStoredPdf } from '../lib/sheets'
import { isMissingTable, message } from '../lib/errors'
import { MarkupPalette, TOOL_KEYS, type Tool } from './MarkupPalette'
import { bringForward, editMarkup, listMarkups, MARKUP_COLOURS, type Markup, type Point } from '../lib/markups'
import { MarkupLayer } from './MarkupLayer'

/** A sheet the viewer can show: the current revision of a sheet, or a specific older one. */
export interface ViewSheet {
  /** The sheet itself, which is what markups belong to. */
  sheetId?: string
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
  const [markups, setMarkups] = useState<Markup[]>([])
  const [tool, setTool] = useState<Tool>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [keep, setKeep] = useState(true)
  const [colour, setColour] = useState<string>(MARKUP_COLOURS[0])
  const [settingScale, setSettingScale] = useState(false)
  const [pendingScale, setPendingScale] = useState<{ from: Point; to: Point } | null>(null)
  const [scaleLength, setScaleLength] = useState('')
  const [scale, setScale] = useState<{ from: Point; to: Point; inches: number } | null>(null)
  const [me, setMe] = useState<string | null>(null)
  /** Why markups aren't available here, when they aren't. */
  const [markupsOff, setMarkupsOff] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<Awaited<ReturnType<typeof getDocument>['promise']> | null>(null)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [aspect, setAspect] = useState(1.5)

  const pageEl = useRef<HTMLDivElement>(null)
  const { zoom, width, height, fit, zoomAbout, showPoint } = usePageZoom(scroller, pageEl, aspect)
  usePageRender(canvas, page, width, zoom, !busy)

  const byNumber = useMemo(() => new Map(sheets.map((s) => [norm(s.number), s])), [sheets])
  const index = sheets.findIndex((s) => norm(s.number) === norm(sheet.number))

  const go = useCallback((s: ViewSheet) => {
    setStack((st) => [...st, s])
    setIndexOpen(false)
    setMore(false)
  }, [])
  const back = () => stack.length > 1 && setStack(stack.slice(0, -1))

  // Load the PDF, its words and its hand-drawn links.
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)
    setText(null)
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
        const { data: who } = await db().auth.getUser()
        if (!cancelled) setMe(who.user?.id ?? null)
        // Markups are an addition to a sheet, not a condition of showing one: if they can't be
        // read the drawing still opens and says so, rather than the whole viewer failing.
        if (sheet.sheetId) {
          try {
            const [drawn, row] = await Promise.all([
              listMarkups(sheet.sheetId),
              db().from('sheets').select('scale').eq('id', sheet.sheetId).single(),
            ])
            if (!cancelled) {
              setMarkups(drawn)
              setScale((row.data?.scale ?? null) as typeof scale)
              setMarkupsOff(null)
            }
          } catch (e) {
            if (!cancelled) {
              setMarkups([])
              setMarkupsOff(isMissingTable(e)
                ? 'Markups need migration 0015 run on the database.'
                : message(e))
            }
          }
        } else if (!cancelled) {
          setMarkups([])
          setMarkupsOff('Open this sheet from the register to mark it up.')
        }
      } catch (e) {
        if (!cancelled) setError(message(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [sheet.filePath, sheet.revisionId, project])

  useEffect(() => () => { pdfRef.current?.loadingTask.destroy() }, [])

  // A new sheet arrives fitted to the screen.
  useEffect(() => { if (!busy) fit() }, [busy, fit])

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
    if (!hits.length) return
    const h = hits[0]
    showPoint(h.x + h.w / 2, h.y + h.h / 2, 2.5)
  }, [hits, showPoint])

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
        else if (settingScale) setSettingScale(false)
        else if (tool !== null) setTool(null)
        else if (indexOpen) setIndexOpen(false)
        else if (linkMode) setLinkMode(false)
        else onClose()
      }
      // Single letters pick a tool while marking up, as the palette's own labels say.
      if (tool !== null && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const pick = TOOL_KEYS[e.key.toLowerCase()]
        if (pick && !(pick === 'dimension' && !scale && !settingScale)) { e.preventDefault(); setTool(pick); if (pick !== 'select') setSelected(null) }
        if (e.key === 'Delete' || e.key === 'Backspace') { /* handled by the layer's erase targets */ }
      }
      if (e.key === 'ArrowRight' && index >= 0 && index < sheets.length - 1) go(sheets[index + 1])
      if (e.key === 'ArrowLeft' && index > 0) go(sheets[index - 1])
      if (e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const pct = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` })

  const stale = markups.filter((m) => m.revision_id && m.revision_id !== sheet.revisionId).length
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
          <button className={tool !== null ? 'on' : ''} onClick={() => setTool(tool === null ? 'select' : null)}
            disabled={!sheet.sheetId} title={sheet.sheetId ? 'Draw, note and measure on this sheet' : 'Open this sheet from the register to mark it up'}>
            {tool !== null ? 'Done' : 'Mark up'}
          </button>
          <span className="sv-sep" />
          <button className="icon" disabled={index <= 0} onClick={() => stepTo(index - 1)} aria-label="Previous sheet">‹</button>
          <button className="icon" disabled={index < 0 || index >= sheets.length - 1} onClick={() => stepTo(index + 1)} aria-label="Next sheet">›</button>
          <span className="sv-sep" />
          <button className="icon" onClick={() => zoomAbout(1 / 1.5)} aria-label="Zoom out">−</button>
          <button onClick={fit} title="Fit the sheet to the screen">{Math.round(zoom * 100)}%</button>
          <button className="icon" onClick={() => zoomAbout(1.5)} aria-label="Zoom in">+</button>
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
                <button onClick={() => zoomAbout(1 / 1.5)} aria-label="Zoom out">−</button>
                <button onClick={fit}>Fit</button>
                <button onClick={() => zoomAbout(1.5)} aria-label="Zoom in">+</button>
              </div>
              <button className={`sv-narrow-only ${tool !== null ? 'on' : ''}`} onClick={() => { setTool(tool === null ? 'ink' : null); setMore(false) }}
                disabled={!sheet.sheetId} title={sheet.sheetId ? undefined : 'Open this sheet from the register to mark it up'}>
                {tool !== null ? 'Done marking up' : 'Mark up'}
              </button>
              <button className={linkMode ? 'on' : ''} onClick={() => { setLinkMode(!linkMode); setPending(null); setMore(false) }}>
                {linkMode ? 'Done linking' : 'Add link'}
              </button>
              <button onClick={() => { setMore(false); openStoredPdf(project, sheet.filePath).catch((e) => setError(message(e))) }}>
                Open PDF
              </button>
            </div>
          )}
        </div>
        <div className="sv-bar-group">
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
      </div>
      {markupsOff && tool !== null && <div className="sv-hint">{markupsOff}</div>}
      {settingScale && !pendingScale && (
        <div className="sv-hint">Draw a line along something you know the length of — a grid bay, a room, a wall.</div>
      )}
      {pendingScale && (
        <div className="sv-hint mk-scale-ask">
          That line is{' '}
          <input value={scaleLength} onChange={(e) => setScaleLength(e.target.value)} placeholder="20' or 240&quot;"
            aria-label="What that line measures" autoFocus />
          <button className="primary" disabled={!parseLength(scaleLength)} onClick={async () => {
            const inches = parseLength(scaleLength)
            if (!inches || !sheet.sheetId) return
            const next = { ...pendingScale, inches }
            await db().from('sheets').update({ scale: next }).eq('id', sheet.sheetId)
            setScale(next)
            setPendingScale(null)
            setScaleLength('')
            setSettingScale(false)
            setTool('dimension')
          }}>Set the scale</button>
          <button onClick={() => { setPendingScale(null); setScaleLength('') }}>Try again</button>
        </div>
      )}
      {tool !== null && stale > 0 && (
        <div className="sv-hint">
          {stale} of these markups {stale === 1 ? 'was' : 'were'} drawn on an earlier revision of this sheet.
        </div>
      )}
      {linkMode && <div className="sv-hint">Drag a box over a detail tag or note, then choose the sheet it should open. Click × on a link you drew to remove it.</div>}
      <div className="sv-body">
        {tool !== null && (
          <MarkupPalette
            tool={tool} setTool={(t) => { setTool(t); if (t !== 'select') setSelected(null) }}
            colour={colour}
            setColour={async (c) => {
              setColour(c)
              // With a markup in hand, the swatch is a change to that markup, not just the
              // colour of the next thing drawn.
              const m = selected ? markups.find((x) => x.id === selected) : null
              if (!m || (m.created_by && me && m.created_by !== me)) return
              const style = { ...(m.style ?? {}), colour: c }
              setMarkups((ms) => ms.map((x) => (x.id === m.id ? { ...x, style } : x)))
              await editMarkup(m.id, { style }).catch((e) => setError(message(e)))
            }}
            scale={scale} settingScale={settingScale} setSettingScale={setSettingScale}
            stale={stale}
            onBringForward={async () => {
              if (!sheet.sheetId) return
              await bringForward(sheet.sheetId, sheet.revisionId)
              setMarkups((ms) => ms.map((m) => ({ ...m, revision_id: sheet.revisionId })))
            }}
            onDone={() => { setTool(null); setSettingScale(false); setSelected(null) }}
            keep={keep} setKeep={setKeep}
            scratch={markups.filter((m) => m.id.startsWith('scratch:')).length}
          />
        )}
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
        <div className="sv-scroll" ref={scroller}>
          {busy && <p className="muted sv-msg">Loading {sheet.number}…</p>}
          {error && <div className="notice error sv-msg">{error}</div>}
          <div ref={pageEl} className={`sv-page ${linkMode ? 'linking' : ''}`}
            style={{ width, height, visibility: busy ? 'hidden' : 'visible' }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
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
            {sheet.sheetId && (
              <MarkupLayer
                markups={markups} tool={settingScale ? 'dimension' : tool} colour={colour}
                projectId={project.id} sheetId={sheet.sheetId} revisionId={sheet.revisionId}
                scale={scale} aspect={aspect} me={me}
                onChange={setMarkups}
                selected={selected}
                onSelect={setSelected}
                keep={keep}
                onPick={settingScale ? (from, to) => setPendingScale({ from, to }) : undefined}
              />
            )}
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

/**
 * A length as an architect types it: 20', 20 ft, 12'6", 12' 6 1/2", 240". Returns inches.
 */
export function parseLength(text: string): number | null {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return null
  const fraction = (s: string) => {
    const [a, b] = s.split('/').map(Number)
    return b ? a / b : Number(s)
  }
  const feet = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|f)\s*(.*)$/i)
  if (feet) {
    const rest = feet[2].replace(/["in]+$/i, '').trim()
    const inches = rest ? rest.split(' ').reduce((n, part) => n + fraction(part), 0) : 0
    return Number(feet[1]) * 12 + (Number.isFinite(inches) ? inches : 0)
  }
  const inchesOnly = t.match(/^([\d\s./]+)\s*(?:"|in|inches)?$/i)
  if (inchesOnly) {
    const n = inchesOnly[1].trim().split(' ').reduce((acc, part) => acc + fraction(part), 0)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
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
