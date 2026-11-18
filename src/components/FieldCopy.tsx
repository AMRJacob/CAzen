import { useCallback, useEffect, useRef, useState } from 'react'
import { plans, takeToField, type Plan, type Progress, type Scope } from '../lib/offline/download'
import { held, heldKey, release, space, type Held } from '../lib/offline/store'
import { drain, pending } from '../lib/offline/outbox'
import { message } from '../lib/errors'
import type { Project } from '../lib/types'

/**
 * Taking a project to the field, and bringing it back.
 *
 * The decision gets made on a phone, on LTE, usually in a truck — so both choices carry what they
 * will cost before anything is downloaded, and the download can be stopped. Afterwards this is
 * also where the state of the copy lives: what is held, what hasn't been sent back yet, and the
 * way to give the space back.
 */

const size = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`

const LABEL: Record<Scope, string> = { current: 'Current set', all: 'Full archive' }
const ABOUT: Record<Scope, string> = {
  current: 'The current revision of every sheet, with its markups and punch items.',
  all: 'Every revision ever issued, so superseded sheets are there to argue from.',
}

export function FieldCopy({ project }: { project: Project }) {
  const [choices, setChoices] = useState<Plan[] | null>(null)
  const [have, setHave] = useState<Held | null | undefined>(undefined)
  const [run, setRun] = useState<Progress | null>(null)
  const [room, setRoom] = useState<{ used: number; quota: number } | null>(null)
  const [waiting, setWaiting] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const stop = useRef<AbortController | null>(null)

  const look = useCallback(() => {
    held(project.id).then((h) => setHave(h ?? null)).catch(() => setHave(null))
    pending(project.id).then((q) => setWaiting(q.length)).catch(() => setWaiting(0))
    space().then(setRoom).catch(() => setRoom(null))
  }, [project.id])
  useEffect(() => { look() }, [look])

  // What is still to go back, kept current while the page is open.
  useEffect(() => {
    const t = setInterval(() => { pending(project.id).then((q) => setWaiting(q.length)).catch(() => {}) }, 4000)
    return () => clearInterval(t)
  }, [project.id])

  useEffect(() => () => stop.current?.abort(), [])

  async function offer() {
    setProblem(null)
    try { setChoices(await plans(project.id)) } catch (e) { setProblem(message(e)) }
  }

  async function go(scope: Scope) {
    setChoices(null)
    setProblem(null)
    stop.current = new AbortController()
    setRun({ done: 0, total: 0, bytes: 0, what: '' })
    try {
      const done = await takeToField(project, scope, setRun, stop.current.signal)
      setHave(done)
      setNote(stop.current.signal.aborted
        ? `Stopped with ${done.files} ${done.files === 1 ? 'sheet' : 'sheets'} on this device.`
        : `${done.files} ${done.files === 1 ? 'sheet is' : 'sheets are'} on this device, ${size(done.bytes)}.`)
    } catch (e) {
      setProblem(message(e))
    } finally {
      setRun(null)
      stop.current = null
      look()
    }
  }

  if (have === undefined) return null

  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0

  return (
    <div className="field-copy">
      <h3>On this device</h3>

      {run ? (
        <>
          <p className="muted small">
            {run.total ? `${run.done} of ${run.total} sheets · ${size(run.bytes)}` : 'Reading the project…'}
            {run.what && <> · {run.what}</>}
          </p>
          <div className="run-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="folder-actions">
            <button onClick={() => stop.current?.abort()}>Stop</button>
          </div>
        </>
      ) : choices ? (
        <>
          <p className="muted small">What to take. Sheets already on this device aren’t fetched again.</p>
          <div className="field-choices">
            {choices.map((c) => (
              <button key={c.scope} className="field-choice" onClick={() => go(c.scope)}>
                <span className="fc-name">{LABEL[c.scope]}</span>
                <span className="fc-size">{c.estimated ? 'about ' : ''}{size(c.bytes)}</span>
                <span className="fc-about">{c.files} {c.files === 1 ? 'sheet' : 'sheets'} · {ABOUT[c.scope]}</span>
              </button>
            ))}
          </div>
          {room && (
            <p className="muted small">
              This browser will hold about {size(room.quota)} for CAzen, {size(room.used)} of it used.
            </p>
          )}
          <div className="folder-actions"><button className="link" onClick={() => setChoices(null)}>Cancel</button></div>
        </>
      ) : have ? (
        <>
          <p className="small">
            <strong>{LABEL[have.scope]}</strong> · {have.files} {have.files === 1 ? 'sheet' : 'sheets'} · {size(have.bytes)},
            taken {new Date(have.at).toLocaleDateString()}. Sheets, markups and punch items open without a signal.
          </p>
          {waiting > 0 && (
            <p className="small">
              {waiting} {waiting === 1 ? 'change has' : 'changes have'} not gone back yet.{' '}
              {navigator.onLine
                ? <button className="link" onClick={async () => { const r = await drain(); look(); setNote(`${r.sent} sent.`) }}>Send now</button>
                : <span className="muted">They go when this device is back online.</span>}
            </p>
          )}
          <div className="folder-actions">
            <button onClick={offer}>Update the copy</button>
            <button className="link" onClick={async () => {
              await release(project.id)
              localStorage.removeItem(heldKey(project.id))
              setHave(null); setNote('Taken off this device.'); look()
            }}>Remove from this device</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">
            Take this project with you and the sheets, markups and punch list work with no signal.
            Anything added in the field goes back on its own once there is one.
          </p>
          <div className="folder-actions"><button onClick={offer}>Take to the field…</button></div>
        </>
      )}

      {note && <p className="muted small">{note}</p>}
      {problem && <p className="small bad-text">{problem}</p>}
    </div>
  )
}
