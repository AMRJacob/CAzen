import { useCallback, useEffect, useRef, useState } from 'react'
import { behind, takeToField, type Behind, type Progress } from '../lib/offline/download'
import { held, type Held } from '../lib/offline/store'
import { drain, pending } from '../lib/offline/outbox'
import { message } from '../lib/errors'
import type { Project } from '../lib/types'

/**
 * Whether the copy on this device is still the job.
 *
 * Marking up a superseded sheet is worse than having no drawings at all: the markup is real, the
 * drawing under it is not, and nothing on the screen says so. A device that is holding a project
 * therefore asks the question every time it finds the internet, and says which sheets have moved
 * on rather than "updates available" — which sheets changed is what decides whether it matters
 * this afternoon or next week.
 *
 * Nothing is said when the copy is current and nothing is held, because a banner that is usually
 * there is a banner nobody reads.
 */

const list = (sheets: { number: string }[]) => {
  const names = sheets.map((s) => s.number)
  if (names.length <= 4) return names.join(', ')
  return `${names.slice(0, 4).join(', ')} and ${names.length - 4} more`
}

export function FieldSync({ project, onSynced }: { project: Project; onSynced?: () => void }) {
  const [have, setHave] = useState<Held | null>(null)
  const [state, setState] = useState<Behind | null>(null)
  const [run, setRun] = useState<Progress | null>(null)
  const [waiting, setWaiting] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const stop = useRef<AbortController | null>(null)

  const look = useCallback(async () => {
    const note = await held(project.id).catch(() => null)
    setHave(note ?? null)
    if (!note) { setState(null); return }
    pending(project.id).then((q) => setWaiting(q.length)).catch(() => setWaiting(0))
    if (!navigator.onLine) return
    try { setState(await behind(project.id)) } catch { /* a check that can't run says nothing */ }
  }, [project.id])

  useEffect(() => { void look() }, [look])

  // Coming back into signal is the moment this matters, so it is asked again then — and once in
  // a while after that, since a set can be issued while the phone sits on the dash.
  useEffect(() => {
    const again = () => { void look(); void drain() }
    window.addEventListener('online', again)
    const t = setInterval(() => { if (navigator.onLine) void look() }, 5 * 60 * 1000)
    return () => { window.removeEventListener('online', again); clearInterval(t) }
  }, [look])

  useEffect(() => () => stop.current?.abort(), [])

  async function sync() {
    if (!have) return
    setProblem(null)
    setDone(null)
    stop.current = new AbortController()
    setRun({ done: 0, total: 0, bytes: 0, what: '' })
    try {
      // The same download as taking it in the first place: files already here are kept, so this
      // fetches the difference. Anything made offline goes back first, so a sheet that is about
      // to be replaced hands over its markups before it goes.
      await drain()
      const note = await takeToField(project, have.scope, setRun, stop.current.signal)
      setHave(note)
      setDone(`Up to date — ${note.files} ${note.files === 1 ? 'sheet' : 'sheets'} on this device.`)
      setState(await behind(project.id))
      onSynced?.()
    } catch (e) {
      setProblem(message(e))
    } finally {
      setRun(null)
      void look()
    }
  }

  if (!have) return null
  const stale = state && state.sheets.length > 0

  if (run) {
    return (
      <div className="notice field-sync">
        Syncing{run.what ? ` ${run.what}` : ''}… {run.total ? `${run.done} of ${run.total}` : ''}
        <button className="link" onClick={() => stop.current?.abort()}>Stop</button>
      </div>
    )
  }

  if (!stale) {
    if (done) return <div className="notice field-sync">{done}</div>
    if (problem) return <div className="notice error field-sync">{problem}</div>
    if (waiting > 0) {
      return (
        <div className="notice field-sync">
          {waiting} {waiting === 1 ? 'change is' : 'changes are'} waiting to go back.
          {navigator.onLine && <button className="link" onClick={() => { void drain().then(look) }}>Send now</button>}
        </div>
      )
    }
    return null
  }

  return (
    <div className="notice warn field-sync">
      <strong>This device is behind.</strong>{' '}
      {state!.sheets.length === 1
        ? <>A newer revision of {state!.sheets[0].number} has been issued since you took this project.</>
        : <>Newer revisions of {state!.sheets.length} sheets have been issued since you took this project: {list(state!.sheets)}.</>}
      {waiting > 0 && <> {waiting} {waiting === 1 ? 'change' : 'changes'} from this device {waiting === 1 ? 'is' : 'are'} still to go back; syncing sends {waiting === 1 ? 'it' : 'them'} first.</>}
      <button className="primary-lite" onClick={() => void sync()}>Sync now</button>
      {problem && <span className="bad-text">{problem}</span>}
    </div>
  )
}
