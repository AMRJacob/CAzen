import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFirm } from '../lib/firm'
import { SetPassword, useAuth } from '../lib/auth'
import { db } from '../lib/supabase'
import { brandFromFirm, loadBrand, removeBrandFile, uploadBrandFile, type Brand } from '../lib/brand'
import { sampleValues } from '../lib/templates/fields'
import { renderForm } from '../lib/templates/render'
import { loadLayouts } from '../lib/templates/store'
import type { Layout } from '../lib/templates/types'
import type { Firm } from '../lib/types'

const SWATCHES = ['#5f7a61', '#4a6b82', '#8a6f4e', '#6b5b73', '#2f3a34', '#c8323a']

export default function Settings() {
  const { firm, isAdmin, reload, role } = useFirm()
  const { session } = useAuth()
  const [draft, setDraft] = useState<Firm>(firm!)
  const [assets, setAssets] = useState<Pick<Brand, 'logo' | 'letterhead'>>({})
  const [layouts, setLayouts] = useState<Record<string, Layout> | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!firm) return
    setDraft(firm)
    loadBrand(firm).then((b) => setAssets({ logo: b.logo, letterhead: b.letterhead }))
    loadLayouts(firm.id, ['general', 'submittal_cover']).then(setLayouts)
  }, [firm])

  useEffect(() => {
    if (!layouts) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        const brand = brandFromFirm(draft, assets)
        const bytes = await renderForm({ layout: layouts.submittal_cover, letterhead: layouts.general, brand, values: sampleValues('submittal_cover', brand) })
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        setPreview((old) => { if (old) URL.revokeObjectURL(old); return url })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, 400)
  }, [draft, assets, layouts])

  if (!firm) return null
  const set = (k: keyof Firm) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value })

  async function save() {
    setSaving(true)
    setError(null)
    setStatus(null)
    const { error } = await db().from('firms').update({
      name: draft.name, address_line1: draft.address_line1, address_line2: draft.address_line2,
      city_state_zip: draft.city_state_zip, phone: draft.phone, email: draft.email,
      website: draft.website, license_text: draft.license_text, accent_color: draft.accent_color,
    }).eq('id', firm!.id)
    setSaving(false)
    if (error) setError(error.message)
    else { await reload(); setStatus('Saved. Every new document uses these details.') }
  }

  async function onUpload(which: 'logo' | 'letterhead', file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const path = await uploadBrandFile(firm!.id, which, file)
      const bytes = new Uint8Array(await file.arrayBuffer())
      setAssets((a) => which === 'logo' ? { ...a, logo: { bytes, type: path.endsWith('.png') ? 'png' : 'jpg' } } : { ...a, letterhead: bytes })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e))
    }
  }

  async function onRemove(which: 'logo' | 'letterhead') {
    const path = which === 'logo' ? firm!.logo_path : firm!.letterhead_path
    if (!path) return
    await removeBrandFile(firm!.id, which, path)
    setAssets((a) => ({ ...a, [which]: undefined }))
    await reload()
  }

  return (
    <section>
      <h1>Settings</h1>
      <p className="lead">Your firm’s details and brand. Change them any time, for example when rebranding. Every new document uses the current settings.</p>
      {!isAdmin && <div className="notice">Only firm admins can change these settings.</div>}

      <div className="settings-grid">
        <fieldset disabled={!isAdmin} className="settings-form">
          <h2>Firm</h2>
          <div className="form">
            <label className="wide">Firm name<input value={draft.name} onChange={set('name')} /></label>
            <label className="wide">Street address<input value={draft.address_line1 ?? ''} onChange={set('address_line1')} /></label>
            <label className="wide">Suite / second line<input value={draft.address_line2 ?? ''} onChange={set('address_line2')} /></label>
            <label className="wide">City, state ZIP<input value={draft.city_state_zip ?? ''} onChange={set('city_state_zip')} /></label>
            <label>Phone<input value={draft.phone ?? ''} onChange={set('phone')} /></label>
            <label>Email<input value={draft.email ?? ''} onChange={set('email')} /></label>
            <label>Website<input value={draft.website ?? ''} onChange={set('website')} /></label>
            <label>License line<input value={draft.license_text ?? ''} onChange={set('license_text')} placeholder="Certificate of authority no." /></label>
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
            <span className="brand-label">Letterhead PDF <span className="muted small">optional, shown behind your forms</span></span>
            <div className="file-row">
              <label className="button">{firm.letterhead_path ? 'Replace' : 'Upload'}<input type="file" accept="application/pdf" hidden onChange={(e) => onUpload('letterhead', e.target.files?.[0])} /></label>
              {firm.letterhead_path && <button type="button" className="link" onClick={() => onRemove('letterhead')}>Remove</button>}
            </div>
          </div>

          <div className="actions">
            {isAdmin && <button type="button" className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>}
            <Link to="/templates" className="button">Edit form templates</Link>
            {status && <span className="muted small">{status}</span>}
          </div>
          {error && <div className="notice error">{error}</div>}
        </fieldset>

        <div className="settings-side">
        <div className="card account">
          <h2>Your account</h2>
          <p className="muted small">{session?.user.email} · {role ?? 'member'}</p>
          <SetPassword />
        </div>
        <div className="preview">
          <div className="preview-head"><span className="brand-label">Preview</span><span className="muted small">submittal transmittal, sample data</span></div>
          {preview ? <iframe title="Preview" src={preview + '#toolbar=0&view=FitH'} /> : <div className="muted small">Building preview…</div>}
        </div>
        </div>
      </div>
    </section>
  )
}
