import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useFirm } from '../lib/firm'
import { loadBrand, type Brand } from '../lib/brand'
import { pdfPageImage } from '../lib/pdf/pdfjs'
import { defaultLayout } from '../lib/templates/defaults'
import { FORM_LABELS, fieldDef, fieldsFor, sampleValues } from '../lib/templates/fields'
import { renderForm, tableRows } from '../lib/templates/render'
import { loadLayouts, saveLayout } from '../lib/templates/store'
import {
  DEFAULT_CONTINUATION, PAGE_H, PAGE_W, newId,
  type ChoicesEl, type ColorRole, type El, type ElType, type FieldEl, type Layout, type TableEl, type TemplateKind,
} from '../lib/templates/types'

const KINDS: TemplateKind[] = ['general', 'submittal_cover', 'asi', 'rfi_response', 'pr', 'ccd', 'field_report']
const GRID = 6
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export default function Templates() {
  const { firm, isAdmin } = useFirm()
  const [kind, setKind] = useState<TemplateKind>('submittal_cover')
  const [layouts, setLayouts] = useState<Record<string, Layout> | null>(null)
  const [savedJson, setSavedJson] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [scale, setScale] = useState(1)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const history = useRef<{ key: TemplateKind; layout: Layout }[]>([])
  const stageRef = useRef<HTMLDivElement>(null)

  // Load layouts and brand assets.
  useEffect(() => {
    if (!firm) return
    loadLayouts(firm.id, KINDS).then((ls) => {
      setLayouts(ls)
      setSavedJson(Object.fromEntries(Object.entries(ls).map(([k, v]) => [k, JSON.stringify(v)])))
    }).catch((e) => setError(String(e.message ?? e)))
    loadBrand(firm).then(async (b) => {
      setBrand(b)
      if (b.logo) setLogoUrl(URL.createObjectURL(new Blob([b.logo.bytes as BlobPart], { type: b.logo.type === 'png' ? 'image/png' : 'image/jpeg' })))
      if (b.letterhead) setBgUrl(await pdfPageImage(b.letterhead).catch(() => null))
    })
  }, [firm])

  // Fit the page to the available width.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.45, Math.min(1.15, (e.contentRect.width - 8) / PAGE_W))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [layouts])

  const layout = layouts?.[kind]
  const sharedOn = kind !== 'general' && !!layout?.useLetterhead
  const values = useMemo(() => (brand ? sampleValues(kind, brand) : {}), [kind, brand])
  const dirty = (k: string) => layouts && JSON.stringify(layouts[k]) !== savedJson[k]

  /** Which layout an element lives in: this form, or the shared letterhead shown on it. */
  const layerOf = useCallback((id: string | null): TemplateKind | null => {
    if (!layouts || !id) return null
    if (layouts[kind].elements.some((e) => e.id === id)) return kind
    if (sharedOn && layouts.general.elements.some((e) => e.id === id)) return 'general'
    return null
  }, [layouts, kind, sharedOn])
  const selLayer = layerOf(selected)
  const sel = selLayer && layouts ? layouts[selLayer].elements.find((e) => e.id === selected) ?? null : null

  const update = useCallback((key: TemplateKind, fn: (l: Layout) => Layout, record = true) => {
    setLayouts((ls) => {
      if (!ls) return ls
      if (record) history.current.push({ key, layout: clone(ls[key]) })
      return { ...ls, [key]: fn(ls[key]) }
    })
  }, [])

  const commit = useCallback((next: Layout) => update(kind, () => next), [update, kind])

  const patchEl = useCallback((id: string, patch: Partial<El>, record = true) => {
    const key = layerOf(id)
    if (key) update(key, (l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)) }), record)
  }, [layerOf, update])

  const undo = useCallback(() => {
    const last = history.current.pop()
    if (last) setLayouts((ls) => (ls ? { ...ls, [last.key]: last.layout } : ls))
  }, [])

  const remove = useCallback(() => {
    if (!selLayer || !selected) return
    update(selLayer, (l) => ({ ...l, elements: l.elements.filter((e) => e.id !== selected) }))
    setSelected(null)
  }, [selLayer, selected, update])

  const duplicate = useCallback(() => {
    if (!selLayer || !sel) return
    const copy = { ...clone(sel), id: newId(), x: sel.x + 12, y: sel.y + 12 }
    update(selLayer, (l) => ({ ...l, elements: [...l.elements, copy] }))
    setSelected(copy.id)
  }, [selLayer, sel, update])

  const reorder = (dir: 1 | -1) => {
    if (!selLayer || !sel) return
    update(selLayer, (l) => {
      const els = l.elements.filter((e) => e.id !== sel.id)
      const i = l.elements.findIndex((e) => e.id === sel.id)
      els.splice(Math.max(0, Math.min(els.length, i + dir)), 0, sel)
      return { ...l, elements: els }
    })
  }

  /** Copy the shared letterhead into this form so its header can be arranged separately. */
  const detachLetterhead = () => {
    if (!layouts) return
    const copies = layouts.general.elements.map((e) => ({ ...clone(e), id: newId(), repeat: true }))
    update(kind, (l) => ({ ...l, useLetterhead: false, elements: [...copies, ...l.elements] }))
    setSelected(null)
  }

  // Keyboard: delete, nudge, undo, duplicate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      if (!sel || !isAdmin) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return }
      const step = e.shiftKey ? GRID : 1
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (d) { e.preventDefault(); patchEl(sel.id, { x: sel.x + d[0], y: sel.y + d[1] }) }
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, undo, duplicate, remove, patchEl, isAdmin])

  // Drag to move / resize. Works on this form's items and on the shared letterhead's.
  function startDrag(e: React.PointerEvent, el: El, mode: 'move' | 'resize') {
    const key = layerOf(el.id)
    if (!isAdmin || !layouts || !key) return
    e.stopPropagation()
    e.preventDefault()
    setSelected(el.id)
    const start = { x: e.clientX, y: e.clientY, el: { ...el } }
    let moved = false
    const before = clone(layouts[key])
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const snap = (v: number, ev: PointerEvent) => (ev.altKey ? Math.round(v * 2) / 2 : Math.round(v / GRID) * GRID)
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale
      const dy = (ev.clientY - start.y) / scale
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return
      if (!moved) { history.current.push({ key, layout: before }); moved = true }
      const patch = mode === 'move'
        ? { x: clamp(snap(start.el.x + dx, ev), -start.el.w + 12, PAGE_W - 12), y: clamp(snap(start.el.y + dy, ev), -start.el.h + 12, PAGE_H - 12) }
        : { w: Math.max(2, snap(start.el.w + dx, ev)), h: Math.max(2, snap(start.el.h + dy, ev)) }
      update(key, (l) => ({ ...l, elements: l.elements.map((x) => (x.id === el.id ? ({ ...x, ...patch } as El) : x)) }), false)
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  function add(type: ElType, fieldKey?: string) {
    if (!layout) return
    const base = { id: newId(), x: 60, y: 140 }
    const def = fieldKey ? fieldDef(kind, fieldKey) : undefined
    let el: El
    switch (type) {
      case 'text': el = { ...base, type, w: 220, h: 16, text: 'Text', size: 9, bold: false, align: 'left', color: 'ink' }; break
      case 'field': el = { ...base, type, w: 260, h: def?.multiline ? 60 : 14, field: fieldKey!, label: def ? def.label + ':' : '', labelMode: 'left', labelWidth: 80, labelAlign: 'right', size: 9, bold: false, align: 'left', color: 'ink' }; break
      case 'box': el = { ...base, type, w: 200, h: 80, stroke: 'ink', lineWidth: 0.75, fill: 'none' }; break
      case 'line': el = { ...base, type, w: 200, h: 2, stroke: 'muted', lineWidth: 0.6 }; break
      case 'logo': el = { ...base, type, w: 72, h: 72 }; break
      case 'checkbox': el = { ...base, type, w: 220, h: 14, label: 'Option', size: 9 }; break
      case 'choices': el = { ...base, type, w: 260, h: 80, field: fieldKey!, size: 9, direction: 'vertical', options: clone(def?.choices ?? [{ value: 'a', label: 'Option A' }]) }; break
      case 'table': el = { ...base, type, w: 360, h: 90, field: fieldKey!, size: 8, header: true, columns: [{ label: 'Name', width: 120 }, { label: 'Company', width: 100 }, { label: 'Email', width: 140 }] }; break
    }
    commit({ ...layout, elements: [...layout.elements, el] })
    setSelected(el.id)
  }

  async function preview() {
    if (!layouts || !brand) return
    try {
      const bytes = await renderForm({ layout: layouts[kind], letterhead: kind === 'general' ? null : layouts.general, brand, values: { ...values, 'doc.page': '' } })
      window.open(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), '_blank')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveAll() {
    if (!layouts || !firm) return
    setError(null)
    try {
      const changed = KINDS.filter((k) => dirty(k))
      for (const k of changed) await saveLayout(firm.id, k, layouts[k])
      setSavedJson(Object.fromEntries(Object.entries(layouts).map(([k, v]) => [k, JSON.stringify(v)])))
      setStatus(changed.length ? `Saved ${changed.map((k) => FORM_LABELS[k]).join(', ')}.` : 'Nothing to save.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e))
    }
  }

  if (!layouts || !layout || !brand) return <section><h1>Form templates</h1><p className="muted">Loading…</p></section>

  const fields = fieldsFor(kind)
  const choiceFields = fields.filter((f) => f.choices)
  const listFields = fields.filter((f) => f.multiline)
  const anyDirty = KINDS.some((k) => dirty(k))
  const hasFlow = layout.elements.some((e) => e.type === 'field' && e.flow)

  return (
    <section className="templates">
      <div className="page-head">
        <div>
          <h1>Form templates</h1>
          <p className="lead">Lay out each form once. Fields fill in from the project and the form when it’s issued.</p>
        </div>
        <div className="actions tight">
          <button onClick={preview}>Preview PDF</button>
          {isAdmin && <button className="primary" onClick={saveAll} disabled={!anyDirty}>Save{anyDirty ? ' changes' : 'd'}</button>}
        </div>
      </div>
      {!isAdmin && <div className="notice">Only firm admins can change templates.</div>}
      {status && <div className="notice">{status}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="tabs" role="tablist">
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''} onClick={() => { setKind(k); setSelected(null); setStatus(null) }}>
            {FORM_LABELS[k]}{dirty(k) ? ' •' : ''}
          </button>
        ))}
      </div>

      <div className="editor">
        {isAdmin && (
          <aside className="palette">
            <div className="palette-title">Add</div>
            <button onClick={() => add('text')}>Text</button>
            <FieldPicker label="Field" fields={fields.filter((f) => !f.choices)} onPick={(k) => add('field', k)} />
            {choiceFields.length > 0 && <FieldPicker label="Choices" fields={choiceFields} onPick={(k) => add('choices', k)} />}
            {listFields.length > 0 && <FieldPicker label="Table" fields={listFields} onPick={(k) => add('table', k)} />}
            <button onClick={() => add('box')}>Box</button>
            <button onClick={() => add('line')}>Line</button>
            <button onClick={() => add('logo')}>Logo</button>
            <button onClick={() => add('checkbox')}>Checkbox</button>
            <div className="palette-title">Edit</div>
            <button onClick={undo} disabled={!history.current.length}>Undo</button>
            <button onClick={duplicate} disabled={!sel}>Duplicate</button>
            <button onClick={() => reorder(1)} disabled={!sel}>Bring forward</button>
            <button onClick={() => reorder(-1)} disabled={!sel}>Send back</button>
            <button onClick={remove} disabled={!sel} className="danger">Delete</button>
            <p className="hint">Drag to move · corner to resize · arrows nudge (Shift = grid) · Alt = no snap</p>
          </aside>
        )}

        <div className="stage" ref={stageRef} onPointerDown={() => setSelected(null)}>
          <div
            className={`page ${showGrid ? 'grid' : ''}`}
            style={{ width: PAGE_W * scale, height: PAGE_H * scale, '--minor': `${GRID * scale}px`, '--major': `${36 * scale}px` } as CSSProperties}
          >
            {bgUrl && (kind === 'general' || layout.useLetterhead) && <img className="page-bg" src={bgUrl} alt="" />}
            {sharedOn && layouts.general.elements.map((el) => (
              <div
                key={el.id}
                className={`el shared ${el.id === selected ? 'selected' : ''} ${isAdmin ? 'editable' : ''}`}
                style={box(el, scale)}
                title="Shared letterhead item"
                onPointerDown={(e) => startDrag(e, el, 'move')}
              >
                <ElView el={el} values={values} logoUrl={logoUrl} scale={scale} accent={brand.accent} />
                {el.id === selected && isAdmin && <span className="handle" onPointerDown={(e) => startDrag(e, el, 'resize')} />}
              </div>
            ))}
            {hasFlow && (
              <div className="continuation-mark" style={{ top: (layout.continuation ?? DEFAULT_CONTINUATION).bottom * scale }} title="Text continues on further pages from here" />
            )}
            {layout.elements.map((el) => (
              <div
                key={el.id}
                className={`el ${el.id === selected ? 'selected' : ''} ${isAdmin ? 'editable' : ''}`}
                style={box(el, scale)}
                onPointerDown={(e) => startDrag(e, el, 'move')}
              >
                <ElView el={el} values={values} logoUrl={logoUrl} scale={scale} accent={brand.accent} />
                {el.id === selected && isAdmin && <span className="handle" onPointerDown={(e) => startDrag(e, el, 'resize')} />}
              </div>
            ))}
          </div>
        </div>

        <aside className="props">
          {sel ? (
            <>
              {selLayer === 'general' && kind !== 'general' && (
                <div className="shared-note">
                  Shared letterhead item. Moving or editing it changes every form that uses the letterhead.
                  {isAdmin && <button className="link" onClick={detachLetterhead}>Give this form its own header instead</button>}
                </div>
              )}
              <Props el={sel} kind={selLayer ?? kind} disabled={!isAdmin} onChange={(p) => patchEl(sel.id, p)} />
            </>
          ) : (
            <div className="props-body">
              <div className="palette-title">{FORM_LABELS[kind]}</div>
              {kind !== 'general' ? (
                <>
                  <label className="check">
                    <input type="checkbox" checked={layout.useLetterhead} disabled={!isAdmin} onChange={(e) => commit({ ...layout, useLetterhead: e.target.checked })} />
                    Use the shared letterhead
                  </label>
                  {layout.useLetterhead && isAdmin && (
                    <p className="hint">Letterhead items (logo, address, rules) can be moved right here; changes apply to every form that uses the letterhead. <button className="link" onClick={detachLetterhead}>Give this form its own header</button> to arrange it separately.</p>
                  )}
                </>
              ) : (
                <p className="hint">The letterhead appears behind every form that uses it, on every page. {bgUrl ? 'Your uploaded letterhead PDF is shown behind it; remove built-in items that overlap it.' : 'Upload a letterhead PDF in Settings to use your designed letterhead instead.'}</p>
              )}
              {hasFlow && (
                <>
                  <p className="hint">Long text continues onto more pages. On those pages it sits between:</p>
                  <div className="two">
                    <Num label="Top" value={(layout.continuation ?? DEFAULT_CONTINUATION).top} disabled={!isAdmin} onChange={(v) => commit({ ...layout, continuation: { ...(layout.continuation ?? DEFAULT_CONTINUATION), top: v } })} />
                    <Num label="Bottom" value={(layout.continuation ?? DEFAULT_CONTINUATION).bottom} disabled={!isAdmin} onChange={(v) => commit({ ...layout, continuation: { ...(layout.continuation ?? DEFAULT_CONTINUATION), bottom: v } })} />
                  </div>
                </>
              )}
              <label className="check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Show grid</label>
              {isAdmin && <button className="link" onClick={() => { commit(defaultLayout(kind)); setSelected(null) }}>Reset this form to the default layout</button>}
              <p className="hint">Click an item to edit it. Sample values are shown so you can judge spacing; they’re replaced by real project data when a form is issued.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function box(el: El, s: number): CSSProperties {
  return { left: el.x * s, top: el.y * s, width: el.w * s, height: el.h * s }
}

const COLOR: Record<ColorRole, string> = { ink: '#222425', muted: '#66696f', accent: 'var(--accent)' }

/** Approximate on-screen rendering of an element; the PDF preview is exact. */
function ElView({ el, values, logoUrl, scale, accent }: { el: El; values: Record<string, string>; logoUrl: string | null; scale: number; accent: string }) {
  const style = (size: number, bold = false, serif = false): CSSProperties => ({
    fontSize: size * scale, fontWeight: bold ? 700 : 400, lineHeight: 1.3,
    fontFamily: serif ? '"Times New Roman", Times, serif' : 'Helvetica, Arial, sans-serif',
  })
  const wrap: CSSProperties = { ['--accent' as string]: accent }
  switch (el.type) {
    case 'text':
      return <div className="el-text" style={{ ...wrap, ...style(el.size, el.bold, el.serif), color: COLOR[el.color], textAlign: el.align, textTransform: el.caps ? 'uppercase' : 'none' }}>{el.text}</div>
    case 'field': {
      const v = values[el.field] ?? ''
      const label = el.labelMode !== 'none' && el.label
      return (
        <div className={`el-field ${el.labelMode}`} style={{ ...wrap, ...style(el.size, false, el.serif) }}>
          {label && <span className="el-label" style={{ width: el.labelMode === 'left' ? el.labelWidth * scale : undefined, textAlign: el.labelMode === 'left' ? el.labelAlign : 'left', color: COLOR.muted }}>{el.label}</span>}
          <span className="el-value" style={{ fontWeight: el.bold ? 700 : 400, color: COLOR[el.color], textAlign: el.align }}>
            {el.rich ? <RichPreview text={v} scale={scale} size={el.size} /> : v || <em className="placeholder">{fieldLabel(el.field)}</em>}
          </span>
        </div>
      )
    }
    case 'box':
      return <div style={{ ...wrap, width: '100%', height: '100%', boxSizing: 'border-box', border: el.stroke === 'none' ? 'none' : `${Math.max(1, el.lineWidth * scale)}px solid ${COLOR[el.stroke]}`, background: el.fill === 'wash' ? '#f2f0eb' : el.fill === 'tint' ? `color-mix(in srgb, ${accent} 12%, white)` : 'transparent' }} />
    case 'line': {
      const t = Math.max(1, el.lineWidth * scale)
      return el.w >= el.h
        ? <div style={{ ...wrap, position: 'absolute', left: 0, right: 0, top: '50%', height: t, marginTop: -t / 2, background: COLOR[el.stroke] }} />
        : <div style={{ ...wrap, position: 'absolute', top: 0, bottom: 0, left: '50%', width: t, marginLeft: -t / 2, background: COLOR[el.stroke] }} />
    }
    case 'logo':
      return logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <div className="el-logo-ph">Logo</div>
    case 'checkbox':
      return <div className="el-choice" style={style(el.size)}><span className="sq" style={{ width: el.size * scale, height: el.size * scale }} />{el.label}</div>
    case 'choices':
      return <ChoicesPreview el={el} chosen={values[el.field]} scale={scale} accent={accent} />
    case 'table':
      return <TablePreview el={el} value={values[el.field] ?? ''} scale={scale} />
  }
}

function fieldLabel(key: string) {
  return '{' + key.split('.').pop() + '}'
}

function RichPreview({ text, scale, size }: { text: string; scale: number; size: number }) {
  return (
    <>
      {text.split('\n').map((raw, i) => {
        const spaces = raw.match(/^ */)![0].length
        let body = raw.trim()
        const heading = body.startsWith('# ')
        if (heading) body = body.slice(2)
        return <div key={i} style={{ paddingLeft: Math.floor(spaces / 2) * size * 1.9 * scale, fontWeight: heading ? 700 : undefined, marginTop: heading && i ? size * 0.6 * scale : 0, minHeight: size * 1.3 * scale }}>{body}</div>
      })}
    </>
  )
}

function ChoicesPreview({ el, chosen, scale, accent }: { el: ChoicesEl; chosen?: string; scale: number; accent: string }) {
  const s = el.size * scale
  return (
    <div className={`el-choices ${el.direction}`} style={{ fontSize: s, fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.3 }}>
      {el.options.map((o) => (
        <div key={o.value} className="el-choice-row" style={{ marginBottom: el.direction === 'vertical' ? s * 0.5 : 0 }}>
          <div className="el-choice"><span className="sq" style={{ width: s, height: s, background: o.value === chosen ? `radial-gradient(${accent} 0 0) center/60% 60% no-repeat` : undefined }} /><span style={{ fontWeight: o.value === chosen ? 700 : 400 }}>{o.label}</span></div>
          {o.note && <div className="el-note" style={{ fontSize: s * 0.85, paddingLeft: s * 2.2 }}>{o.note}</div>}
        </div>
      ))}
    </div>
  )
}

function TablePreview({ el, value, scale }: { el: TableEl; value: string; scale: number }) {
  const s = el.size * scale
  const rows = tableRows(value)
  const cols = `${el.columns.map((c) => c.width * scale + 'px').join(' ')}`
  return (
    <div className="el-table" style={{ fontSize: s, gridTemplateColumns: cols, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {el.header && el.columns.map((c, i) => <b key={'h' + i}>{c.label}</b>)}
      {rows.flatMap((r, ri) => el.columns.map((_, ci) => <span key={ri + '-' + ci}>{r[ci] ?? ''}</span>))}
    </div>
  )
}

function FieldPicker({ label, fields, onPick }: { label: string; fields: { key: string; label: string }[]; onPick: (key: string) => void }) {
  return (
    <select className="picker" value="" onChange={(e) => { if (e.target.value) onPick(e.target.value) }} aria-label={`Add ${label}`}>
      <option value="">{label}…</option>
      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
    </select>
  )
}

function Num({ label, value, onChange, disabled, step = 1 }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; step?: number }) {
  return (
    <label className="num">{label}
      <input type="number" step={step} value={Math.round(value * 10) / 10} disabled={disabled} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }} />
    </label>
  )
}

function Seg<T extends string>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={v} type="button" disabled={disabled} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}

const COLORS: [ColorRole, string][] = [['ink', 'Ink'], ['muted', 'Grey'], ['accent', 'Accent']]

/** Properties for the selected element. */
function Props({ el, kind, onChange, disabled }: { el: El; kind: TemplateKind; onChange: (p: Partial<El>) => void; disabled: boolean }) {
  const set = onChange as (p: Record<string, unknown>) => void
  const fields = fieldsFor(kind)
  const title = { text: 'Text', field: 'Field', box: 'Box', line: 'Line', logo: 'Logo', checkbox: 'Checkbox', choices: 'Choices', table: 'Table' }[el.type]

  return (
    <fieldset className="props-body" disabled={disabled}>
      <div className="palette-title">{title}</div>
      <div className="grid4">
        <Num label="X" value={el.x} onChange={(v) => set({ x: v })} />
        <Num label="Y" value={el.y} onChange={(v) => set({ y: v })} />
        <Num label="W" value={el.w} onChange={(v) => set({ w: Math.max(2, v) })} />
        <Num label="H" value={el.h} onChange={(v) => set({ h: Math.max(2, v) })} />
      </div>

      {el.type === 'text' && (
        <>
          <label className="stack">Text<textarea rows={3} value={el.text} onChange={(e) => set({ text: e.target.value })} /></label>
          <TypeControls el={el} set={set} />
          <label className="check"><input type="checkbox" checked={!!el.caps} onChange={(e) => set({ caps: e.target.checked })} /> All caps</label>
        </>
      )}

      {el.type === 'field' && (
        <>
          <label className="stack">Shows
            <select value={el.field} onChange={(e) => set({ field: e.target.value })}>
              {fields.filter((f) => !f.choices).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="stack">Label<input value={el.label} onChange={(e) => set({ label: e.target.value })} /></label>
          <Seg value={el.labelMode} onChange={(v) => set({ labelMode: v })} options={[['left', 'Label left'], ['above', 'Above'], ['none', 'No label']]} />
          {el.labelMode === 'left' && (
            <div className="two">
              <Num label="Label width" value={el.labelWidth} onChange={(v) => set({ labelWidth: v })} />
              <label className="num">Label align
                <select value={el.labelAlign} onChange={(e) => set({ labelAlign: e.target.value })}>
                  <option value="left">Left</option><option value="right">Right</option>
                </select>
              </label>
            </div>
          )}
          <TypeControls el={el} set={set} />
          <label className="check"><input type="checkbox" checked={!!el.rich} onChange={(e) => set({ rich: e.target.checked })} /> Outline lists (numbering, indents, # headings)</label>
          <label className="check"><input type="checkbox" checked={!!el.flow} onChange={(e) => set({ flow: e.target.checked })} /> Continue onto more pages if long</label>
        </>
      )}

      {(el.type === 'box' || el.type === 'line') && (
        <>
          <div className="stack-label">Line colour</div>
          <Seg value={(el.stroke === 'none' ? 'none' : el.stroke) as ColorRole | 'none'} onChange={(v) => set({ stroke: v })}
            options={el.type === 'box' ? [...COLORS, ['none', 'None'] as ['none', string]] : COLORS} />
          <Num label="Line weight (pt)" step={0.25} value={el.lineWidth} onChange={(v) => set({ lineWidth: Math.max(0, v) })} />
          {el.type === 'box' && (
            <>
              <div className="stack-label">Fill</div>
              <Seg value={el.fill} onChange={(v) => set({ fill: v })} options={[['none', 'None'], ['wash', 'Light grey'], ['tint', 'Accent tint']]} />
            </>
          )}
          {el.type === 'line' && <p className="hint">Wider than tall draws horizontal; taller than wide draws vertical.</p>}
        </>
      )}

      {el.type === 'logo' && <p className="hint">Shows the logo from Settings, fitted inside this box.</p>}

      {el.type === 'checkbox' && (
        <>
          <label className="stack">Label<input value={el.label} onChange={(e) => set({ label: e.target.value })} /></label>
          <Num label="Size (pt)" step={0.5} value={el.size} onChange={(v) => set({ size: v })} />
        </>
      )}

      {el.type === 'choices' && (
        <>
          <p className="hint">The option chosen when issuing the form is marked.</p>
          <Seg value={el.direction} onChange={(v) => set({ direction: v })} options={[['vertical', 'Stacked'], ['horizontal', 'In a row']]} />
          <Num label="Size (pt)" step={0.5} value={el.size} onChange={(v) => set({ size: v })} />
          {el.options.map((o, i) => (
            <div key={i} className="option-edit">
              <input value={o.label} onChange={(e) => set({ options: el.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <textarea rows={2} placeholder="Note under this option (optional)" value={o.note ?? ''} onChange={(e) => set({ options: el.options.map((x, j) => (j === i ? { ...x, note: e.target.value || undefined } : x)) })} />
              <button type="button" className="link" onClick={() => set({ options: el.options.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <AddOption el={el} kind={kind} onAdd={(o) => set({ options: [...el.options, o] })} />
        </>
      )}

      {el.type === 'table' && (
        <>
          <label className="stack">Rows from
            <select value={el.field} onChange={(e) => set({ field: e.target.value })}>
              {fields.filter((f) => f.multiline).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <Num label="Size (pt)" step={0.5} value={el.size} onChange={(v) => set({ size: v })} />
          <label className="check"><input type="checkbox" checked={el.header} onChange={(e) => set({ header: e.target.checked })} /> Header row</label>
          {el.columns.map((c, i) => (
            <div key={i} className="two">
              <input value={c.label} onChange={(e) => set({ columns: el.columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Num label="Width" value={c.width} onChange={(v) => set({ columns: el.columns.map((x, j) => (j === i ? { ...x, width: v } : x)) })} />
            </div>
          ))}
          <div className="file-row">
            <button type="button" onClick={() => set({ columns: [...el.columns, { label: 'Column', width: 80 }] })}>Add column</button>
            {el.columns.length > 1 && <button type="button" className="link" onClick={() => set({ columns: el.columns.slice(0, -1) })}>Remove last</button>}
          </div>
        </>
      )}

      <label className="check"><input type="checkbox" checked={!!el.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> Repeat on every page</label>
    </fieldset>
  )
}

function TypeControls({ el, set }: { el: { size: number; bold: boolean; align: string; color: ColorRole; serif?: boolean }; set: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div className="two">
        <Num label="Size (pt)" step={0.5} value={el.size} onChange={(v) => set({ size: Math.max(4, v) })} />
        <label className="num">Font
          <select value={el.serif ? 'serif' : 'sans'} onChange={(e) => set({ serif: e.target.value === 'serif' })}>
            <option value="sans">Sans</option><option value="serif">Serif</option>
          </select>
        </label>
      </div>
      <Seg value={el.align as 'left'} onChange={(v) => set({ align: v })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} />
      <Seg value={el.color} onChange={(v) => set({ color: v })} options={COLORS} />
      <label className="check"><input type="checkbox" checked={el.bold} onChange={(e) => set({ bold: e.target.checked })} /> Bold</label>
    </>
  )
}

function AddOption({ el, kind, onAdd }: { el: ChoicesEl; kind: TemplateKind; onAdd: (o: { value: string; label: string }) => void }) {
  const unused = (fieldDef(kind, el.field)?.choices ?? []).filter((c) => !el.options.some((o) => o.value === c.value))
  if (!unused.length) return null
  return (
    <select className="picker" value="" onChange={(e) => { const c = unused.find((u) => u.value === e.target.value); if (c) onAdd({ ...c }) }}>
      <option value="">Add option…</option>
      {unused.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
    </select>
  )
}

export type { FieldEl }
