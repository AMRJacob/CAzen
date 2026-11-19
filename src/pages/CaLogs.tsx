import { PageTitle } from '../components/PageTitle'
import { useCallback, useEffect, useMemo, useState } from 'react'
import IssueForm from './IssueForm'
import { FORM_LABELS, usDate } from '../lib/templates/fields'
import { CHANGE_KINDS, coverWith, fileMissingChangeDocuments, listRegister, missingChangeDocuments, prDecision, prPrice, prStanding, changeCost, changeDays, changeTotals, costIsOwn, daysAreOwn, setIssuedDetails, setPrResponse, uncover, withChange, type MissingChangeDocument, type PrDecision, type RegisterRow } from '../lib/issued'
import { money as asMoney, NOTHING } from '../lib/money'
import { money as readMoney } from '../lib/sovPaste'
import { openFile, type ProjectStore } from '../lib/files'
import { listIssuanceSheets } from '../lib/sheets'
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
    return r
  }, [rows, sort])

  // Proposal requests no change order has taken up yet, for the attach picker.
  const loose = useMemo(() => (rows ?? []).filter((r) => r.kind === 'pr' && !r.rolledInto), [rows])
  const orders = useMemo(() => (rows ?? []).filter((r) => r.kind === 'change_order')
    .sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '', undefined, { numeric: true })), [rows])
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
            <PageTitle>New {FORM_LABELS[writing].toLowerCase()}</PageTitle>
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
            <tr><th>Number</th><th>Type</th><th className="col-title">Subject</th><th className="col-date">Issued</th><th className="right col-chg">Cost</th><th className="right col-chg">Time</th><th /></tr>
            <tr className="reg-total">
              <td colSpan={4}>Change orders to date{totals.orders.count ? ` (${totals.orders.count})` : ''}</td>
              <td className="right nowrap">{totals.orders.count ? asMoney(totals.orders.cost) : NOTHING}</td>
              <td className="right nowrap">{totals.orders.count ? daysText(totals.orders.days) : NOTHING}</td><td />
            </tr>
            {totals.loose.count > 0 && (
              <tr className="reg-total reg-total-loose">
                <td colSpan={4}>Proposal requests not yet in a change order ({totals.loose.count})</td>
                <td className="right nowrap">{asMoney(totals.loose.cost)}</td>
                <td className="right nowrap">{daysText(totals.loose.days)}</td><td />
              </tr>
            )}
          </thead>
          <tbody>
            {listed.map((r) => (
              <Row key={r.id} row={r} project={current} loose={loose} orders={orders} onValues={patchRow}
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

function Row({ row, project, loose, orders, onValues, attaching, onAttach, onChanged, onError }: {
  /** The project's change orders, for a proposal request to be rolled into. */
  orders: RegisterRow[]
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
  const keys = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void saveEdit(); else if (e.key === 'Escape') setEdit(null) }
  const dayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

  return (
    <>
      {edit ? (
        <tr className="reg-edit">
          <td><input className="mono" value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} onKeyDown={keys} aria-label="Number" /></td>
          <td className="nowrap">{FORM_LABELS[row.kind]}</td>
          <td className="col-title"><input autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} onKeyDown={keys} aria-label="Subject" /></td>
          <td className="col-date"><input type="date" value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} onKeyDown={keys} aria-label="Issued" /></td>
          <td className="col-chg"><input className="right" inputMode="decimal" value={edit.cost} placeholder="$" onChange={(e) => setEdit({ ...edit, cost: e.target.value })} onKeyDown={keys} aria-label="Change to contract cost" /></td>
          <td className="col-chg"><input className="right" inputMode="numeric" value={edit.days} placeholder="days" onChange={(e) => setEdit({ ...edit, days: e.target.value })} onKeyDown={keys} aria-label="Change to contract time, in days" /></td>
          <td className="right nowrap">
            <button className="primary" disabled={saving} onClick={() => void saveEdit()}>{saving ? 'Saving…' : 'Save'}</button>{' '}
            <button className="link" onClick={() => setEdit(null)}>Cancel</button>
          </td>
        </tr>
      ) : (
      <tr className={row.file_path ? 'opens' : undefined}
        onClick={(e) => {
          if (!row.file_path || !project) return
          if ((e.target as HTMLElement).closest('button, a, select, input')) return
          openFile(project, row.file_path).catch((err) => onError(message(err)))
        }}>
        <td className="mono">{row.number ?? '—'}</td>
        <td className="nowrap">{FORM_LABELS[row.kind]}</td>
        <td className="col-title">
          {subject}
          {row.kind === 'change_order' && row.covers?.length ? (
            <span className="covers"> covers {row.covers.map((c) => c.number ?? '—').join(', ')}
              {row.covers.some((c) => prPrice(c) != null) && <> · {asMoney(row.covers.reduce((n, c) => n + (prPrice(c) ?? 0), 0))}</>}
            </span>
          ) : null}
          {row.kind === 'pr' && row.rolledInto ? (
            <span className="covers"> in {row.rolledInto.number ?? 'a change order'}</span>
          ) : null}
        </td>
        <td className="col-date">{usDate(new Date(row.issued_at))}</td>
        <td className={`right nowrap col-chg${costIsOwn(row) ? '' : ' summed'}`} title={costIsOwn(row) ? undefined : 'Added up from the proposal requests it covers'}>{cost == null ? NOTHING : asMoney(cost)}</td>
        <td className={`right nowrap col-chg${daysAreOwn(row) ? '' : ' summed'}`}>{days == null ? NOTHING : daysText(days)}</td>
        <td className="right nowrap">
          {row.issuance_id && (
            <button className="link" onClick={(e) => { e.stopPropagation(); setShowing(!showing) }}>
              {showing ? 'Hide sheets' : 'Sheets'}
            </button>
          )}
          {row.kind === 'change_order' && <button className="link" onClick={onAttach}>{attaching ? 'Done' : 'Proposal requests'}</button>}
          {' '}<button className="link" onClick={(e) => { e.stopPropagation(); setEdit({ number: row.number ?? '', title: subject, day: dayOf(row.issued_at), cost: costIsOwn(row) && cost != null ? asMoney(cost) : '', days: daysAreOwn(row) && days != null ? String(days) : '' }) }}>Edit</button>
        </td>
      </tr>
      )}
      {edit && (
        <tr className="reg-edit-note"><td /><td colSpan={6} className="muted small">This corrects the register. The PDF that was issued stays as it was issued.</td></tr>
      )}

      {row.kind === 'pr' && (
        <tr className="pr-response"><td /><td colSpan={6}>
          <PrResponse row={row} orders={orders} onValues={onValues} onChanged={onChanged} onError={onError} />
        </td></tr>
      )}

      {showing && row.issuance_id && (
        <tr className="confirm-row"><td colSpan={7}>
          <IssuedSheets issuanceId={row.issuance_id} project={project} onError={onError} />
        </td></tr>
      )}

      {attaching && (
        <tr className="confirm-row"><td colSpan={7}>
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


/**
 * What came back on a proposal request: the contractor's price, the owner's answer, and the
 * change order it ends up in. A PR is a question; this is the answer, kept on the same line.
 */
function PrResponse({ row, orders, onValues, onChanged, onError }: {
  row: RegisterRow
  orders: RegisterRow[]
  onValues: (id: string, values: Record<string, string>) => void
  onChanged: () => void
  onError: (m: string) => void
}) {
  const price = prPrice(row)
  const decision = prDecision(row)
  const [typed, setTyped] = useState(price == null ? '' : asMoney(price))

  async function keep(patch: { price?: number | null; decision?: PrDecision }) {
    try { onValues(row.id, await setPrResponse(row, patch)) } catch (e) { onError(message(e)) }
  }
  function priceDone() {
    const n = typed.trim() ? readMoney(typed) : null
    if (typed.trim() && n == null) { setTyped(price == null ? '' : asMoney(price)); return }
    if (n !== price) void keep({ price: n })
    setTyped(n == null ? '' : asMoney(n))
  }
  const CHOICES: [PrDecision, string][] = [['pending', price == null ? 'Awaiting price' : 'Awaiting decision'], ['approved', 'Approved'], ['rejected', 'Not accepted']]

  return (
    <div className="pr-answer">
      <label>Price
        <input className="cell" inputMode="decimal" value={typed} placeholder="when it comes back"
          aria-label={`Price for ${row.number ?? 'this proposal request'}`}
          onChange={(e) => setTyped(e.target.value)} onBlur={priceDone}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </label>
      <div className="pr-decide" role="radiogroup" aria-label="The owner’s decision">
        {CHOICES.map(([d, label]) => (
          <button key={d} role="radio" aria-checked={decision === d} className={`chip pr-${d}${decision === d ? ' on' : ''}`}
            onClick={() => { if (decision !== d) void keep({ decision: d }) }}>{label}</button>
        ))}
      </div>
      <label>Change order
        <select value={row.rolledInto?.id ?? ''} aria-label={`Change order for ${row.number ?? 'this proposal request'}`}
          onChange={async (e) => {
            try {
              if (e.target.value) await coverWith(row.project_id, e.target.value, [row.id]); else await uncover([row.id])
              onChanged()
            } catch (err) { onError(message(err)) }
          }}>
          <option value="">{orders.length ? 'Not in one yet' : 'None written yet'}</option>
          {orders.map((o) => <option key={o.id} value={o.id}>{o.number ?? 'Change order'}{o.title ? ` · ${o.title}` : ''}</option>)}
        </select>
      </label>
      {decision === 'approved' && !row.rolledInto && <span className="pr-flag">Approved — not in a change order yet</span>}
    </div>
  )
}
