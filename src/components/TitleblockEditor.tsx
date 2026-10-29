import { useEffect, useRef, useState } from 'react'
import { getDocument } from '../lib/pdf/pdfjs'
import type { PageText, Region } from '../lib/pdf/pageText'
import { textInRegion } from '../lib/pdf/pageText'
import { readWith, REGION_LABELS, saveTemplate, SHEET_NUMBER, type RegionKey, type TitleblockTemplate } from '../lib/titleblocks'

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
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const page = pages[pageIx]

  // Render the sample sheet once, large enough to read title block text when zoomed in.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    setImg(null)
    ;(async () => {
      const pdf = await getDocument({ data: page.bytes.slice() }).promise
      const p = await pdf.getPage(1)
      const base = p.getViewport({ scale: 1 })
      setAspect(base.width / base.height)
      const vp = p.getViewport({ scale: Math.min(3, 5200 / Math.max(base.width, base.height)) })
      const c = document.createElement('canvas')
      c.width = vp.width
      c.height = vp.height
      await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res))
      await pdf.loadingTask.destroy()
      if (cancelled || !blob) return
      url = URL.createObjectURL(blob)
      setImg(url)
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [page])

  const [fit, setFit] = useState(900)
  useEffect(() => {
    const f = () => scroller.current && setFit(Math.max(320, scroller.current.clientWidth - 24))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const width = fit * zoom
  const height = width / aspect

  // Title blocks usually sit at the right or bottom: zooming in starts there.
  function zoomTo(z: number) {
    setZoom(z)
    requestAnimationFrame(() => {
      const el = scroller.current
      if (!el) return
      const target = regions.number ?? { x: 0.85, y: 0.85, w: 0.1, h: 0.1 }
      el.scrollTo({ left: (target.x + target.w / 2) * fit * z - el.clientWidth / 2, top: (target.y + target.h / 2) * (fit * z / aspect) - el.clientHeight / 2 })
    })
  }

  const frac = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const down = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = frac(e)
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
      onSaved(await saveTemplate({ id: template?.id, firm_id: firmId, name: name || 'Title block', regions }))
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
            {[1, 2, 4, 8].map((z) => <button key={z} type="button" className={zoom === z ? 'on' : ''} onClick={() => zoomTo(z)}>{z === 1 ? 'Fit' : `${z}×`}</button>)}
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={save} disabled={busy || !regions.number}>{busy ? 'Saving…' : 'Save template'}</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
          {error && <div className="notice error">{error}</div>}
        </div>

        <div className="tb-scroll" ref={scroller}>
          <div className="tb-page" style={{ width, height }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
            {img ? <img src={img} alt="" draggable={false} style={{ width, height }} /> : <p className="muted">Rendering sheet…</p>}
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
