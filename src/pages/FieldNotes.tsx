import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import IssueForm from './IssueForm'
import { FORM_LABELS, usDate } from '../lib/templates/fields'
import { listRegister, type RegisterRow } from '../lib/issued'
import { openFile } from '../lib/files'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import type { FormKind } from '../lib/templates/types'

/**
 * Field notes: what was seen and what was said.
 *
 * A field report and a set of meeting notes record the job as it stood on a day. Neither
 * changes the contract, so neither belongs in the change register — they were only written
 * from there because that is where the templates lived. Observations are the same kind of
 * thing at a smaller scale: one item seen on one visit, which may end up in a report, on a
 * punch list, or in neither.
 */

type Area = 'reports' | 'meetings' | 'observations'

const KIND: Record<'reports' | 'meetings', FormKind> = {
  reports: 'field_report',
  meetings: 'meeting_notes',
}

const HEADING: Record<Area, { title: string; lead: string }> = {
  reports: {
    title: 'Field reports',
    lead: 'What the site looked like on the day — written on your firm’s template, numbered and kept with the project.',
  },
  meetings: {
    title: 'Meeting notes',
    lead: 'What was said and who owes what, kept with the project rather than in somebody’s inbox.',
  },
  observations: {
    title: 'Observations',
    lead: 'One thing seen on one visit — the raw material a field report or a punch list is made of.',
  },
}

export default function FieldNotes() {
  const { area = 'reports' } = useParams<{ area: Area }>()
  const here = (['reports', 'meetings', 'observations'] as Area[]).includes(area as Area)
    ? (area as Area) : 'reports'
  return here === 'observations' ? <Observations /> : <Reports area={here} />
}

// ---------- Field reports and meeting notes ----------

function Reports({ area }: { area: 'reports' | 'meetings' }) {
  const kind = KIND[area]
  const { current } = useProject()
  const [writing, setWriting] = useState(false)
  const [rows, setRows] = useState<RegisterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projectId = current?.id
  const load = useCallback(() => {
    if (!projectId) return
    setRows(null)
    listRegister(projectId, [kind]).then(setRows).catch((e) => setError(message(e)))
  }, [projectId, kind])
  useEffect(() => { load() }, [load])

  // Leaving the form behind is the same gesture whichever kind it was.
  useEffect(() => { setWriting(false) }, [kind])

  const listed = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
    [rows])

  if (writing) {
    return (
      <section>
        <div className="page-head">
          <div>
            <PageTitle>New {FORM_LABELS[kind].toLowerCase()}</PageTitle>
            <p className="lead">On your firm’s template. It fills itself in, numbers itself and is kept with the project.</p>
          </div>
          <button onClick={() => { setWriting(false); load() }}>Back to the list</button>
        </div>
        <IssueForm key={kind} kind={kind} />
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>{HEADING[area].title}</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            {HEADING[area].lead}
          </p>
        </div>
        <button className="primary" onClick={() => setWriting(true)}>
          New {FORM_LABELS[kind].toLowerCase()}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {!rows ? <p className="muted">Loading…</p>
        : !listed.length ? <div className="card muted">Nothing written yet.</div> : (
          <table className="register">
            <thead>
              <tr><th>Number</th><th className="col-title">Subject</th><th className="col-date">Issued</th></tr>
            </thead>
            <tbody>
              {listed.map((r) => (
                <tr key={r.id} className={r.file_path ? 'opens' : undefined}
                  onClick={() => {
                    if (!r.file_path || !current) return
                    openFile(current, r.file_path).catch((err) => setError(message(err)))
                  }}>
                  <td className="mono">{r.number ?? '—'}</td>
                  <td className="col-title">{r.title ?? r.values?.[`${r.kind.split('_')[0]}.title`] ?? ''}</td>
                  <td className="col-date">{usDate(new Date(r.issued_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </section>
  )
}

// ---------- Observations ----------

function Observations() {
  const { current } = useProject()
  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>{HEADING.observations.title}</PageTitle>
          <p className="lead">
            {current ? <>{current.number} {current.name} · </> : null}
            {HEADING.observations.lead}
          </p>
        </div>
      </div>
      <div className="card muted">
        <strong>Not built yet.</strong> The table behind this is in place — an observation carries a
        type, a date, an area and trade, a status, a pin on a sheet and photographs — and it syncs
        offline along with markups. What is missing is the way to make one: the form, the pin, and
        the camera.
      </div>
    </section>
  )
}
