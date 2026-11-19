import { useCallback, useRef, useState } from 'react'
import { along, monthsIn, span, type Activity } from '../lib/schedule'
import { usDate } from '../lib/dates'

/**
 * The schedule as a Gantt chart, the way a scheduling program prints one: line number,
 * activity, start, finish and percent in columns, and the bars to the right on one time scale.
 *
 * The bar is the activity's dates and the darker part of it is what the contractor says is
 * done, so "behind" shows as a fill that stops short of today's line. A row is changed by
 * right-clicking it (or pressing and holding, on a touch screen): it opens in place, and
 * closes on Enter, Escape or Done.
 */
export function Gantt({ activities, today, linesOf, onChange, onCovers, onRemove }: {
  activities: Activity[]
  today: string
  /** What an activity's pay lines are called, for the row being edited. */
  linesOf: (a: Activity) => string
  onChange: (id: string, patch: Partial<Activity>) => void
  /** Open the picker for which pay lines an activity covers. */
  onCovers: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; percent: string }>({ name: '', percent: '' })
  const range = span(activities)
  const months = range ? monthsIn(range.from, range.to) : []
  const now = range && today >= range.from && today <= range.to ? along(today, range.from, range.to) : null

  // A heading stands for the activities under it, up to the next heading: its row carries the
  // span of them, as a summary row does in a scheduling program.
  const under = new Map<string, { from: string; to: string }>()
  let head: string | null = null
  for (const a of activities) {
    if (a.is_heading) { head = a.id; continue }
    const f = a.starts_on, t = a.ends_on ?? a.starts_on
    if (!head || !f || !t) continue
    const was = under.get(head)
    under.set(head, was ? { from: f < was.from ? f : was.from, to: t > was.to ? t : was.to } : { from: f, to: t })
  }

  // Time can be stretched and slid: the chart column of every row shares one zoom and one
  // offset, held as two CSS variables on the chart so that moving it re-lays nothing out.
  const root = useRef<HTMLDivElement>(null)
  const view = useRef({ z: 1, p: 0 })
  const [zoomed, setZoomed] = useState(1)
  const place = useCallback((z: number, p: number) => {
    z = Math.min(24, Math.max(1, z)); p = Math.min(z - 1, Math.max(0, p))
    view.current = { z, p }
    root.current?.style.setProperty('--gz', String(z))
    root.current?.style.setProperty('--gp', String(p))
    setZoomed(z)
  }, [])
  const chartBox = () => root.current?.querySelector('.gx-head .gx-chart')?.getBoundingClientRect() ?? null
  /** Zoom about a point across the chart (0 at its left edge, 1 at its right), keeping the day under it still. */
  const zoomAbout = useCallback((fx: number, factor: number) => {
    const { z, p } = view.current
    const next = Math.min(24, Math.max(1, z * factor))
    place(next, ((p + fx) / z) * next - fx)
  }, [place])
  const drag = useRef<{ id: number; x: number; p: number; w: number } | null>(null)

  const open = (a: Activity) => { setEditing(a.id); setDraft({ name: a.name, percent: String(a.percent) }) }
  const close = (a: Activity) => {
    const percent = Math.max(0, Math.min(100, Number(draft.percent) || 0))
    const patch: Partial<Activity> = {}
    if (draft.name.trim() && draft.name !== a.name) patch.name = draft.name.trim()
    if (!a.is_heading && percent !== a.percent) patch.percent = percent
    if (Object.keys(patch).length) onChange(a.id, patch)
    setEditing(null)
  }
  const keys = (a: Activity) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') close(a); else if (e.key === 'Escape') setEditing(null) }

  /** The time scale's rules and today's line, drawn in every row so they run the chart's height. */
  const rules = (
    <>
      {months.map((m) => <span key={`${m.label}${m.at}`} className="gx-rule" style={{ left: `${m.at * 100}%` }} aria-hidden="true" />)}
      {now != null && <span className="gx-today" style={{ left: `${now * 100}%` }} aria-hidden="true" />}
    </>
  )

  return (
    <div className="gx-wrap">
      <div className="gx-zoom">
        <span className="muted small">Drag the chart sideways to move through time; Ctrl + scroll, or a trackpad pinch, zooms.</span>
        <button aria-label="Zoom out" onClick={() => zoomAbout(0.5, 1 / 1.6)} disabled={zoomed <= 1}>−</button>
        <button aria-label="Zoom in" onClick={() => zoomAbout(0.5, 1.6)}>+</button>
        <button onClick={() => place(1, 0)} disabled={zoomed <= 1}>Fit</button>
      </div>
      <div className="gx" role="table" aria-label="Construction schedule" ref={root}
        onWheel={(e) => {
          const box = chartBox()
          if (!box || e.clientX < box.left) return
          if (e.ctrlKey || e.metaKey) zoomAbout((e.clientX - box.left) / box.width, Math.exp(-e.deltaY * 0.004))
          else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) place(view.current.z, view.current.p + (e.shiftKey ? e.deltaY : e.deltaX) / box.width)
        }}
        onPointerDown={(e) => {
          const box = chartBox()
          if (!box || e.clientX < box.left || e.button !== 0 || (e.target as Element).closest('button, input')) return
          drag.current = { id: e.pointerId, x: e.clientX, p: view.current.p, w: box.width }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          if (Math.abs(e.clientX - d.x) > 3) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          place(view.current.z, d.p - (e.clientX - d.x) / d.w)
        }}
        onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <div className="gx-row gx-head" role="row">
          <span className="gx-no">Line</span><span>Activity</span><span>Start</span><span>Finish</span><span className="gx-pc">%</span>
          <span className="gx-chart gx-scale" aria-hidden="true">
            <span className="gx-in">
              {months.map((m) => {
                // January carries the year; the other months are themselves.
                const year = m.label.match(/\d{4}/)?.[0]
                return <span key={m.label + m.at} className={`gx-month${year ? ' gx-year' : ''}`} style={{ left: `${m.at * 100}%` }}>{year ?? m.label}</span>
              })}
            </span>
          </span>
        </div>
        {activities.map((a, i) => {
          const from = a.starts_on, to = a.ends_on ?? a.starts_on
          const edit = editing === a.id
          let bar = null
          if (!a.is_heading && range && from && to) {
            const left = along(from, range.from, range.to)
            const width = Math.max(0.004, along(to, range.from, range.to) - left)
            // Behind is only meaningful once the activity has started and time has passed in it.
            const due = to <= today ? 100 : from >= today ? 0 : along(today, from, to) * 100
            // No length to it: a milestone, drawn as a point in time rather than a sliver of bar.
            if (from === to) bar = <span className={`gx-mile${a.percent >= 100 ? ' done' : to < today ? ' behind' : ''}`} style={{ left: `${left * 100}%` }} title={`${a.name}: ${usDate(from)}`} />
            else bar = (
              <span className={`gx-bar${a.percent + 0.5 < due ? ' behind' : ''}`} style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
                title={`${a.name}: ${usDate(from)} to ${usDate(to)}, ${Math.round(a.percent)}%`}>
                <span className="gx-done" style={{ width: `${a.percent}%` }} />
              </span>
            )
          }
          const sum = a.is_heading ? under.get(a.id) : undefined
          if (sum && range) {
            const left = along(sum.from, range.from, range.to)
            bar = <span className="gx-sum" style={{ left: `${left * 100}%`, width: `${Math.max(0.004, along(sum.to, range.from, range.to) - left) * 100}%` }} title={`${a.name}: ${usDate(sum.from)} to ${usDate(sum.to)}`} />
          }
          return (
            <div key={a.id} role="row" className={`gx-row${a.is_heading ? ' gx-heading' : ''}${edit ? ' gx-editing' : ''}`}
              onContextMenu={(e) => { e.preventDefault(); if (!edit) open(a) }}>
              <span className="gx-no">{i + 1}</span>
              {edit ? (
                <>
                  <span><input autoFocus value={draft.name} aria-label="Activity name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={keys(a)} /></span>
                  {a.is_heading ? <><span /><span /><span /></> : (
                    <>
                      <span><input type="date" value={a.starts_on ?? ''} aria-label="Start" onChange={(e) => onChange(a.id, { starts_on: e.target.value || null })} onKeyDown={keys(a)} /></span>
                      <span><input type="date" value={a.ends_on ?? ''} aria-label="Finish" onChange={(e) => onChange(a.id, { ends_on: e.target.value || null })} onKeyDown={keys(a)} /></span>
                      <span className="gx-pc"><input inputMode="decimal" value={draft.percent} aria-label="Percent complete" onChange={(e) => setDraft({ ...draft, percent: e.target.value })} onKeyDown={keys(a)} /></span>
                    </>
                  )}
                  <span className="gx-chart gx-tools">
                    {!a.is_heading && <button className="link" onClick={() => onCovers(a.id)} title="Which lines of the pay application's schedule of values this activity is paid under">Pay lines: {linesOf(a)}</button>}
                    <button className="link danger-link" onClick={() => { setEditing(null); onRemove(a.id) }}>Remove</button>
                    <button className="primary-lite" onClick={() => close(a)}>Done</button>
                  </span>
                </>
              ) : (
                <>
                  <span className="gx-name" title={a.name}>{a.name}</span>
                  <span>{a.is_heading ? (sum ? usDate(sum.from) : '') : from ? usDate(from) : '—'}</span>
                  <span>{a.is_heading ? (sum ? usDate(sum.to) : '') : a.ends_on ? usDate(a.ends_on) : '—'}</span>
                  <span className="gx-pc">{a.is_heading ? '' : `${Math.round(a.percent)}%`}</span>
                  <span className="gx-chart"><span className="gx-in">{rules}{bar}</span></span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
