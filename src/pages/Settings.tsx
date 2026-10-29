import { useEffect, useRef, useState } from 'react'
import { useFirm } from '../lib/firm'
import { db } from '../lib/supabase'
import {
  DEFAULT_WORDING, brandFromFirm, loadBrand, loadWording, removeBrandFile, saveWording, uploadBrandFile,
  type Brand, type GeneralWording, type SubmittalWording,
} from '../lib/brand'
import { buildSubmittalCover, type SubmittalAction } from '../lib/pdf/coverSheet'
import type { Firm } from '../lib/types'

const SAMPLE = {
  projectName: 'Sample Project', projectNumber: '2026-001', contractor: 'Sample Builders, Inc.',
  submittalNumber: '08 71 00-001', title: 'Door hardware', specSection: '08 71 00',
  receivedOn: new Date().toISOString().slice(0, 10), returnedOn: new Date().toISOString().slice(0, 10),
  action: 'exceptions_noted' as SubmittalAction,
  comments: 'Provide finish samples for lever trim. Confirm closer arm types at pairs of doors.',
  reviewer: 'Reviewer initials',
}

const SWATCHES = ['#5f7a61', '#4a6b82', '#8a6f4e', '#6b5b73', '#2f3a34', '#1f4e79']

export default function Settings() {
  const { firm, isAdmin, reload } = useFirm()
  const [draft, setDraft] = useState<Firm>(firm!)
  const [general, setGeneral] = useState<GeneralWording>(DEFAULT_WORDING.general)
  const [submittal, setSubmittal] = useState<SubmittalWording>(DEFAULT_WORDING.submittal_cover)
  const [assets, setAssets] = useState<Pick<Brand, 'logo' | 'letterhead'>>({})
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const previewTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!firm) return
    setDraft(firm)
    loadBrand(firm).then((b) => setAssets({ logo: b.logo, letterhead: b.letterhead }))
    loadWording(firm.id, 'general').then(setGeneral)
    loadWording(firm.id, 'submittal_cover').then(setSubmittal)
  }, [firm])

  // Rebuild the preview shortly after any change.
  useEffect(() => {
    window.clearTimeout(previewTimer.current)
    previewTimer.current = window.setTimeout(async () => {
      try {
        const bytes = await buildSubmittalCover(SAMPLE, brandFromFirm(draft, assets), submittal, general.footer)
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        setPreview((old) => { if (old) URL.revokeObjectURL(old); return url })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, 400)
  }, [draft, assets, submittal, general])

  if (!firm) return null

  const set = (k: keyof Firm) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value })

  async function save() {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const { error } = await db().from('firms').update({
        name: draft.name, address_line1: draft.address_line1, address_line2: draft.address_line2,
        city_state_zip: draft.city_state_zip, phone: draft.phone, email: draft.email,
        website: draft.website, license_text: draft.license_text, accent_color: draft.accent_color,
      }).eq('id', firm!.id)
      if (error) throw error
      await saveWording(firm!.id, 'general', general)
      await saveWording(firm!.id, 'submittal_cover', submittal)
      await reload()
      setStatus('Saved. Every new document uses these settings.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e))
    } finally {
      setSaving(false)
    }
  }

  async function onUpload(which: 'logo' | 'letterhead', file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const path = await uploadBrandFile(firm!.id, which, file)
      const bytes = new Uint8Array(await file.arrayBuffer())
      setAssets((a) => which === 'logo'
        ? { ...a, logo: { bytes, type: path.endsWith('.png') ? 'png' : 'jpg' } }
        : { ...a, letterhead: bytes })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRemove(which: 'logo' | 'letterhead') {
    const path = which === 'logo' ? firm!.logo_path : firm!.letterhead_path
    if (!path) return
    await removeBrandFile(firm!.id, which, path)
    setAssets((a) => ({ ...a, [which]: undefined }))
    await reload()
  }

  const readOnly = !isAdmin

  return (
    <section>
      <h1>Settings</h1>
      <p className="lead">Your firm’s details and brand. Change them any time, for example when rebranding; every new document uses the current settings.</p>
      {readOnly && <div className="notice">Only firm admins can change branding. You can view it here.</div>}

      <div className="settings-grid">
        <fieldset disabled={readOnly} className="settings-form">
          <h2>Firm</h2>
          <div className="form">
            <label className="wide">Firm name<input value={draft.name} onChange={set('name')} /></label>
            <label className="wide">Street address<input value={draft.address_line1 ?? ''} onChange={set('address_line1')} /></label>
            <label className="wide">Suite / second line<input value={draft.address_line2 ?? ''} onChange={set('address_line2')} /></label>
            <label className="wide">City, state ZIP<input value={draft.city_state_zip ?? ''} onChange={set('city_state_zip')} /></label>
            <label>Phone<input value={draft.phone ?? ''} onChange={set('phone')} /></label>
            <label>Email<input value={draft.email ?? ''} onChange={set('email')} /></label>
            <label>Website<input value={draft.website ?? ''} onChange={set('website')} /></label>
            <label>License line<input value={draft.license_text ?? ''} onChange={set('license_text')} placeholder="State certificate of authority no." /></label>
          </div>

          <h2>Brand</h2>
          <div className="brand-row">
            <span className="brand-label">Accent colour</span>
            <div className="swatches">
              {SWATCHES.map((c) => (
                <button key={c} type="button" className={`swatch ${draft.accent_color === c ? 'on' : ''}`} style={{ background: c }}
                  aria-label={`Use ${c}`} onClick={() => setDraft({ ...draft, accent_color: c })} />
              ))}
              <input type="color" value={draft.accent_color} onChange={set('accent_color')} aria-label="Custom colour" />
            </div>
          </div>
          <div className="brand-row">
            <span className="brand-label">Logo <span className="muted small">PNG or JPG</span></span>
            <div className="file-row">
              <label className="button">{firm.logo_path ? 'Replace' : 'Upload'}<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onUpload('logo', e.target.files?.[0])} /></label>
              {firm.logo_path && <button type="button" className="link" onClick={() => onRemove('logo')}>Remove</button>}
            </div>
          </div>
          <div className="brand-row">
            <span className="brand-label">Letterhead PDF <span className="muted small">optional, replaces the built header</span></span>
            <div className="file-row">
              <label className="button">{firm.letterhead_path ? 'Replace' : 'Upload'}<input type="file" accept="application/pdf" hidden onChange={(e) => onUpload('letterhead', e.target.files?.[0])} /></label>
              {firm.letterhead_path && <button type="button" className="link" onClick={() => onRemove('letterhead')}>Remove</button>}
            </div>
          </div>
          <label className="stack">Footer text (all documents)
            <input value={general.footer} onChange={(e) => setGeneral({ ...general, footer: e.target.value })} placeholder="Optional" />
          </label>

          <h2>Submittal cover sheet</h2>
          <label className="stack">Heading<input value={submittal.title} onChange={(e) => setSubmittal({ ...submittal, title: e.target.value })} /></label>
          {(Object.keys(submittal.actions) as SubmittalAction[]).map((k) => (
            <label className="stack" key={k}>
              <span className="muted small">{DEFAULT_WORDING.submittal_cover.actions[k]}</span>
              <input value={submittal.actions[k]} onChange={(e) => setSubmittal({ ...submittal, actions: { ...submittal.actions, [k]: e.target.value } })} />
            </label>
          ))}
          <label className="stack">Review disclaimer
            <textarea rows={4} value={submittal.disclaimer} onChange={(e) => setSubmittal({ ...submittal, disclaimer: e.target.value })} />
          </label>

          {!readOnly && (
            <div className="actions">
              <button type="button" className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button>
              {status && <span className="muted small">{status}</span>}
            </div>
          )}
          {error && <div className="notice error">{error}</div>}
        </fieldset>

        <div className="preview">
          <div className="preview-head"><span className="brand-label">Preview</span><span className="muted small">sample submittal</span></div>
          {preview ? <iframe title="Cover sheet preview" src={preview + '#toolbar=0&view=FitH'} /> : <div className="muted small">Building preview…</div>}
        </div>
      </div>
    </section>
  )
}
