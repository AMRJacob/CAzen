import { useEffect, useMemo, useRef, useState } from 'react'
import { getDocument } from '../lib/pdf/pdfjs'
import { PAGE_H, PAGE_W, DEFAULT_CONTINUATION, type Layout } from '../lib/templates/types'
import type { FieldDef } from '../lib/templates/fields'

/**
 * A form shown as it will print, and edited where it is read.
 *
 * The page on screen is the document itself — the same bytes that will be issued, drawn again a
 * moment after anything changes — so there is nothing to imagine between filling it in and
 * seeing it. Each part of the page that takes something typed is a box laid over it; touching
 * one opens that part to edit beside the page (under it, on a phone). A box with nothing in it
 * prints nothing, so its name is written there faintly until something is.
 */
export function PrintedForm({ layout, fields, stamp, render, value, input }: {
  layout: Layout
  /** The fields this template prints and a person fills in. */
  fields: FieldDef[]
  /** Changes whenever the document would: the values, as one string. */
  stamp: string
  render: () => Promise<Uint8Array>
  value: (key: string) => string
  /** The editor for one field — the same one the list of fields uses. */
  input: (f: FieldDef) => React.ReactNode
}) {
  const [pages, setPages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [editing, setEditing] = useState<string[] | null>(null)
  const urls = useRef<string[]>([])
  const renderNow = useRef(render)
  useEffect(() => { renderNow.current = render })

  // Drawn a moment after the last change, and swapped in whole: the page on screen is never
  // taken away to make room for the next one.
  useEffect(() => {
    let gone = false
    setStale(true)
    const t = window.setTimeout(async () => {
      try {
        const bytes = await renderNow.current()
        const task = getDocument({ data: bytes.slice() })
        const doc = await task.promise
        const next: string[] = []
        for (let n = 1; n <= doc.numPages && n <= 12; n++) {
          const page = await doc.getPage(n)
          const vp = page.getViewport({ scale: Math.min(3, Math.max(1.5, (window.devicePixelRatio || 1) * 1.4)) })
          const c = document.createElement('canvas')
          c.width = Math.round(vp.width); c.height = Math.round(vp.height)
          await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
          const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
          if (blob) next.push(URL.createObjectURL(blob))
        }
        void task.destroy()
        if (gone) { next.forEach((u) => URL.revokeObjectURL(u)); return }
        const old = urls.current
        urls.current = next
        setPages(next); setStale(false); setError(null)
        window.setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 1500)
      } catch (e) { if (!gone) { setError(e instanceof Error ? e.message : String(e)); setStale(false) } }
    }, pages.length ? 420 : 0)
    return () => { gone = true; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields])
  /** The parts of the page that take typing: where they are and which fields they hold. */
  const spots = useMemo(() => {
    const out: { id: string; keys: string[]; x: number; y: number; w: number; h: number; flow: boolean; label: string; labelled: boolean }[] = []
    for (const el of layout.elements) {
      if (el.type !== 'field' && el.type !== 'choices' && el.type !== 'table') continue
      const keys = (el.type === 'field' && el.combine ? el.combine.map((c) => c.field) : [el.field]).filter((k) => byKey.has(k))
      if (!keys.length) continue
      out.push({ id: el.id, keys, x: el.x, y: el.y, w: el.w, h: Math.max(el.h, 12), flow: el.type === 'field' && !!el.flow,
        label: keys.map((k) => byKey.get(k)!.label).join(' · '),
        // A box with its name printed beside it already says what it is.
        labelled: el.type === 'field' && el.labelMode !== 'none' && !!el.label })
    }
    return out
  }, [layout, byKey])
  const flow = spots.find((s) => s.flow)
  const cont = layout.continuation ?? DEFAULT_CONTINUATION
  const pct = (n: number, of: number) => `${(n / of) * 100}%`
  const on = (keys: string[]) => !!editing && editing.join() === keys.join()

  return (
    <div className={`pf${editing ? ' pf-editing' : ''}`}>
      <div className="pf-pages">
        {!pages.length && !error && <div className="pf-page pf-blank"><span className="muted">Drawing the page…</span></div>}
        {error && <div className="notice error">{error}</div>}
        {pages.map((src, n) => (
          <div key={n} className={`pf-page${stale ? ' pf-stale' : ''}`}>
            <img src={src} alt={`Page ${n + 1} as it will print`} draggable={false} />
            {n === 0 && spots.map((s) => {
              const empty = s.keys.every((k) => !value(k).trim())
              return (
                <button key={s.id} type="button" className={`pf-spot${on(s.keys) ? ' on' : ''}${empty ? ' empty' : ''}`}
                  style={{ left: pct(s.x, PAGE_W), top: pct(s.y, PAGE_H), width: pct(s.w, PAGE_W),
                    height: s.flow && pages.length > 1 ? pct(PAGE_H - s.y - (PAGE_H - cont.bottom), PAGE_H) : pct(s.h, PAGE_H) }}
                  aria-label={`Change ${s.label}`} title={s.label} onClick={() => setEditing(s.keys)}>
                  {empty && !s.labelled && <span className="pf-ghost">{s.label}</span>}
                </button>
              )
            })}
            {n > 0 && flow && (
              <button type="button" className={`pf-spot${on(flow.keys) ? ' on' : ''}`} aria-label={`Change ${flow.label}`} title={flow.label}
                style={{ left: pct(flow.x, PAGE_W), width: pct(flow.w, PAGE_W), top: pct(cont.top, PAGE_H), height: pct(cont.bottom - cont.top, PAGE_H) }}
                onClick={() => setEditing(flow.keys)} />
            )}
          </div>
        ))}
      </div>
      <aside className="pf-side" aria-live="polite">
        {editing ? (
          <div className="pf-edit card">
            <div className="form pf-form">{editing.map((k) => byKey.get(k)).filter((f): f is FieldDef => !!f).map((f) => <div key={f.key} className="pf-one">{input(f)}</div>)}</div>
            <div className="pf-edit-foot">
              <button className="primary-lite" onClick={() => setEditing(null)}>Done</button>
              <span className="muted small">The page redraws as you type.</span>
            </div>
          </div>
        ) : (
          <div className="pf-hint card">
            <p className="muted small">This is the page as it will print. Click any part of it to change it.</p>
            <div className="pf-list">
              {spots.map((s) => {
                const empty = s.keys.every((k) => !value(k).trim())
                return <button key={s.id} type="button" className={`pf-jump${empty ? ' empty' : ''}`} onClick={() => setEditing(s.keys)}>{s.label}{empty && <span className="muted"> — blank</span>}</button>
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
