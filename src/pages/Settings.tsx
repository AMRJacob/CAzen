import { addToProject, invite, listFirmPeople, listProjectAccess, PROJECT_ROLES, removeFromFirm, removeFromProject, setFirmRole, type FirmPerson, type ProjectRole } from '../lib/access'
import { addCustomTag, byTrade, listCustomTags, removeCustomTag, TagsNotSetUp, type Tag } from '../lib/tags'
import { PageTitle } from '../components/PageTitle'
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
import { r2Ready, storageUsage, type StorageUsage } from '../lib/files'
import { useProject } from '../lib/project'
import { FeedbackList } from '../components/Feedback'
import { PREFS, usePref } from '../lib/prefs'

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
      <PageTitle>Settings</PageTitle>
      <p className="lead">Your firm’s details and brand. Change them any time, for example when rebranding. Every new document uses the current settings.</p>
      {!isAdmin && <div className="notice">Only firm admins can change these settings.</div>}

      <Group id="firm" title="Firm, brand and your account" hint="Name, address, logo, letterhead, colours; your name on documents and your password" open>
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

      </Group>

      <Group id="forms" title="Forms and observation tags" hint="Form templates; the issue tags observations are raised under">
      {/* The form templates are a firm-wide setting like the rest of this page, so they live
          here rather than in the sidebar beside the project's own work. */}
      <div className="card settings-link-card">
        <div>
          <h2>Form templates</h2>
          <p className="muted small">The letterhead and layout every ASI, RFI response, field report and set of meeting notes is written on.</p>
        </div>
        <Link className="primary-lite" to="/templates">Open form templates</Link>
      </div>

      <TagSettings firmId={firm.id} />
      </Group>

      <Group id="drawings" title="Drawings" hint="Sheet order, title block templates, how the sheet list looks to you">
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
        <ViewPreferences />
      </div>
      </Group>

      <Group id="storage" title="File storage" hint="How much is used, and the limits">
      <StorageCard firm={firm} isAdmin={isAdmin} onSaved={reload} />
      </Group>

      {isAdmin && (
        <Group id="access" title="People and access" hint="Invite by email; who is on which project">
          <Access firmId={firm.id} me={session?.user.id ?? ''} />
        </Group>
      )}

      <Group id="requests" title="Requests and issues" hint="The wishlist and bug reports">
      <FeedbackList />
      </Group>
    </section>
  )
}

/**
 * How this person likes CAzen to look, on this computer.
 *
 * Separate from everything else on this page, which is the firm's and the same for everyone.
 * These are not saved to the database and nobody else sees them, which is why they are not
 * behind the admin check.
 */
function ViewPreferences() {
  const [grouped, setGrouped] = usePref(PREFS.groupSheetList, true)
  const [widths, setWidths] = usePref<Record<string, number>>(PREFS.registerWidths, {})
  const sized = Object.keys(widths).length

  return (
    <div className="card">
      <h2>Your view</h2>
      <p className="muted small">Just for you, on this computer. Nobody else sees these and they aren’t saved to the project.</p>
      <label className="check">
        <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
        Group the sheet list by trade, with headings that fold away
      </label>
      <p className="muted small">
        In the sheet viewer, the list down the side is split into trades you can collapse, rather than one run of
        ninety sheets. Turn it off for a plain list in sheet order.
      </p>
      {sized > 0 && (
        <p className="small">
          Drawings columns have been resized.{' '}
          <button className="link" onClick={() => setWidths({})}>Reset column widths</button>
        </p>
      )}
    </div>
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

const GB = 1024 ** 3, MB = 1024 ** 2
const size = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)

/** How full CAzen file storage is, per project, and the limits that keep it inside the free allowance. */
function StorageCard({ firm, isAdmin, onSaved }: { firm: Firm; isAdmin: boolean; onSaved: () => Promise<void> }) {
  const { projects } = useProject()
  const [ready, setReady] = useState<boolean | null>(null)
  const [u, setU] = useState<StorageUsage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cap, setCap] = useState(String(firm.storage_cap_gb ?? 9.5))
  const [maxFile, setMaxFile] = useState(String(firm.max_file_mb ?? 100))
  const [saved, setSaved] = useState<string | null>(null)

  const load = async (fresh = false) => {
    setBusy(true)
    setError(null)
    try { setU(await storageUsage(fresh)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  useEffect(() => { r2Ready().then((ok) => { setReady(ok); if (ok) load() }) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function saveLimits() {
    const c = Number(cap), m = Number(maxFile)
    if (!(c > 0) || !(m > 0)) { setSaved('Enter numbers above zero.'); return }
    const { error } = await db().from('firms').update({ storage_cap_gb: c, max_file_mb: m }).eq('id', firm.id)
    if (error) { setSaved(error.message); return }
    await onSaved()
    setSaved('Saved.')
    load()
  }

  const pct = u ? Math.min(100, (u.bytes / u.cap_bytes) * 100) : 0
  const name = (id: string) => {
    const p = projects.find((x) => x.id === id)
    return p ? `${p.number} ${p.name}` : 'Not in a current project'
  }
  const rows = u ? Object.entries(u.by_project).sort((a, b) => b[1].bytes - a[1].bytes) : []

  return (
    <div className="card storage-card">
      <h2>File storage</h2>
      {ready === false ? (
        <p className="muted small">CAzen file storage (Cloudflare R2) isn’t set up yet. Follow “File storage” in the setup guide, then come back here.</p>
      ) : !u ? (
        <p className="muted small">{busy ? 'Counting…' : error ?? 'Loading…'}</p>
      ) : (
        <>
          <div className="usage-head">
            <span><strong>{size(u.bytes)}</strong> of {size(u.cap_bytes)} used · {u.objects} files</span>
            <span className="muted small">
              Counted {u.counted_at ? new Date(u.counted_at).toLocaleString() : 'never'}{' '}
              <button className="link" onClick={() => load(true)} disabled={busy}>{busy ? 'Counting…' : 'Recount now'}</button>
            </span>
          </div>
          <div className={`usage-bar ${pct >= 90 ? 'full' : pct >= 75 ? 'high' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Storage used">
            <span style={{ width: `${pct}%` }} />
          </div>
          {pct >= 90 && <p className="small bad-text">Nearly full. Uploads stop at the limit until an admin raises it.</p>}
          {rows.length > 0 && (
            <table className="usage-table">
              <thead><tr><th>Project</th><th className="right">Files</th><th className="right">Size</th><th className="right">Share</th></tr></thead>
              <tbody>
                {rows.map(([id, r]) => (
                  <tr key={id}>
                    <td>{name(id)}</td>
                    <td className="right">{r.objects}</td>
                    <td className="right nowrap">{size(r.bytes)}</td>
                    <td className="right">{u.bytes ? Math.round((r.bytes / u.bytes) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Counted from the files actually in Cloudflare, so it stays right after files are removed there. It’s recounted when more than 10 minutes old; uploads in between are added as they happen.</p>
        </>
      )}
      {error && u && <div className="notice error">{error}</div>}

      <h3>Limits</h3>
      <div className="form two-col">
        <label>Storage limit (GB)
          <input type="number" min="0.5" step="0.5" value={cap} disabled={!isAdmin} onChange={(e) => setCap(e.target.value)} />
          <span className="hint">Cloudflare’s free allowance is 10 GB a month. Raise this past 10 only once billing is set up in Cloudflare.</span>
        </label>
        <label>Largest single file (MB)
          <input type="number" min="1" step="1" value={maxFile} disabled={!isAdmin} onChange={(e) => setMaxFile(e.target.value)} />
          <span className="hint">Applies to each sheet, form or photo after a set is split.</span>
        </label>
      </div>
      {isAdmin && (
        <div className="actions">
          <button className="primary" onClick={saveLimits}>Save limits</button>
          {saved && <span className="muted small">{saved}</span>}
        </div>
      )}
    </div>
  )
}


/**
 * The issue tags observations are raised under: the built-in ones by trade, and the firm's own.
 * A firm's tag can sit under an existing trade or bring a new trade, with its own colour.
 */
function TagSettings({ firmId }: { firmId: string }) {
  const [custom, setCustom] = useState<Tag[]>([])
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ trade: '', label: '', colour: '#3a6ea5' })
  const load = () => listCustomTags(firmId).then((t) => { setCustom(t); setMissing(false) })
    .catch((e) => { if (e instanceof TagsNotSetUp) setMissing(true); else setError((e as Error).message) })
  useEffect(() => { void load() }, [firmId])   // eslint-disable-line react-hooks/exhaustive-deps
  const groups = byTrade(custom)
  const known = groups.find((g) => g.trade.toLowerCase() === f.trade.trim().toLowerCase())

  return (
    <div className="card">
      <h2>Observation tags</h2>
      <p className="muted small">The kinds of issue an observation can be tagged with, by trade. A trade’s colour is the colour of its pins on the drawings. Yours are added to the built-in ones.</p>
      <div className="tag-groups">
        {groups.map((g) => (
          <div key={g.trade} className="tag-group">
            <span className="tag-group-name"><span className="tag-dot" style={{ background: g.colour }} />{g.trade}</span>
            {g.tags.map((t) => (
              <span key={t.label} className={`tag${t.own ? ' tag-own' : ''}`}>{t.label}
                {t.own && <button className="link" aria-label={`Remove ${t.label}`} onClick={() => removeCustomTag(t.own!).then(load).catch((e) => setError((e as Error).message))}>×</button>}
              </span>
            ))}
          </div>
        ))}
      </div>
      {missing ? (
        <p className="small notice warn">Adding your own tags needs one table that is not in the database yet (migration 0036). The built-in tags work without it.</p>
      ) : (
        <form className="inline-form tag-new" onSubmit={async (e) => {
          e.preventDefault()
          try { await addCustomTag(firmId, { ...f, colour: known ? null : f.colour }); setF({ ...f, label: '' }); await load() }
          catch (err) { if (err instanceof TagsNotSetUp) setMissing(true); else setError((err as Error).message) }
        }}>
          <input value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })} placeholder="Trade" list="tag-trades" aria-label="Trade" />
          <datalist id="tag-trades">{groups.map((g) => <option key={g.trade} value={g.trade} />)}</datalist>
          <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Tag, e.g. Firestopping missing" aria-label="Tag" />
          {!known && f.trade.trim() && <input type="color" value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} aria-label="Colour for this trade" />}
          <button disabled={!f.trade.trim() || !f.label.trim()}>Add tag</button>
        </form>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}


/**
 * One category of settings, folded away until it is wanted. The page had grown into one long
 * scroll; this makes it a short list of what there is, each opening in place. Which are open is
 * remembered on this device.
 */
function Group({ id, title, hint, open = false, children }: { id: string; title: string; hint: string; open?: boolean; children: React.ReactNode }) {
  const key = `cazen.pref.settingsOpen.${id}`
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(key); return v === null ? open : v === '1' } catch { return open }
  })
  return (
    <details className="set-group" open={isOpen}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setIsOpen(now)
        try { localStorage.setItem(key, now ? '1' : '0') } catch { /* fine */ }
      }}>
      <summary><span className="set-group-title">{title}</span><span className="set-group-hint">{hint}</span></summary>
      {isOpen && <div className="set-group-body">{children}</div>}
    </details>
  )
}


/**
 * Who has access, and to what. Owners and admins see every project, so they have nothing to
 * tick; everyone else is on exactly the projects ticked here. Inviting someone emails them a
 * link to choose a password and puts them on the projects chosen in the same step.
 */
function Access({ firmId, me }: { firmId: string; me: string }) {
  const { projects } = useProject()
  const [people, setPeople] = useState<FirmPerson[] | null>(null)
  const [on, setOn] = useState<Map<string, Set<string>>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [role, setRole] = useState<ProjectRole>('architect')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const active = projects.filter((p) => p.status !== 'archived')

  const load = async () => {
    try {
      const [p, a] = await Promise.all([listFirmPeople(firmId), listProjectAccess(projects.map((x) => x.id))])
      setPeople(p); setOn(a); setError(null)
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => { void load() }, [firmId, projects.length])   // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(person: FirmPerson, projectId: string, want: boolean) {
    // Shown first, kept after; put back if the server says no.
    setOn((m) => { const n = new Map(m); const s = new Set(n.get(person.user_id) ?? []); if (want) s.add(projectId); else s.delete(projectId); n.set(person.user_id, s); return n })
    try { if (want) await addToProject(projectId, person.user_id); else await removeFromProject(projectId, person.user_id) }
    catch (e) { setError((e as Error).message); void load() }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setSaid(null)
    try {
      const r = await invite(firmId, email.trim(), picked, role)
      setSaid(r.invited
        ? `Invitation sent to ${email.trim()}. They choose a password from the link, and will see ${picked.length ? `${picked.length} ${picked.length === 1 ? 'project' : 'projects'}` : 'no projects until they are added to one'}.`
        : `${email.trim()} already has an account${picked.length ? ` and has been added to ${picked.length} ${picked.length === 1 ? 'project' : 'projects'}` : ''}.`)
      setEmail(''); setPicked([])
      await load()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="access">
      <form className="card access-invite" onSubmit={send}>
        <h2>Invite someone</h2>
        <div className="inline-form">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email" />
          <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} aria-label="Their part on the projects">
            {(Object.keys(PROJECT_ROLES) as ProjectRole[]).map((r) => <option key={r} value={r}>{PROJECT_ROLES[r]}</option>)}
          </select>
          <button className="primary" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send invitation'}</button>
        </div>
        <div className="access-projects">
          {active.map((p) => (
            <label key={p.id} className="check small">
              <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((v) => (e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id)))} />
              {p.number} {p.name}
            </label>
          ))}
        </div>
        {said && <p className="small ok-text">{said}</p>}
      </form>

      {error && <div className="notice error">{error}</div>}
      {!people ? <p className="muted">Loading…</p> : (
        <table className="access-table">
          <thead><tr><th>Person</th><th>In the firm</th><th>Projects</th><th /></tr></thead>
          <tbody>
            {people.map((p) => {
              const all = p.role === 'owner' || p.role === 'admin'
              const theirs = on.get(p.user_id) ?? new Set<string>()
              return [
                <tr key={p.user_id}>
                  <td><strong>{p.full_name || p.email}</strong>{p.full_name && <div className="muted small">{p.email}</div>}
                    {!p.last_seen && <div className="muted small">Invited — has not signed in yet</div>}</td>
                  <td>
                    {p.role === 'owner' || p.user_id === me ? <span className="tag">{p.role}</span> : (
                      <select value={p.role} aria-label={`Role of ${p.email}`} onChange={async (e) => {
                        try { await setFirmRole(firmId, p.user_id, e.target.value as 'admin' | 'member'); await load() } catch (err) { setError((err as Error).message) }
                      }}>
                        <option value="member">Member — sees assigned projects</option>
                        <option value="admin">Admin — sees everything, manages access</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {all ? <span className="muted small">Every project</span> : (
                      <button className="link" onClick={() => setOpen(open === p.user_id ? null : p.user_id)}>
                        {theirs.size ? `${theirs.size} of ${active.length}` : 'None yet'} — {open === p.user_id ? 'done' : 'change'}
                      </button>
                    )}
                  </td>
                  <td className="right">
                    {p.role !== 'owner' && p.user_id !== me && (
                      <button className="link danger-link" onClick={async () => {
                        if (!window.confirm(`Remove ${p.email} from CAzen? They lose access to every project. Nothing they wrote is deleted.`)) return
                        try { await removeFromFirm(firmId, p.user_id, projects.map((x) => x.id)); await load() } catch (err) { setError((err as Error).message) }
                      }}>Remove</button>
                    )}
                  </td>
                </tr>,
                open === p.user_id && !all && (
                  <tr key={p.user_id + '-projects'} className="confirm-row"><td colSpan={4}>
                    <div className="access-projects">
                      {active.map((x) => (
                        <label key={x.id} className="check small">
                          <input type="checkbox" checked={theirs.has(x.id)} onChange={(e) => void toggle(p, x.id, e.target.checked)} />
                          {x.number} {x.name}
                        </label>
                      ))}
                    </div>
                  </td></tr>
                ),
              ]
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
