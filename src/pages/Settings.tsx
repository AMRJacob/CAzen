import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFirm } from '../lib/firm'
import { SetPassword, SignerName, useAuth } from '../lib/auth'
import { db } from '../lib/supabase'
import { brandFromFirm, loadBrand, removeBrandFile, uploadBrandFile, type Brand } from '../lib/brand'
import { sampleValues } from '../lib/templates/fields'
import { renderForm } from '../lib/templates/render'
import { logoColors } from '../lib/logoColors'
import { loadLayouts } from '../lib/templates/store'
import type { Layout } from '../lib/templates/types'
import type { Firm } from '../lib/types'
import { DisciplineOrderEditor } from '../components/DisciplineOrder'
import { effectiveOrder, type Discipline } from '../lib/disciplines'
import { deleteTemplate, listTemplates, saveTemplate, type TitleblockTemplate } from '../lib/titleblocks'

const SWATCHES = ['#5f7a61', '#4a6b82', '#8a6f4e', '#6b5b73', '#2f3a34', '#c8323a']

export default function Settings() {
  const { firm, isAdmin, reload, role } = useFirm()
  const { session } = useAuth()
  const [draft, setDraft] = useState<Firm>(firm!)
  const [assets, setAssets] = useState<Pick<Brand, 'logo' | 'letterhead'>>({})
  const [layouts, setLayouts] = useState<Record<string, Layout> | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fromLogo, setFromLogo] = useState<string[]>([])
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

  // Suggest accent colours from the logo whenever it changes.
  useEffect(() => {
    if (assets.logo) logoColors(assets.logo.bytes, assets.logo.type).then(setFromLogo)
    else setFromLogo([])
  }, [assets.logo])

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
          {fromLogo.length > 0 && (
            <div className="brand-row">
              <span className="brand-label">From your logo <span className="muted small">suggested accent colours</span></span>
              <div className="swatches">
                {fromLogo.map((c) => (
                  <button key={c} type="button" className={`swatch ${draft.accent_color.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }}
                    aria-label={`Use ${c} from logo`} title={c} onClick={() => setDraft({ ...draft, accent_color: c })} />
                ))}
              </div>
            </div>
          )}
          <div className="brand-row">
            <span className="brand-label">Accent colour <span className="muted small">titles, rules and stamp boxes</span></span>
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
          <div className="stack-label">Name on documents</div>
          <p className="hint">Fills “Reviewed by”, “Issued by” and similar fields on every form you issue.</p>
          <SignerName />
          <div className="stack-label">Password</div>
          <SetPassword />
        </div>
        <div className="preview">
          <div className="preview-head"><span className="brand-label">Preview</span><span className="muted small">submittal transmittal, sample data</span></div>
          {preview ? <iframe title="Preview" src={preview + '#toolbar=0&view=FitH'} /> : <div className="muted small">Building preview…</div>}
        </div>
        </div>
      </div>

      <div className="settings-grid drawings-settings">
        <div className="card">
          <h2>Sheet order</h2>
          <p className="muted small">The order disciplines appear in every project’s drawing list. A project can use its own order (Drawings → Sheet order).</p>
          <DisciplineOrderEditor
            key={JSON.stringify(firm.discipline_order ?? null)}
            value={effectiveOrder(firm.discipline_order)}
            disabled={!isAdmin}
            saveLabel="Save firm order"
            onSave={async (list: Discipline[]) => {
              const { error } = await db().from('firms').update({ discipline_order: list }).eq('id', firm.id)
              if (error) throw error
              await reload()
            }}
          />
        </div>
        <TitleblockList firmId={firm.id} isAdmin={isAdmin} />
      </div>
    </section>
  )
}

/** The firm's title block templates. New ones are drawn while uploading drawings, on a real sheet. */
function TitleblockList({ firmId, isAdmin }: { firmId: string; isAdmin: boolean }) {
  const [list, setList] = useState<TitleblockTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { listTemplates(firmId).then(setList).catch((e) => setError(e.message)) }, [firmId])

  async function rename(t: TitleblockTemplate, name: string) {
    if (!name.trim() || name === t.name) return
    try { const u = await saveTemplate({ ...t, name }); setList((l) => l!.map((x) => (x.id === t.id ? u : x))) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  async function remove(t: TitleblockTemplate) {
    try { await deleteTemplate(t.id); setList((l) => l!.filter((x) => x.id !== t.id)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="card">
      <h2>Title block templates</h2>
      <p className="muted small">Where CAzen reads the sheet number, title and revision mark on each title block layout. Draw new ones while uploading drawings (Drawings → Upload → New template), on a real sheet.</p>
      {error && <div className="notice error">{error}</div>}
      {!list ? <p className="muted small">Loading…</p> : list.length === 0 ? <p className="muted small">None yet.</p> : (
        <ul className="tb-list">
          {list.map((t) => (
            <li key={t.id}>
              <input defaultValue={t.name} aria-label="Template name" onBlur={(e) => rename(t, e.target.value)} />
              <span className="muted small">{Object.keys(t.regions).length} boxes</span>
              {isAdmin && <button className="link" onClick={() => remove(t)}>Delete</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
