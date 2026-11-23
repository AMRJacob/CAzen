import { useCallback, useRef, useState } from 'react'
import { along, canColour, monthsIn, span, type Activity } from '../lib/schedule'

/** Bar colours offered for a contractor's coding; null is the ordinary green. */
const GANTT_COLOURS: (string | null)[] = [null, '#3b6ea5', '#b5651d', '#8a4f9e', '#b23a48', '#2f8f83', '#6b6f76']
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
export function Gantt({ activities, today, linesOf, onChange, onCovers, onRemove, foldKey }: {
  activities: Activity[]
  /** Where on this device which summary rows are folded is remembered — per project. */
  foldKey?: string
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

  // A summary row stands for the rows under it: in an outline, every row deeper than it until one
  // that is not; in a flat schedule, every activity up to the next heading. Its bar spans them, as
  // a summary row does in a scheduling program, unless the schedule printed dates of its own.
  const outlined = activities.some((a) => (a.level ?? 0) > 0)
  const below = (i: number): number => {
    const a = activities[i]
    let j = i + 1
    while (j < activities.length && (outlined ? (activities[j].level ?? 0) > (a.level ?? 0) : !activities[j].is_heading)) j++
    return j
  }
  const ends = new Map<string, number>()
  const under = new Map<string, { from: string; to: string }>()
  activities.forEach((a, i) => {
    if (!a.is_heading) return
    const j = below(i)
    ends.set(a.id, j)
    let from = a.starts_on, to = a.ends_on ?? a.starts_on
    if (!from || !to) {
      for (const b of activities.slice(i + 1, j)) {
        if (b.is_heading) continue
        const f = b.starts_on, t = b.ends_on ?? b.starts_on
        if (!f || !t) continue
        from = !from || f < from ? f : from
        to = !to || t > to ? t : to
      }
    }
    if (from && to) under.set(a.id, { from, to })
  })

  // Folded summary rows hide what is under them. Remembered on this device, per project.
  const [fold, setFoldState] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse((foldKey && localStorage.getItem(foldKey)) || '[]') as string[]) } catch { return new Set() }
  })
  const setFold = (next: Set<string>) => {
    setFoldState(next)
    try { if (foldKey) localStorage.setItem(foldKey, JSON.stringify([...next])) } catch { /* private window: forgotten on reload */ }
  }
  const toggle = (id: string) => { const n = new Set(fold); if (n.has(id)) n.delete(id); else n.add(id); setFold(n) }
  const shown: { a: Activity; i: number }[] = []
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i]
    shown.push({ a, i })
    if (a.is_heading && fold.has(a.id)) i = (ends.get(a.id) ?? i + 1) - 1
  }
  const deepest = outlined ? Math.max(...activities.map((a) => a.level ?? 0)) : 0
  const headings = activities.filter((a) => a.is_heading)
  /** Show the outline down to `n` levels: every summary at level n−1 or deeper is folded. */
  const toLevel = (n: number) => setFold(new Set(headings.filter((h) => (h.level ?? 0) >= n - 1).map((h) => h.id)))
  const atLevel = (n: number) => headings.length > 0 && headings.every((h) => fold.has(h.id) === ((h.level ?? 0) >= n - 1))

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
        {headings.length > 0 && (
          <span className="gx-levels" role="group" aria-label="Show levels">
            <span className="muted small">{outlined ? 'Levels' : 'Headings'}</span>
            {outlined
              ? Array.from({ length: deepest + 1 }, (_, k) => k + 1).map((n) => (
                <button key={n} className={atLevel(n) ? 'on' : ''} onClick={() => toLevel(n)} title={`Show ${n === 1 ? 'the top level only' : `the top ${n} levels`}`}>{n}</button>
              ))
              : <button className={headings.every((h) => fold.has(h.id)) ? 'on' : ''} onClick={() => toLevel(1)}>Fold all</button>}
            <button className={fold.size === 0 ? 'on' : ''} onClick={() => setFold(new Set())}>All</button>
          </span>
        )}
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
        {shown.map(({ a, i }) => {
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
              <span className={`gx-bar${a.percent + 0.5 < due ? ' behind' : ''}${a.color ? ' gx-coloured' : ''}`} style={{ left: `${left * 100}%`, width: `${width * 100}%`, ...(a.color ? { ['--gx-ink' as string]: a.color } : {}) }}
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
            <div key={a.id} role="row" className={`gx-row${a.is_heading ? ' gx-heading' : ''}${a.is_heading && outlined ? ` gx-lv${Math.min(a.level ?? 0, 3)}` : ''}${edit ? ' gx-editing' : ''}`}
              style={{ ['--lv' as string]: a.level ?? 0 }}
              onContextMenu={(e) => { e.preventDefault(); if (!edit) open(a) }}>
              <span className="gx-no">{a.ref ?? i + 1}</span>
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
                    {!a.is_heading && canColour() && (
                      <span className="gx-swatches" role="group" aria-label="Bar colour">
                        {GANTT_COLOURS.map((c) => (
                          <button key={c ?? 'none'} type="button" className={`gx-swatch${(a.color ?? null) === c ? ' on' : ''}${c ? '' : ' none'}`}
                            style={c ? { background: c } : undefined} aria-label={c ? `Colour ${c}` : 'No colour'} onClick={() => onChange(a.id, { color: c })} />
                        ))}
                      </span>
                    )}
                    <button className="link danger-link" onClick={() => { setEditing(null); onRemove(a.id) }}>Remove</button>
                    <button className="primary-lite" onClick={() => close(a)}>Done</button>
                  </span>
                </>
              ) : (
                <>
                  <span className="gx-name" title={a.name}>
                    {a.is_heading && (ends.get(a.id) ?? i + 1) > i + 1
                      ? <button className="gx-fold" aria-expanded={!fold.has(a.id)} aria-label={`${fold.has(a.id) ? 'Show' : 'Hide'} what is under ${a.name}`} onClick={() => toggle(a.id)}>{fold.has(a.id) ? '▸' : '▾'}</button>
                      : outlined && <span className="gx-fold-gap" aria-hidden="true" />}
                    {a.name}
                    {a.is_heading && fold.has(a.id) && <span className="gx-folded muted small"> · {(ends.get(a.id) ?? i + 1) - i - 1}</span>}
                  </span>
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
