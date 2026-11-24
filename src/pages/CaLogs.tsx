import { PageTitle } from '../components/PageTitle'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePref } from '../lib/prefs'
import IssueForm from './IssueForm'
import { FORM_LABELS, usDate } from '../lib/templates/fields'
import { CHANGE_KINDS, coverWith, fileMissingChangeDocuments, listRegister, missingChangeDocuments, decisionLabel, decisionOf, setDecision, prPrice, prStanding, changeCost, changeDays, changeTotals, costIsOwn, daysAreOwn, setIssuedDetails, setPrResponse, startChangeOrder, attachIssuedFile, uncover, withChange, type MissingChangeDocument, type PrDecision, type RegisterRow } from '../lib/issued'
import { money as asMoney, NOTHING } from '../lib/money'
import { money as readMoney } from '../lib/sovPaste'
import { MoneyInput } from '../components/MoneyInput'
import { openFile, type ProjectStore } from '../lib/files'
import { listIssuanceSections, listIssuanceSheets } from '../lib/sheets'
import { assembleChangeDocument, bundleName, saveBundle } from '../lib/pdf/bundle'
import { effectiveOrder } from '../lib/disciplines'
import { useFirm } from '../lib/firm'
import type { BundleSheet } from '../lib/pdf/bundle'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import type { FormKind } from '../lib/templates/types'

/**
 * Change documents: every clarification and change issued on a project, and where new ones are
 * written.
 *
 * ASIs, RFI responses, proposal requests, CCDs and change orders are one story told in five
 * documents, and the question months later is always which led to which. A change order carries
 * several proposal requests — the PRs are where the money was priced, the CO is where it was
 * signed — so the register joins them up rather than leaving a number typed in a field as the
 * only thread between them.
 *
 * Field reports and meeting notes used to be written from here, for want of anywhere better.
 * They record the job rather than change it, so they have their own place now — Field notes.
 */

const ALL_KINDS: FormKind[] = [...CHANGE_KINDS]

type SortBy = 'date' | 'type' | 'number'

/** The register's columns that can be dragged into another order. The row's links stay last. */
type RegCol = 'number' | 'type' | 'status' | 'subject' | 'issued' | 'cost' | 'time'
const REG_COLS: RegCol[] = ['number', 'type', 'status', 'subject', 'issued', 'cost', 'time']
const REG_HEAD: Record<RegCol, { label: string; className?: string }> = {
  number: { label: 'Number' }, type: { label: 'Type' }, status: { label: 'Status', className: 'col-status' },
  subject: { label: 'Subject', className: 'col-title' }, issued: { label: 'Issued', className: 'col-date' },
  cost: { label: 'Cost', className: 'right col-chg' }, time: { label: 'Time', className: 'right col-chg' },
}
const REG_ORDER_KEY = 'cazen.pref.changeRegisterColumns'
/** A stored order, made whole: every column once, unknown ones dropped, missing ones added where the default has them. */
function cleanCols(stored: unknown): RegCol[] {
  const seen = (Array.isArray(stored) ? stored : []).filter((c): c is RegCol => REG_COLS.includes(c as RegCol))
  const out = [...new Set(seen)]
  for (const c of REG_COLS) if (!out.includes(c)) out.splice(Math.min(REG_COLS.indexOf(c), out.length), 0, c)
  return out
}

/**
 * Column headings that can be dragged into another order, by mouse, pen or finger. A heading is
 * picked up once it has moved a few pixels; it is dropped before or after the heading it is over.
 */
function RegHead({ cols, onOrder }: { cols: RegCol[]; onOrder: (c: RegCol[]) => void }) {
  const [drag, setDrag] = useState<{ col: RegCol; x0: number; on: boolean; target: RegCol | null; after: boolean } | null>(null)
  const targetAt = (x: number, y: number) => {
    const th = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('th[data-col]') as HTMLElement | null
    if (!th) return null
    const r = th.getBoundingClientRect()
    return { col: th.dataset.col as RegCol, after: x > r.left + r.width / 2 }
  }
  return (
    <tr className={drag?.on ? 'reg-head dragging' : 'reg-head'}>
      {cols.map((c) => (
        <th key={c} data-col={c} title="Drag to move this column"
          className={[REG_HEAD[c].className, 'reg-drag', drag?.on && drag.col === c ? 'reg-drag-from' : '',
            drag?.on && drag.target === c && drag.col !== c ? (drag.after ? 'reg-drop-after' : 'reg-drop-before') : ''].filter(Boolean).join(' ')}
          onPointerDown={(e) => { if (e.button !== 0) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ col: c, x0: e.clientX, on: false, target: null, after: false }) }}
          onPointerMove={(e) => {
            if (!drag) return
            const on = drag.on || Math.abs(e.clientX - drag.x0) > 6
            const t = on ? targetAt(e.clientX, e.clientY) : null
            setDrag({ ...drag, on, target: t?.col ?? drag.target, after: t ? t.after : drag.after })
          }}
          onPointerUp={() => {
            if (drag?.on && drag.target && drag.target !== drag.col) {
              const rest = cols.filter((x) => x !== drag.col)
              const at = rest.indexOf(drag.target) + (drag.after ? 1 : 0)
              onOrder([...rest.slice(0, at), drag.col, ...rest.slice(at)])
            }
            setDrag(null)
          }}
          onPointerCancel={() => setDrag(null)}>
          {REG_HEAD[c].label}
        </th>
      ))}
      <th>{cols.join() !== REG_COLS.join() && <button className="link small reg-cols-reset" onClick={() => onOrder(REG_COLS)} title="Put the columns back in their usual order">Reset columns</button>}</th>
    </tr>
  )
}

/** A totals row: the label across the first run of ordinary columns, the figures under Cost and Time. */
function TotalRow({ cols, className, label, cost, days }: { cols: RegCol[]; className: string; label: string; cost: React.ReactNode; days: React.ReactNode }) {
  const cells: React.ReactNode[] = []
  let run = 0, labelled = false
  const flush = (key: string) => {
    if (!run) return
    cells.push(<td key={key} colSpan={run}>{labelled ? null : label}</td>)
    labelled = true; run = 0
  }
  cols.forEach((c, n) => {
    if (c === 'cost' || c === 'time') { flush(`r${n}`); cells.push(<td key={c} className="right nowrap">{c === 'cost' ? cost : days}</td>) }
    else run++
  })
  flush('end')
  if (!labelled) cells.unshift(<td key="label">{label}</td>)
  return <tr className={className}>{cells}<td /></tr>
}

export default function CaLogs() {
  const { current } = useProject()
  const [writing, setWriting] = useState<FormKind | null>(null)
  const [rows, setRows] = useState<RegisterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortBy>('date')
  const [only, setOnly] = useState<'changes' | FormKind>('changes')
  const [attaching, setAttaching] = useState<string | null>(null)
  // Uploads that were issued as change documents before CAzen filed them here.
  const [missing, setMissing] = useState<MissingChangeDocument[]>([])
  const [filing, setFiling] = useState(false)

  // Keyed on the project's id rather than the project, so a context that hands back a new object
  // each render can't turn this into a loop.
  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) return
    const want = only === 'changes' ? CHANGE_KINDS : [only as FormKind]
    listRegister(projectId, want).then(setRows).catch((e) => setError(message(e)))
  }, [projectId, only])
  useEffect(() => { load() }, [load])

  const lookForMissing = useCallback(() => {
    if (!projectId) { setMissing([]); return }
    missingChangeDocuments(projectId).then(setMissing).catch(() => setMissing([]))
  }, [projectId])
  useEffect(() => { lookForMissing() }, [lookForMissing])

  async function fileMissing() {
    if (!projectId || filing) return
    setFiling(true)
    setError(null)
    try {
      await fileMissingChangeDocuments(projectId)
      lookForMissing()
      load()
    } catch (e) {
      setError(message(e))
    } finally {
      setFiling(false)
    }
  }

  const listed = useMemo(() => {
    const r = [...(rows ?? [])]
    if (sort === 'date') r.sort((a, b) => b.issued_at.localeCompare(a.issued_at))
    if (sort === 'number') r.sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true }))
    if (sort === 'type') {
      r.sort((a, b) =>
        ALL_KINDS.indexOf(a.kind) - ALL_KINDS.indexOf(b.kind) ||
        (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true }))
    }
    // A change order heads the proposal requests that are in it: they follow it, and leave their own place.
    const byId = new Map(r.map((x) => [x.id, x]))
    const out: RegisterRow[] = []
    for (const x of r) {
      if (x.kind === 'pr' && x.rolledInto && byId.has(x.rolledInto.id)) continue
      out.push(x)
      if (x.kind === 'change_order') for (const c of x.covers ?? []) { const full = byId.get(c.id); if (full) out.push(full) }
    }
    return out
  }, [rows, sort])

  // Proposal requests no change order has taken up yet, for the attach picker.
  const loose = useMemo(() => (rows ?? []).filter((r) => r.kind === 'pr' && !r.rolledInto), [rows])
  const orders = useMemo(() => (rows ?? []).filter((r) => r.kind === 'change_order')
    .sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true })), [rows])
  const [storedCols, setStoredCols] = usePref<unknown>(REG_ORDER_KEY, REG_COLS)
  const cols = cleanCols(storedCols)
  const standing = useMemo(() => prStanding(rows ?? []), [rows])
  // Over everything on the project, not only what the filter is showing.
  const totals = useMemo(() => changeTotals(rows ?? []), [rows])
  /** A price or a decision changed on screen first, then kept; the list is not fetched again for it. */
  const patchRow = useCallback((id: string, values: Record<string, string>) => {
    setRows((all) => (all ?? []).map((r) => (r.id === id ? { ...r, values }
      : r.covers?.some((c) => c.id === id) ? { ...r, covers: r.covers.map((c) => (c.id === id ? { ...c, values } : c)) } : r)))
  }, [])

  if (writing) {
    return (
      <section>
        <div className="page-head">
          <div>
            <PageTitle>New {FORM_LABELS[writing]}</PageTitle>
            <p className="lead">On your firm’s template. It fills itself in, numbers itself and is kept with the project.</p>
          </div>
          <button onClick={() => { setWriting(null); load() }}>Back to the register</button>
        </div>
        <IssueForm key={writing} kind={writing} />
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>Change documents</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            Every clarification and change issued on this project, and where the next one is written.
          </p>
        </div>
      </div>

      <div className="card new-doc">
        <span className="small">Write a new</span>
        <div className="new-doc-kinds">
          {ALL_KINDS.map((k) => (
            <button key={k} className="chip" onClick={() => setWriting(k)}>{FORM_LABELS[k]}</button>
          ))}
        </div>
      </div>

      <div className="set-actions">
        <label className="inline-field">Show
          <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="changes">Changes and clarifications</option>
            {ALL_KINDS.map((k) => <option key={k} value={k}>{FORM_LABELS[k]} only</option>)}
          </select>
        </label>
        <label className="inline-field">Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
            <option value="date">Date issued</option>
            <option value="type">Type</option>
            <option value="number">Number</option>
          </select>
        </label>
      </div>

      {/* Uploads that were issued as change documents but never filed as one. */}
      {missing.length > 0 && (
        <div className="notice warn field-sync">
          <span>
            <strong>{missing.length} {missing.length === 1 ? 'upload was' : 'uploads were'} issued as {missing.length === 1 ? 'a change document' : 'change documents'} but {missing.length === 1 ? 'is' : 'are'} not in this register</strong>
            {' — '}{missing.slice(0, 6).map((m) => m.name).join(', ')}{missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.
            {' '}They went in before CAzen filed them here. Filing them keeps the sheets attached to each one.
          </span>
          <button className="primary-lite" onClick={() => void fileMissing()} disabled={filing}>
            {filing ? 'Filing…' : `File ${missing.length === 1 ? 'it' : 'them'}`}
          </button>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      {standing.count > 0 && (
        <div className="pr-standing" aria-label="Where the proposal requests stand">
          <span><strong>{standing.unpriced}</strong> awaiting a price</span>
          <span><strong>{asMoney(standing.deciding)}</strong> priced, awaiting a decision</span>
          <span className={standing.approvedLoose ? 'due' : ''}><strong>{asMoney(standing.approvedLoose)}</strong> approved, not yet in a change order</span>
          <span><strong>{asMoney(standing.inOrders)}</strong> in change orders</span>
        </div>
      )}
      {!rows ? <p className="muted">Loading…</p>
        : !listed.length ? <div className="card muted">Nothing issued yet.</div> : (
        <table className="register">
          <thead>
            <RegHead cols={cols} onOrder={setStoredCols} />
            <TotalRow cols={cols} className="reg-total" label={`Change orders to date${totals.orders.count ? ` (${totals.orders.count})` : ''}`}
              cost={totals.orders.count ? asMoney(totals.orders.cost) : NOTHING} days={totals.orders.count ? daysText(totals.orders.days) : NOTHING} />
            {totals.loose.count > 0 && (
              <TotalRow cols={cols} className="reg-total reg-total-loose" label={`Proposal requests not yet in a change order (${totals.loose.count})`}
                cost={asMoney(totals.loose.cost)} days={daysText(totals.loose.days)} />
            )}
          </thead>
          <tbody>
            {listed.map((r) => (
              <Row key={r.id} cols={cols} row={r} project={current} loose={loose} orders={orders} onValues={patchRow}
                inOrder={!!r.rolledInto && r.kind === 'pr'}
                onNewOrder={async () => {
                  if (!current) return
                  try { await startChangeOrder(current.id, [r.id], orders[orders.length - 1]?.number ?? null); load() } catch (e) { setError(message(e)) }
                }}
                attaching={attaching === r.id}
                onAttach={() => setAttaching(attaching === r.id ? null : r.id)}
                onChanged={load} onError={setError} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** Days as the contract counts them: signed, so a credit of time reads as one. */
const daysText = (n: number) => (n === 0 ? NOTHING : `${n > 0 ? '+' : '−'}${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`)

/**
 * The change document as one PDF to hand on: cover sheet, then the project manual sections it
 * replaced, then the drawing sheets it revised.
 */
function DownloadChange({ row, project, onError }: { row: RegisterRow; project: ProjectStore & { number?: string | null; name?: string | null; discipline_order?: unknown }; onError: (m: string) => void }) {
  const { firm } = useFirm()
  const [busy, setBusy] = useState<string | null>(null)
  async function go(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy('gathering')
    try {
      const [sections, sheets] = row.issuance_id
        ? await Promise.all([listIssuanceSections(row.issuance_id), listIssuanceSheets(row.issuance_id)])
        : [[], []]
      const order = effectiveOrder(firm?.discipline_order, (project as { discipline_order?: never }).discipline_order)
      const b = await assembleChangeDocument(project, { cover: row.file_path ?? null, sections, sheets }, order, setBusy)
      if (!b.cover && !b.sections && !b.sheets) { onError(`Nothing could be read for ${row.number ?? 'this document'}.`); return }
      const label = [row.number ?? FORM_LABELS[row.kind], row.title].filter(Boolean).join(' ')
      saveBundle(b.bytes, bundleName(project, label, row.issued_at?.slice(0, 10)))
      if (b.missing.length) onError(`${row.number ?? 'The document'} was downloaded without ${b.missing.join(', ')}, which could not be read.`)
    } catch (err) { onError(message(err)) } finally { setBusy(null) }
  }
  return (
    <button className="link" onClick={go} disabled={!!busy} title="The cover sheet, the project manual sections and the drawing sheets, in one PDF">
      {busy ? `Building… ${busy}` : 'Download'}
    </button>
  )
}

function Row({ cols, row, project, loose, orders, inOrder, onNewOrder, onValues, attaching, onAttach, onChanged, onError }: {
  /** The project's change orders, for an approved proposal request to go in. */
  orders: RegisterRow[]
  /** The columns, in the order this person has put them. */
  cols: RegCol[]
  /** Start a new change order with this proposal request in it. */
  onNewOrder: () => void
  /** A proposal request listed under the change order it is in. */
  inOrder: boolean
  onValues: (id: string, values: Record<string, string>) => void
  row: RegisterRow
  project: { id: string; name: string } | null
  loose: RegisterRow[]
  attaching: boolean
  onAttach: () => void
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [showing, setShowing] = useState(false)
  /** The status menu of a proposal request, where it was opened. */
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number } | null>(null)
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const decision = decisionOf(row)
  const [costTyped, setCostTyped] = useState<string | null>(null)
  async function saveCost() {
    if (costTyped === null) return
    const n = costTyped.trim() ? readMoney(costTyped) : null
    setCostTyped(null)
    if (costTyped.trim() && n == null) { onError('That cost is not a figure.'); return }
    if (n === prPrice(row)) return
    try { onValues(row.id, await setPrResponse(row, { price: n })); onChanged() } catch (e) { onError(message(e)) }
  }
  const [uploading, setUploading] = useState(false)
  async function uploadOrder(f: File) {
    if (!project) return
    setUploading(true)
    try { await attachIssuedFile(project, row, new Uint8Array(await f.arrayBuffer())); onChanged() } catch (e) { onError(message(e)) } finally { setUploading(false) }
  }
  async function setStatus(d: PrDecision) {
    // Approving a proposal request leaves the menu open on its change orders, to put it in one.
    if (!(row.kind === 'pr' && d === 'approved')) setStatusMenu(null)
    if (d === decision) return
    try { onValues(row.id, await setDecision(row, d)) } catch (e) { onError(message(e)) }
  }
  async function putIn(orderId: string | null) {
    setStatusMenu(null)
    try {
      if (orderId) await coverWith(row.project_id, orderId, [row.id]); else await uncover([row.id])
      onChanged()
    } catch (e) { onError(message(e)) }
  }
  // A long press on a touch screen does what a right-click does.
  const touchHandlers = decision ? {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const x = e.clientX, y = e.clientY
      press.current = { x, y, timer: window.setTimeout(() => { press.current = null; setStatusMenu({ x, y }) }, 500) }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { window.clearTimeout(p.timer); press.current = null }
    },
    onPointerUp: () => { if (press.current) { window.clearTimeout(press.current.timer); press.current = null } },
    onPointerCancel: () => { if (press.current) { window.clearTimeout(press.current.timer); press.current = null } },
  } : {}
  const subject = row.title ?? row.values?.[`${row.kind.split('_')[0]}.title`] ?? ''
  const cost = changeCost(row), days = changeDays(row)
  /** The row being corrected: number, subject and day, as typed so far. */
  const [edit, setEdit] = useState<{ number: string; title: string; day: string; cost: string; days: string } | null>(null)
  const [saving, setSaving] = useState(false)
  async function saveEdit() {
    if (!edit || saving) return
    setSaving(true)
    try {
      // The time of day it was issued is kept; only the day moves.
      const was = new Date(row.issued_at)
      const [y, m, d] = edit.day.split('-').map(Number)
      const when = y && m && d ? new Date(y, m - 1, d, was.getHours(), was.getMinutes(), was.getSeconds()) : was
      const cost = edit.cost.trim() ? readMoney(edit.cost) : null
      const days = edit.days.trim() ? Number(edit.days.replace(/[^0-9.+-]/g, '')) : null
      if (edit.cost.trim() && cost == null) { onError('That cost is not a figure.'); return }
      if (days != null && !Number.isFinite(days)) { onError('Time is a number of days.'); return }
      await setIssuedDetails(row.id, {
        number: edit.number.trim() || null, title: edit.title.trim() || null, issued_at: when.toISOString(),
        values: withChange(row, cost, days),
      })
      setEdit(null)
      onChanged()
    } catch (e) { onError(message(e)) } finally { setSaving(false) }
  }
  const beginEdit = () => setEdit({ number: row.number ?? '', title: subject, day: dayOf(row.issued_at), cost: costIsOwn(row) && cost != null ? asMoney(cost) : '', days: daysAreOwn(row) && days != null ? String(days) : '' })
  const keys = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void saveEdit(); else if (e.key === 'Escape') setEdit(null) }
  const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

  return (
    <>
      {edit ? (
        <tr className="reg-edit">
          {cols.map((c) => <Fragment key={c}>{({
            number: <td><input className="mono" value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} onKeyDown={keys} aria-label="Number" /></td>,
            type: <td className="nowrap">{FORM_LABELS[row.kind]}</td>,
            subject: <td className="col-title"><input autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} onKeyDown={keys} aria-label="Subject" /></td>,
            status: <td className="col-status" />,
            issued: <td className="col-date"><input type="date" value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} onKeyDown={keys} aria-label="Issued" /></td>,
            cost: <td className="col-chg"><MoneyInput className="right" value={edit.cost} placeholder="$0.00" onChange={(raw) => setEdit((x) => (x ? { ...x, cost: raw } : x))} onKeyDown={keys} aria-label="Change to contract cost" /></td>,
            time: <td className="col-chg"><input className="right" inputMode="numeric" value={edit.days} placeholder="days" onChange={(e) => setEdit({ ...edit, days: e.target.value })} onKeyDown={keys} aria-label="Change to contract time, in days" /></td>,
          } as Record<RegCol, React.ReactNode>)[c]}</Fragment>)}
          <td className="right nowrap">
            <button className="primary" disabled={saving} onClick={() => void saveEdit()}>{saving ? 'Saving…' : 'Save'}</button>{' '}
            <button className="link" onClick={() => setEdit(null)}>Cancel</button>
          </td>
        </tr>
      ) : (
      <tr className={[row.file_path ? 'opens' : '', row.kind === 'change_order' ? 'reg-co-head' : '', inOrder ? 'reg-in-co' : ''].filter(Boolean).join(' ') || undefined}
        // A right-click edits the row, as it does on the drawings and the sets.
        // A proposal request's right-click (or long press) sets its status; Edit is in that menu too.
        onContextMenu={(e) => { e.preventDefault(); if (decision) setStatusMenu({ x: e.clientX, y: e.clientY }); else beginEdit() }}
        {...touchHandlers}
        onClick={(e) => {
          if (statusMenu) return
          if (!row.file_path || !project) return
          if ((e.target as HTMLElement).closest('button, a, select, input')) return
          openFile(project, row.file_path).catch((err) => onError(message(err)))
        }}>
        {cols.map((c) => <Fragment key={c}>{({
          number: <td className="mono reg-num">{row.number ?? "—"}</td>,
          type: <td className="nowrap">{FORM_LABELS[row.kind]}</td>,
          subject: <td className="col-title">
          {subject}
          {row.kind === 'change_order' && !row.file_path && <span className="covers"> · no document yet</span>}
        </td>,
          status: <td className="col-status nowrap">
          {decision && (
            <span className={`pr-status pr-${decision}`} title="Right-click, or press and hold, to change">
              {decisionLabel(row.kind, decision)}
            </span>
          )}
        </td>,
          issued: <td className="col-date">{usDate(new Date(row.issued_at))}</td>,
          // A proposal request's cost is typed straight into its cell; the change order it is in adds them up.
          cost: row.kind === 'pr' ? (
            <td className="right nowrap col-chg pr-cost" onClick={(e) => { e.stopPropagation(); if (costTyped === null) setCostTyped(cost == null ? '' : asMoney(cost)) }}
              title={costTyped === null ? 'Click to enter the cost' : undefined}>
              {costTyped === null ? (cost == null ? <span className="muted">add cost</span> : asMoney(cost)) : (
                <MoneyInput className="right" autoFocus value={costTyped} placeholder="$0.00" aria-label={`Cost of ${row.number ?? 'this proposal request'}`}
                  onChange={setCostTyped} onBlur={() => void saveCost()}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setCostTyped(null) }} />
              )}
            </td>
          ) : (
            <td className={`right nowrap col-chg${costIsOwn(row) ? '' : ' summed'}`} title={costIsOwn(row) ? undefined : 'Added up from the proposal requests it covers'}>{cost == null ? NOTHING : asMoney(cost)}</td>
          ),
          time: <td className={`right nowrap col-chg${daysAreOwn(row) ? '' : ' summed'}`}>{days == null ? NOTHING : daysText(days)}</td>,
        } as Record<RegCol, React.ReactNode>)[c]}</Fragment>)}
        <td className="right nowrap">
          {row.issuance_id && (
            <button className="link" onClick={(e) => { e.stopPropagation(); setShowing(!showing) }}>
              {showing ? 'Hide sheets' : 'Sheets'}
            </button>
          )}
          {row.kind === 'change_order' && !row.file_path && project && (
            <label className="link co-upload" onClick={(e) => e.stopPropagation()}>
              {uploading ? 'Uploading…' : 'Upload change order'}
              <input type="file" accept="application/pdf" hidden disabled={uploading} onChange={(e) => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (f) void uploadOrder(f)
              }} />
            </label>
          )}{' '}
          {row.kind === 'change_order' && <button className="link" onClick={onAttach}>{attaching ? 'Done' : 'Proposal requests'}</button>}
          {(row.file_path || row.issuance_id) && project && <> <DownloadChange row={row} project={project} onError={onError} /></>}
          {' '}<button className="link" onClick={(e) => { e.stopPropagation(); beginEdit() }}>Edit</button>
        </td>
      </tr>
      )}
      {edit && (
        <tr className="reg-edit-note"><td /><td colSpan={7} className="muted small">This corrects the register. The PDF that was issued stays as it was issued.</td></tr>
      )}

      {statusMenu && (
        <tr className="pr-menu-row"><td colSpan={8}>
          <div className="pick-menu-shade" onClick={() => setStatusMenu(null)} onContextMenu={(e) => { e.preventDefault(); setStatusMenu(null) }}>
            <div className="pick-menu" role="menu" onClick={(e) => e.stopPropagation()}
              style={{ left: Math.min(statusMenu.x, window.innerWidth - 290), top: Math.max(8, Math.min(statusMenu.y, window.innerHeight - (row.kind === 'pr' && decision === 'approved' ? 200 + 38 * (orders.length + 2) : 190))) }}>
              <div className="muted small pick-menu-title">{row.number ?? FORM_LABELS[row.kind]}</div>
              {(['pending', 'approved', 'rejected'] as PrDecision[]).map((d) => (
                <button key={d} role="menuitemradio" aria-checked={decision === d} className={decision === d ? 'pick-menu-here' : undefined} onClick={() => void setStatus(d)}>
                  {decisionLabel(row.kind, d)}{decision === d ? ' ✓' : ''}
                </button>
              ))}
              {row.kind === 'pr' && decision === 'approved' && (
                <div className="pick-menu-list">
                  <div className="muted small pick-menu-title">Change order</div>
                  {orders.map((o) => (
                    <button key={o.id} role="menuitemradio" aria-checked={row.rolledInto?.id === o.id} className={row.rolledInto?.id === o.id ? 'pick-menu-here' : undefined}
                      onClick={() => void putIn(row.rolledInto?.id === o.id ? null : o.id)}>
                      {o.number ?? 'Change order'}{o.title ? ` · ${o.title}` : ''}{row.rolledInto?.id === o.id ? ' ✓' : ''}
                    </button>
                  ))}
                  <button role="menuitem" onClick={() => { setStatusMenu(null); onNewOrder() }}>New change order{orders.length ? '' : ' (the first)'}</button>
                </div>
              )}
              <button role="menuitem" onClick={() => { setStatusMenu(null); beginEdit() }}>Edit…</button>
            </div>
          </div>
        </td></tr>
      )}

      {showing && row.issuance_id && (
        <tr className="confirm-row"><td colSpan={8}>
          <IssuedSheets issuanceId={row.issuance_id} project={project} onError={onError} />
        </td></tr>
      )}

      {attaching && (
        <tr className="confirm-row"><td colSpan={8}>
          <p className="small"><strong>Which proposal requests does {row.number ?? 'this change order'} cover?</strong></p>
          {!loose.length && !row.covers?.length ? (
            <p className="muted small">Every proposal request on this project is already in a change order.</p>
          ) : (
            <>
              {row.covers?.length ? (
                <p className="small">
                  Covers {row.covers.map((c) => c.number ?? '—').join(', ')}.{' '}
                  <button className="link danger-link" onClick={async () => {
                    try { await uncover(row.covers!.map((c) => c.id)); onChanged() } catch (e) { onError(message(e)) }
                  }}>Remove all</button>
                </p>
              ) : null}
              {loose.length > 0 && (
                <>
                  <div className="pr-pick">
                    {loose.map((p) => (
                      <label key={p.id} className="check small">
                        <input type="checkbox" checked={picked.includes(p.id)}
                          onChange={(e) => setPicked((v) => e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id))} />
                        {p.number ?? '—'} {p.title ? `· ${p.title}` : ''}
                      </label>
                    ))}
                  </div>
                  <div className="folder-actions">
                    <button className="primary-lite" disabled={!picked.length} onClick={async () => {
                      try { await coverWith(row.project_id, row.id, picked); setPicked([]); onChanged() }
                      catch (e) { onError(message(e)) }
                    }}>Add {picked.length || ''} to {row.number ?? 'this change order'}</button>
                  </div>
                </>
              )}
            </>
          )}
        </td></tr>
      )}
    </>
  )
}

/**
 * The sheets a change document issued.
 *
 * The question months later is never only "what did ASI 3 say" but "which sheets came with
 * it", and until now that meant going to the drawings and working backwards. The two rows
 * already point at each other; this is the register's side of it.
 */
function IssuedSheets({ issuanceId, project, onError }: {
  issuanceId: string
  project: { id: string; name: string } | null
  onError: (m: string) => void
}) {
  const [sheets, setSheets] = useState<BundleSheet[] | null>(null)

  useEffect(() => {
    let gone = false
    listIssuanceSheets(issuanceId)
      .then((s) => { if (!gone) setSheets(s) })
      .catch((e) => { if (!gone) onError(message(e)) })
    return () => { gone = true }
  }, [issuanceId, onError])

  if (!sheets) return <p className="muted small">Loading…</p>
  if (!sheets.length) return <p className="muted small">No sheets came with this one.</p>

  const sorted = [...sheets].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
  return (
    <div className="issued-sheets">
      <p className="small"><strong>{sheets.length} {sheets.length === 1 ? 'sheet' : 'sheets'} issued with this</strong></p>
      <div className="issued-sheet-list">
        {sorted.map((s) => (
          <button key={s.filePath} className="issued-sheet"
            onClick={() => {
              if (!project) return
              openFile(project as ProjectStore, s.filePath).catch((e) => onError(message(e)))
            }}>
            <span className="mono">{s.number}</span>
            <span className="issued-sheet-title">{s.title ?? ''}</span>
            {s.revisionLabel && <span className="tag">{s.revisionLabel}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}


