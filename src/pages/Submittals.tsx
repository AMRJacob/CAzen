import { useState } from 'react'
import {
  ACTION_LABELS,
  attachCoverToSubmittal,
  buildSubmittalCover,
  type CoverSheetData,
  type SubmittalAction,
} from '../lib/pdf/coverSheet'

const today = new Date().toISOString().slice(0, 10)

const blank: CoverSheetData = {
  projectName: '',
  projectNumber: '',
  contractor: '',
  submittalNumber: '',
  title: '',
  specSection: '',
  receivedOn: today,
  returnedOn: today,
  action: 'no_exceptions',
  comments: '',
  reviewer: '',
}

/** Phase 2 starting point: generate the AMR submittal cover sheet and prepend it to the package. */
export default function Submittals() {
  const [data, setData] = useState<CoverSheetData>(blank)
  const [received, setReceived] = useState<ArrayBuffer | null>(null)
  const [letterhead, setLetterhead] = useState<ArrayBuffer | undefined>()

  const set = (k: keyof CoverSheetData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setData({ ...data, [k]: e.target.value })

  async function generate() {
    const cover = await buildSubmittalCover(data, letterhead)
    const out = received ? await attachCoverToSubmittal(cover, received) : cover
    const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.submittalNumber || 'submittal'} - returned.pdf`
    a.click()
  }

  const text = (k: keyof CoverSheetData, label: string) => (
    <label>{label}<input value={data[k]} onChange={set(k)} /></label>
  )

  return (
    <section>
      <h1>Submittals</h1>
      <p className="lead">Fill in the review, attach the contractor's PDF, and download the returned package with the AMR cover sheet.</p>

      <div className="form">
        {text('projectName', 'Project')}
        {text('projectNumber', 'Project no.')}
        {text('contractor', 'Contractor')}
        {text('submittalNumber', 'Submittal no.')}
        {text('title', 'Description')}
        {text('specSection', 'Spec section')}
        <label>Received<input type="date" value={data.receivedOn} onChange={set('receivedOn')} /></label>
        <label>Returned<input type="date" value={data.returnedOn} onChange={set('returnedOn')} /></label>
        {text('reviewer', 'Reviewed by')}
        <label>Action
          <select value={data.action} onChange={set('action')}>
            {(Object.entries(ACTION_LABELS) as [SubmittalAction, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="wide">Comments<textarea rows={4} value={data.comments} onChange={set('comments')} /></label>
        <label>Contractor's submittal (PDF)
          <input type="file" accept="application/pdf" onChange={async (e) => setReceived((await e.target.files?.[0]?.arrayBuffer()) ?? null)} />
        </label>
        <label>AMR letterhead (PDF, optional)
          <input type="file" accept="application/pdf" onChange={async (e) => setLetterhead(await e.target.files?.[0]?.arrayBuffer())} />
        </label>
      </div>
      <button className="primary" onClick={generate}>Generate returned submittal</button>
    </section>
  )
}
