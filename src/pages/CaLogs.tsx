import { useCallback, useEffect, useMemo, useState } from 'react'
import IssueForm from './IssueForm'
import { FORM_LABELS, usDate } from '../lib/templates/fields'
import { CHANGE_KINDS, coverWith, listRegister, uncover, type RegisterRow } from '../lib/issued'
import { openFile } from '../lib/files'
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
 * Field reports and meeting notes are records rather than changes, so they aren't in the register
 * by default, but they're written from the same place.
 */

const ALL_KINDS: FormKind[] = [...CHANGE_KINDS, 'field_report', 'meeting_notes']

type SortBy = 'date' | 'type' | 'number'

export default function CaLogs() {
  const { current } = useProject()
  const [writing, setWriting] = useState<FormKind | null>(null)
  const [rows, setRows] = useState<RegisterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortBy>('date')
  const [only, setOnly] = useState<'changes' | 'all' | FormKind>('changes')
  const [attaching, setAttaching] = useState<string | null>(null)

  // Keyed on the project's id rather than the project, so a context that hands back a new object
  // each render can't turn this into a loop.
  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) return
    const want = only === 'changes' ? CHANGE_KINDS : only === 'all' ? ALL_KINDS : [only as FormKind]
    listRegister(projectId, want).then(setRows).catch((e) => setError(message(e)))
  }, [projectId, only])
  useEffect(() => { load() }, [load])

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

  if (writing) {
    return (
      <section>
        <div className="page-head">
          <div>
            <h1>New {FORM_LABELS[writing].toLowerCase()}</h1>
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
          <h1>Change documents</h1>
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
            <option value="all">Everything issued</option>
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

      {error && <div className="notice error">{error}</div>}
      {!rows ? <p className="muted">Loading…</p>
        : !listed.length ? <div className="card muted">Nothing issued yet.</div> : (
        <table className="register">
          <thead>
            <tr><th>Number</th><th>Type</th><th className="col-title">Subject</th><th className="col-date">Issued</th><th /></tr>
          </thead>
          <tbody>
            {listed.map((r) => (
              <Row key={r.id} row={r} project={current} loose={loose}
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

function Row({ row, project, loose, attaching, onAttach, onChanged, onError }: {
  row: RegisterRow
  project: { id: string; name: string } | null
  loose: RegisterRow[]
  attaching: boolean
  onAttach: () => void
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const subject = row.title ?? row.values?.[`${row.kind.split('_')[0]}.title`] ?? ''

  return (
    <>
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
            <span className="covers"> covers {row.covers.map((c) => c.number ?? '—').join(', ')}</span>
          ) : null}
          {row.kind === 'pr' && row.rolledInto ? (
            <span className="covers"> in {row.rolledInto.number ?? 'a change order'}</span>
          ) : null}
        </td>
        <td className="col-date">{usDate(new Date(row.issued_at))}</td>
        <td className="right nowrap">
          {row.kind === 'change_order' && <button className="link" onClick={onAttach}>{attaching ? 'Done' : 'Proposal requests'}</button>}
        </td>
      </tr>

      {attaching && (
        <tr className="confirm-row"><td colSpan={5}>
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
