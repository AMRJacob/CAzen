import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument } from '../lib/pdf/pdfjs'
import type { PageText, Region } from '../lib/pdf/pageText'
import { textInRegion } from '../lib/pdf/pageText'
import { anchorsFrom, readWith, REGION_LABELS, saveTemplate, SHEET_NUMBER, type RegionKey, type TitleblockTemplate } from '../lib/titleblocks'

const KEYS: RegionKey[] = ['number', 'title', 'revision']

/**
 * Draw a title block template on a sample sheet: pick "Sheet number", drag a box over it,
 * then the same for the title (and optionally the revision mark). What CAzen reads in each box
 * shows live, so a box that catches the wrong words is easy to see.
 */
export function TitleblockEditor({ firmId, pages, initialPage = 0, template, onSaved, onCancel }: {
  firmId: string
  /** Sample sheets to draw on (the pages of the upload). */
  pages: { bytes: Uint8Array; text: PageText; label: string }[]
  initialPage?: number
  template?: TitleblockTemplate
  onSaved: (t: TitleblockTemplate) => void
  onCancel: () => void
}) {
  const [pageIx, setPageIx] = useState(initialPage)
  const [img, setImg] = useState<string | null>(null)
  const [aspect, setAspect] = useState(1.5)
  const [zoom, setZoom] = useState(1)
  const [name, setName] = useState(template?.name ?? '')
  const [regions, setRegions] = useState<Partial<Record<RegionKey, Region>>>(template?.regions ?? {})
  const [active, setActive] = useState<RegionKey>(template?.regions.number ? 'title' : 'number')
  const [draft, setDraft] = useState<Region | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pageEl = useRef<HTMLDivElement>(null)
  const sharp = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<Awaited<ReturnType<typeof getDocument>['promise']> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const page = pages[pageIx]

  // A quick overview image of the whole sheet; zoomed-in views are re-drawn sharply on top.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    setImg(null)
    ;(async () => {
      const pdf = await getDocument({ data: page.bytes.slice() }).promise
      if (cancelled) { await pdf.loadingTask.destroy(); return }
      pdfRef.current?.loadingTask.destroy()
      pdfRef.current = pdf
      const p = await pdf.getPage(1)
      const base = p.getViewport({ scale: 1 })
      setAspect(base.width / base.height)
      const vp = p.getViewport({ scale: 2400 / Math.max(base.width, base.height) })
      const c = document.createElement('canvas')
      c.width = vp.width
      c.height = vp.height
      await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res))
      if (cancelled || !blob) return
      url = URL.createObjectURL(blob)
      setImg(url)
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [page])
  useEffect(() => () => { pdfRef.current?.loadingTask.destroy() }, [])

  const [fit, setFit] = useState(900)
  useEffect(() => {
    const f = () => scroller.current && setFit(Math.max(320, scroller.current.clientWidth - 24))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const width = fit * zoom
  const height = width / aspect
  const MAX_ZOOM = 24

  // Zoom keeping one point of the sheet (fractions) under the same spot on screen.
  const zoomAround = useCallback((z: number, fx: number, fy: number, screenX?: number, screenY?: number) => {
    const el = scroller.current
    if (!el) return
    const nz = Math.min(MAX_ZOOM, Math.max(1, z))
    setZoom(nz)
    requestAnimationFrame(() => {
      const w = fit * nz, h = w / aspect
      const sx = screenX ?? el.clientWidth / 2, sy = screenY ?? el.clientHeight / 2
      el.scrollTo({ left: fx * w + 12 - sx, top: fy * h + 12 - sy })
    })
  }, [fit, aspect])

  const centre = () => {
    const el = scroller.current
    if (!el) return { fx: 0.5, fy: 0.5 }
    return { fx: (el.scrollLeft - 12 + el.clientWidth / 2) / width, fy: (el.scrollTop - 12 + el.clientHeight / 2) / height }
  }
  const zoomBy = (k: number) => { const c = centre(); zoomAround(zoom * k, c.fx, c.fy) }
  // Title blocks usually sit at the right or bottom: jump to the number box, or the bottom-right corner.
  function toTitleBlock() {
    const t = regions.number ?? { x: 0.84, y: 0.86, w: 0.12, h: 0.1 }
    zoomAround(Math.max(zoom, 6), t.x + t.w / 2, t.y + t.h / 2)
  }

  // Ctrl/⌘ + scroll, or a trackpad pinch, zooms around the pointer. Plain scrolling pans.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const pr = pageEl.current!.getBoundingClientRect(), sr = el.getBoundingClientRect()
      const fx = (e.clientX - pr.left) / pr.width, fy = (e.clientY - pr.top) / pr.height
      zoomAround(zoom * Math.exp(-e.deltaY * 0.0025), fx, fy, e.clientX - sr.left, e.clientY - sr.top)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [zoom, zoomAround])

  // Hold the space bar to drag the sheet around instead of drawing.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input, select, textarea')) { e.preventDefault(); setSpaceDown(true) } }
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  // Re-draw the visible part sharply from the PDF once zooming or scrolling settles.
  const [view, setView] = useState({ x: 0, y: 0, w: 0, h: 0 })
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let t: number | undefined
    const update = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const pr = pageEl.current?.getBoundingClientRect(), sr = el.getBoundingClientRect()
        if (!pr) return
        const x0 = Math.max(0, sr.left - pr.left), y0 = Math.max(0, sr.top - pr.top)
        const x1 = Math.min(pr.width, sr.right - pr.left), y1 = Math.min(pr.height, sr.bottom - pr.top)
        setView({ x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) })
      }, 120)
    }
    update()
    el.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => { window.clearTimeout(t); el.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [zoom, width, img])
  useEffect(() => {
    const pdf = pdfRef.current, c = sharp.current
    if (!pdf || !c || zoom <= 1.5 || view.w < 2 || view.h < 2) { if (c) c.style.display = 'none'; return }
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    let cancelled = false
    ;(async () => {
      const p = await pdf.getPage(1)
      const base = p.getViewport({ scale: 1 })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (width / base.width) * dpr
      const vp = p.getViewport({ scale, offsetX: -view.x * dpr, offsetY: -view.y * dpr })
      const off = document.createElement('canvas')
      off.width = Math.round(view.w * dpr)
      off.height = Math.round(view.h * dpr)
      task = p.render({ canvas: off, canvasContext: off.getContext('2d')!, viewport: vp }) as unknown as { cancel: () => void; promise: Promise<unknown> }
      await task.promise
      if (cancelled) return
      c.width = off.width
      c.height = off.height
      c.getContext('2d')!.drawImage(off, 0, 0)
      Object.assign(c.style, { display: 'block', left: `${view.x}px`, top: `${view.y}px`, width: `${view.w}px`, height: `${view.h}px` })
    })().catch(() => { /* a newer view replaced this one */ })
    return () => { cancelled = true; task?.cancel() }
  }, [view, width, zoom])

  const frac = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const down = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (spaceDown || e.button === 1) {
      const el = scroller.current!
      panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
      e.preventDefault()
      return
    }
    startRef.current = frac(e)
    setDraft({ ...startRef.current, w: 0, h: 0 })
  }
  const move = (e: React.PointerEvent) => {
    if (panRef.current) {
      const el = scroller.current!, p = panRef.current
      el.scrollTo({ left: p.left - (e.clientX - p.x), top: p.top - (e.clientY - p.y) })
      return
    }
    if (!startRef.current) return
    const p = frac(e), s = startRef.current
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const up = () => {
    if (panRef.current) { panRef.current = null; return }
    if (!startRef.current) return
    startRef.current = null
    if (draft && draft.w > 0.002 && draft.h > 0.002) {
      setRegions({ ...regions, [active]: draft })
      const next = KEYS[KEYS.indexOf(active) + 1]
      if (next && !regions[next]) setActive(next)
    }
    setDraft(null)
  }

  const read = (k: RegionKey) => (regions[k] ? textInRegion(page.text, regions[k]!) : '')
  const reading = readWith(page.text, { id: '', firm_id: firmId, name, regions })
  const numberRead = reading.number
  const numberOk = SHEET_NUMBER.test(numberRead)
  const scanned = page.text.words.length === 0

  async function save() {
    if (!regions.number) { setError('Draw a box around the sheet number first.'); return }
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveTemplate({ id: template?.id, firm_id: firmId, name: name || 'Title block', regions, page_size: { w: Math.round(page.text.width), h: Math.round(page.text.height) }, anchors: anchorsFrom(page.text, { id: '', firm_id: firmId, name, regions }) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="tb-editor card">
      <div className="tb-head">
        <div>
          <h2>{template ? 'Edit title block template' : 'New title block template'}</h2>
          <p className="muted small">Choose what to mark, then drag a box over it on the sheet. Zoom in to the title block for accuracy. Make one template per title block layout, such as your own and each consultant’s.</p>
        </div>
        <label className="tb-name">Template name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="AMR 24×36, Structural consultant…" /></label>
      </div>

      <div className="tb-body">
        <div className="tb-side">
          <label className="stack">Sample sheet
            <select value={pageIx} onChange={(e) => setPageIx(Number(e.target.value))}>
              {pages.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
            </select>
          </label>
          {KEYS.map((k) => (
            <button key={k} type="button" className={`tb-key ${active === k ? 'on' : ''} key-${k}`} onClick={() => setActive(k)}>
              <span className="tb-key-head">
                <span className="tb-dot" />
                {REGION_LABELS[k]}{k === 'revision' && <span className="muted small"> optional</span>}
                {regions[k] && <span className="link small tb-clear" role="button" onClick={(e) => { e.stopPropagation(); const r = { ...regions }; delete r[k]; setRegions(r) }}>clear</span>}
              </span>
              <span className={`tb-read ${k === 'number' && regions.number && !numberOk ? 'bad-text' : ''}`}>
                {regions[k] ? ((k === 'number' ? reading.number : k === 'title' ? reading.title : reading.revision) || read(k) || 'nothing read here') : active === k ? 'Drag a box on the sheet' : 'not set'}
              </span>
              {k === 'number' && regions.number && !numberOk && read(k) && <span className="small bad-text">Doesn’t look like a sheet number</span>}
            </button>
          ))}
          {scanned && <div className="notice small">This page has no text layer (it may be a scan), so nothing can be read from it. Choose another sample sheet.</div>}
          <div className="tb-zoom">
            <span className="muted small">Zoom</span>
            <button type="button" onClick={() => zoomBy(1 / 1.6)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
            <span className="tb-zoom-level">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomBy(1.6)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => zoomAround(1, 0.5, 0.5)}>Fit</button>
            <button type="button" className="primary-lite" onClick={toTitleBlock}>Title block</button>
          </div>
          <p className="muted small tb-hint">Ctrl + scroll (or pinch) to zoom where you point; scroll to move around; hold Space and drag to pan.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={save} disabled={busy || !regions.number}>{busy ? 'Saving…' : 'Save template'}</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
          {error && <div className="notice error">{error}</div>}
        </div>

        <div className="tb-scroll" ref={scroller}>
          <div className={`tb-page ${spaceDown ? 'panning' : ''}`} ref={pageEl} style={{ width, height }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            {img ? <img src={img} alt="" draggable={false} style={{ width, height }} /> : <p className="muted">Rendering sheet…</p>}
            <canvas ref={sharp} className="tb-sharp" />
            {KEYS.map((k) => regions[k] && (
              <span key={k} className={`tb-box key-${k} ${active === k ? 'on' : ''} ${regions[k]!.x + regions[k]!.w > 0.8 ? 'label-right' : ''}`} style={pct(regions[k]!)}><span>{REGION_LABELS[k]}</span></span>
            ))}
            {draft && <span className={`tb-box key-${active} drawing`} style={pct(draft)} />}
          </div>
        </div>
      </div>
    </div>
  )
}

const pct = (b: Region) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` })
