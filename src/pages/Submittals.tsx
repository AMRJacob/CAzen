import { useEffect, useState } from 'react'
import {
  attachCoverToSubmittal, buildSubmittalCover, type CoverSheetData, type SubmittalAction,
} from '../lib/pdf/coverSheet'
import { DEFAULT_WORDING, PLACEHOLDER_BRAND, loadBrand, loadWording, type Brand, type SubmittalWording } from '../lib/brand'
import { isConfigured } from '../lib/supabase'
import { useFirm } from '../lib/firm'
import { useProject } from '../lib/project'

const today = new Date().toISOString().slice(0, 10)

const blank: CoverSheetData = {
  projectName: '', projectNumber: '', contractor: '', submittalNumber: '', title: '', specSection: '',
  receivedOn: today, returnedOn: today, action: 'no_exceptions', comments: '', reviewer: '',
}

/** Review a submittal and download the returned package with the firm's cover sheet on top. */
export default function Submittals() {
  return isConfigured ? <SignedInSubmittals /> : <SubmittalForm brand={PLACEHOLDER_BRAND} wording={DEFAULT_WORDING.submittal_cover} footer="" />
}

function SignedInSubmittals() {
  const { firm } = useFirm()
  const { current } = useProject()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [wording, setWording] = useState<SubmittalWording>(DEFAULT_WORDING.submittal_cover)
  const [footer, setFooter] = useState('')

  useEffect(() => {
    if (!firm) return
    loadBrand(firm).then(setBrand)
    loadWording(firm.id, 'submittal_cover').then(setWording)
    loadWording(firm.id, 'general').then((g) => setFooter(g.footer))
  }, [firm])

  if (!brand) return <p className="muted">Loading your firm’s template…</p>
  return (
    <SubmittalForm
      key={current?.id ?? 'none'}
      brand={brand}
      wording={wording}
      footer={footer}
      initial={current ? { projectName: current.name, projectNumber: current.number, contractor: current.contractor_name ?? '' } : {}}
    />
  )
}

function SubmittalForm({ brand, wording, footer, initial = {} }: {
  brand: Brand
  wording: SubmittalWording
  footer: string
  initial?: Partial<CoverSheetData>
}) {
  const [data, setData] = useState<CoverSheetData>({ ...blank, ...initial })
  const [received, setReceived] = useState<ArrayBuffer | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof CoverSheetData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setData({ ...data, [k]: e.target.value })

  async function generate() {
    setBusy(true)
    const cover = await buildSubmittalCover(data, brand, wording, footer)
    const out = received ? await attachCoverToSubmittal(cover, received) : cover
    const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.submittalNumber || 'submittal'} - returned.pdf`
    a.click()
    setBusy(false)
  }

  const text = (k: keyof CoverSheetData, label: string) => (
    <label>{label}<input value={data[k]} onChange={set(k)} /></label>
  )

  return (
    <section>
      <h1>Submittals</h1>
      <p className="lead">Fill in the review, attach the contractor’s PDF, and download the returned package with your cover sheet on top.</p>

      <div className="form card">
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
            {(Object.entries(wording.actions) as [SubmittalAction, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="wide">Comments<textarea rows={4} value={data.comments} onChange={set('comments')} /></label>
        <label className="wide">Contractor’s submittal (PDF)
          <input type="file" accept="application/pdf" onChange={async (e) => setReceived((await e.target.files?.[0]?.arrayBuffer()) ?? null)} />
        </label>
      </div>
      <button className="primary" onClick={generate} disabled={busy}>{busy ? 'Building…' : 'Download returned submittal'}</button>
    </section>
  )
}
