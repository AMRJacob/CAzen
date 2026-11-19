import { flushSync } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OutlineTools } from '../components/OutlineTools'
import { outlineKey } from '../lib/outline'
import { Link } from 'react-router-dom'
import { PLACEHOLDER_BRAND, loadBrand, type Brand } from '../lib/brand'
import { isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFirm } from '../lib/firm'
import { useProject } from '../lib/project'
import { ProjectFolder } from '../components/ProjectFolder'
import { PdfPreview } from '../components/PdfPreview'
import { listIssued, nextNumber, openIssued, saveIssued, type IssuedForm } from '../lib/issued'
import { DIVISION_OPTIONS, divisionFor, nextInSection, normaliseSection, sectionOf } from '../lib/csi'
import { db } from '../lib/supabase'
import { defaultLayout } from '../lib/templates/defaults'
import { FORM_LABELS, firmValues, headingsIn, inputFieldsFor, outlineOf, tradeSuggestions, usDate, withHeading, type FieldDef } from '../lib/templates/fields'
import { momentOf, weatherAt } from '../lib/weather'
import { prependTo, renderForm } from '../lib/templates/render'
import { loadLayouts } from '../lib/templates/store'
import type { FormKind, Layout } from '../lib/templates/types'
import type { Project } from '../lib/types'
import { PhotoSheet } from '../components/PhotoSheet'
import { photosForPdf, sheetFor, type SheetState } from '../lib/photoSheetBytes'
import { appendPhotoPages } from '../lib/templates/photoPages'
import { remember, remembered } from '../lib/remembered'

/** A photograph that could go in the report's photo table, and what it was labelled. */
export interface ReportPhoto { path: string; label: string }

/** Fill in a form and download it on the firm's template. Most fields fill themselves in. */
export default function IssueForm({ kind, prefill, photos, sheetKey }: {
  kind: FormKind
  /** Fields filled in before anybody types — a report written from the day's observations. */
  prefill?: Record<string, string>
  /** The day's photographs, offered as a table behind the report. */
  photos?: ReportPhoto[]
  /** What the table's crops and choices are remembered under — the page they belong to. */
  sheetKey?: string
}) {
  return isConfigured
    ? <SignedIn kind={kind} prefill={prefill} photos={photos} sheetKey={sheetKey} />
    : <Form kind={kind} brand={PLACEHOLDER_BRAND} layouts={{ general: defaultLayout('general'), [kind]: defaultLayout(kind) }} project={null} signer="" />
}

function SignedIn({ kind, prefill, photos, sheetKey }: { kind: FormKind; prefill?: Record<string, string>; photos?: ReportPhoto[]; sheetKey?: string }) {
  const { firm } = useFirm()
  const { current } = useProject()
  const { session } = useAuth()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [layouts, setLayouts] = useState<Record<string, Layout> | null>(null)

  useEffect(() => {
    if (!firm) return
    loadBrand(firm).then(setBrand)
    loadLayouts(firm.id, ['general', kind]).then(setLayouts)
  }, [firm, kind])

  if (!brand || !layouts) return <p className="muted">Loading your template…</p>
  const signer = (session?.user.user_metadata?.full_name as string | undefined) ?? ''
  return (
    <>
      {current && <ProjectFolder project={current} compact />}
      <Form key={`${kind}-${current?.id ?? ''}`} kind={kind} brand={brand} layouts={layouts}
        project={current} signer={signer} prefill={prefill} photos={photos} sheetKey={sheetKey} />
    </>
  )
}

function Form({ kind, brand, layouts, project, signer, prefill, photos, sheetKey }: {
  kind: FormKind; brand: Brand; layouts: Record<string, Layout>; project: Project | null
  signer: string; prefill?: Record<string, string>; photos?: ReportPhoto[]; sheetKey?: string
}) {
  const sheetAt = sheetKey ? `cazen.photoSheet.${sheetKey}` : null
  const [sheet, setSheet] = useState<SheetState>(() => sheetFor(photos ?? [], sheetAt ? remembered<SheetState>(sheetAt) : null))
  const changeSheet = (next: SheetState) => { setSheet(next); if (sheetAt) remember(sheetAt, next) }
  const layout = layouts[kind]
  const fields = useMemo(() => inputFieldsFor(kind, layout), [kind, layout])
  // Only ask for fields this firm's template actually prints.
  const used = useMemo(() => new Set(layout.elements.flatMap((e) => [...('field' in e ? [e.field] : []), ...(e.type === 'field' && e.combine ? e.combine.map((c) => c.field) : [])])), [layout])
  const shown = fields.filter((f) => used.has(f.key))

  const [log, setLog] = useState<IssuedForm[]>([])
  const [specs, setSpecs] = useState<{ number: string; title: string | null }[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>(prefill ?? {})
  const [attachment, setAttachment] = useState<ArrayBuffer | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ bytes: Uint8Array; name: string } | null>(null)
  const [weather, setWeather] = useState<string | null>(null)

  const loadLog = useCallback(async () => {
    if (project) setLog(await listIssued(project.id, kind).catch(() => []))
  }, [project, kind])
  useEffect(() => { loadLog() }, [loadLog])
  useEffect(() => {
    if (!project || !isConfigured || !fields.some((f) => f.csi === 'section')) return
    db().from('spec_sections').select('number, title').eq('project_id', project.id).order('number')
      .then(({ data }) => setSpecs((data ?? []) as { number: string; title: string | null }[]))
  }, [project, fields])

  // What CAzen fills in by itself. Recomputed as the log loads.
  const auto = useMemo(() => {
    const last = log[0]?.values ?? {}
    const today = usDate(new Date())
    const a: Record<string, string> = {
      'project.name': project?.name ?? '',
      'project.number': project?.number ?? '',
      'project.owner': project?.owner_name ?? '',
      'project.contractor': project?.contractor_name ?? '',
      'project.address': project?.address ?? '',
    }
    for (const f of fields) {
      if (f.auto === 'today') a[f.key] = today
      else if (f.auto === 'user') a[f.key] = signer
      else if (f.auto === 'next') {
        const prev = log[0]?.number ?? last[f.key]
        const section = f.csi === 'section' && prev ? sectionOf(prev) : null
        a[f.key] = section ? nextInSection(section, log.map((l) => l.number ?? '')) : f.csi === 'section' ? '' : nextNumber(kind, prev)
      }
      else if (f.auto === 'carry' && last[f.key]) a[f.key] = last[f.key]
      else if (f.auto === 'outline') {
        // Last form's own headings, emptied out; the firm's starter when there isn't one yet.
        const carried = last[f.key] ? outlineOf(last[f.key]) : ''
        if (carried) a[f.key] = carried
        else if (f.starter) a[f.key] = f.starter
      }
      else if (f.auto === 'contractor') a[f.key] = project?.contractor_name ?? ''
      if (f.choices && !a[f.key]) {
        const el = layout.elements.find((e) => e.type === 'choices' && e.field === f.key)
        a[f.key] = el && el.type === 'choices' ? el.options[0]?.value ?? '' : f.choices[0].value
      }
    }
    return a
  }, [project, signer, log, fields, kind, layout])

  // What it was like at the site, once there's a date and time to ask about. Nothing waits on
  // this: it fills in behind you, and a blank just means it's yours to type.
  const frDate = overrides['fr.date'] ?? auto['fr.date'] ?? ''
  const frTime = overrides['fr.time'] ?? auto['fr.time'] ?? ''
  const lat = project?.latitude, lon = project?.longitude
  useEffect(() => {
    if (kind !== 'field_report' || lat == null || lon == null) { setWeather(null); return }
    const when = momentOf(frDate, frTime)
    if (!when) { setWeather(null); return }
    const stop = new AbortController()
    weatherAt(lat, lon, when, stop.signal).then(setWeather).catch(() => setWeather(null))
    return () => stop.abort()
  }, [kind, lat, lon, frDate, frTime])

  // The CSI division follows the submittal/section number as it's typed.
  const sectionField = fields.find((f) => f.csi === 'section')
  const liveAuto: Record<string, string> = { ...auto }
  for (const f of fields) {
    if (f.auto === 'division' && sectionField) liveAuto[f.key] = divisionFor(overrides[sectionField.key] ?? auto[sectionField.key] ?? '')
  }
  if (weather) liveAuto['fr.weather'] = weather
  const value = (k: string) => overrides[k] ?? liveAuto[k] ?? ''

  /** As-you-type suggestions for CSI fields. */
  const suggestions = (f: FieldDef): { value: string; label: string }[] => {
    if (f.csi === 'division') return DIVISION_OPTIONS.map((d) => ({ value: d, label: '' }))
    if (f.csi !== 'section') return []
    const used = log.map((l) => l.number ?? '')
    const known = new Map<string, string>()
    for (const sp of specs) known.set(sp.number, sp.title ?? '')
    for (const l of log) { const sec = sectionOf(l.number ?? ''); if (sec && !known.has(sec)) known.set(sec, l.values['sub.title'] ?? '') }
    const typed = normaliseSection(value(f.key))
    if (typed && !known.has(typed)) known.set(typed, '')
    return [...known.entries()].map(([sec, title]) => ({ value: nextInSection(sec, used), label: [title, divisionFor(sec)].filter(Boolean).join(' · ') }))
  }
  // Trades this project's earlier reports already used, so the suggestions are its own before
  // they are the standard list.
  const trades = useMemo(() => {
    if (kind !== 'field_report') return []
    const seen: string[] = []
    for (const l of log) for (const h of headingsIn(l.values['fr.observations'] ?? '')) if (!seen.includes(h)) seen.push(h)
    return seen
  }, [kind, log])

  const values = () => Object.fromEntries(fields.map((f) => [f.key, value(f.key)]))
  const set = (k: string, v: string) => setOverrides((o) => ({ ...o, [k]: v }))
  const reset = (k: string) => setOverrides((o) => { const n = { ...o }; delete n[k]; return n })

  async function build(mode: 'issue' | 'preview') {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const v = values()
      let bytes = await renderForm({ layout, letterhead: layouts.general, brand, values: { ...v, ...firmValues(brand) } })
      if (attachment) bytes = await prependTo(bytes, attachment)
      if (project && sheet.on && sheet.items.some((i) => i.use)) {
        bytes = await appendPhotoPages(bytes, await photosForPdf(project, sheet), {
          perRow: sheet.perRow, project: v['project.name'] ?? '', day: v['fr.date'] ?? '',
        })
      }
      const num = Object.entries(v).find(([k]) => k.endsWith('.number') && !k.startsWith('project.'))?.[1]
      const name = `${[v['project.number'], FORM_LABELS[kind], num].filter(Boolean).join(' - ')}.pdf`
      if (mode === 'preview') { setPreview({ bytes, name }); return }
      download(bytes, name)
      if (project && isConfigured) {
        await saveIssued(project, kind, v, bytes)
        setOverrides({})
        setAttachment(null)
        await loadLog()
        setStatus(`${FORM_LABELS[kind]} ${num ?? ''} saved to ${project.name}. The next one is ready below.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  /** Hand the finished PDF to the browser to save. */
  function download(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    // Long enough for the download to have started, then the blob can go.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  /** Start a new form from an earlier one (everything except its number and dates). */
  function startFrom(f: IssuedForm) {
    const o: Record<string, string> = {}
    for (const field of fields) {
      if (field.auto === 'next' || field.auto === 'today' || field.key === 'doc.date') continue
      if (f.values[field.key] != null && f.values[field.key] !== auto[field.key]) o[field.key] = f.values[field.key]
    }
    setOverrides(o)
    setStatus(`Started from ${f.number ?? 'an earlier form'}. Change what’s different and issue.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {!project && isConfigured && (
        <div className="notice">Choose a project in the sidebar and this form fills itself in, numbers itself, and keeps a record.</div>
      )}
      <div className="form card">
        {shown.map((f) => (
          <Input key={f.key} f={f} value={value(f.key)} onChange={(v) => set(f.key, v)} layout={layout}
            autoValue={liveAuto[f.key]} overridden={f.key in overrides && !!liveAuto[f.key]} onReset={() => reset(f.key)}
            suggestions={suggestions(f)}
            chips={f.key === 'fr.observations' ? tradeSuggestions(value(f.key), trades).slice(0, 10) : []} />
        ))}
        {kind === 'submittal_cover' && (
          <label className="wide">Contractor’s submittal (PDF) — added behind the transmittal
            <input type="file" accept="application/pdf" onChange={async (e) => setAttachment((await e.target.files?.[0]?.arrayBuffer()) ?? null)} />
          </label>
        )}
      </div>
      {project && sheet.items.length > 0 && <PhotoSheet project={project} state={sheet} onChange={changeSheet} />}
      <div className="actions">
        <button className="primary" onClick={() => build('issue')} disabled={busy}>
          {busy ? 'Building…' : project ? 'Issue & download' : 'Download PDF'}
        </button>
        <button onClick={() => build('preview')} disabled={busy}>Preview</button>
        {isConfigured && <Link to="/templates" className="small">Change this layout</Link>}
      </div>
      {status && <div className="notice">{status}</div>}
      {error && <div className="notice error">{error}</div>}

      {project && log.length > 0 && (
        <>
          <h2>Issued on this project</h2>
          <table>
            <thead><tr><th>No.</th><th>Subject</th><th>Issued</th><th /></tr></thead>
            <tbody>
              {log.map((f) => (
                <tr key={f.id}>
                  <td className="mono">{f.number ?? ''}</td>
                  <td>{f.title ?? ''}</td>
                  <td>{usDate(new Date(f.issued_at))}</td>
                  <td className="right nowrap">
                    <button className="link" onClick={() => startFrom(f)}>Start new from this</button>{' '}
                    {f.file_path && <button onClick={() => openIssued(project!, f.file_path!).catch((e) => setError(e instanceof Error ? e.message : String(e)))}>Open</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {preview && (
        <PdfPreview
          bytes={preview.bytes}
          title={preview.name}
          onClose={() => setPreview(null)}
          onDownload={() => download(preview.bytes, preview.name)}
        />
      )}
    </div>
  )
}

function Input({ f, value, onChange, layout, autoValue, overridden, onReset, suggestions = [], chips = [] }: {
  f: FieldDef; value: string; onChange: (v: string) => void; layout: Layout
  autoValue?: string; overridden: boolean; onReset: () => void; suggestions?: { value: string; label: string }[]
  /** Headings offered under the box, to add rather than type. */
  chips?: string[]
}) {
  const box = useRef<HTMLTextAreaElement | null>(null)
  const tag = overridden && value !== autoValue
    ? <button type="button" className="auto-reset" onClick={onReset} title={`Back to: ${autoValue}`}>↺ reset</button>
    : autoValue ? <span className="auto-tag">auto</span> : null
  const label = <span className="field-head">{f.label}{tag}</span>
  // Grey = filled in for you; bold = filled in for you and then changed.
  const changed = !!autoValue && value !== autoValue
  const state = !autoValue ? '' : changed ? 'is-changed' : 'is-auto'

  if (f.choices) {
    const el = layout.elements.find((e) => e.type === 'choices' && e.field === f.key)
    const options = el && el.type === 'choices' ? el.options : f.choices
    return (
      <label>{label}
        <select value={value} onChange={(e) => onChange(e.target.value)} className={state}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )
  }
  if (f.multiline) {
    const el = layout.elements.find((e) => e.type === 'field' && (e.field === f.key || e.combine?.some((c) => c.field === f.key)))
    const rich = el && el.type === 'field' && el.rich
    const table = layout.elements.some((e) => e.type === 'table' && e.field === f.key)
    return (
      <label className="wide">{label}
        {rich && <OutlineTools textarea={box} value={value} onChange={onChange} />}
        <textarea
          ref={box}
          rows={rich ? 12 : table ? 5 : 3}
          value={value}
          placeholder={table ? 'One per line: Name | Company | Email' : ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={rich ? (e) => indentKeys(e, onChange) : undefined}
          className={`${rich ? 'mono-ish' : ''} ${state}`}
        />
        {chips.length > 0 && (
          <span className="chips">
            <span className="chips-label">Add a trade:</span>
            {chips.map((t) => (
              <button key={t} type="button" className="chip" onClick={() => onChange(withHeading(value, t))}>{t}</button>
            ))}
          </span>
        )}
        {f.hint && <span className="hint">{f.hint}</span>}
        {rich && <span className="hint">Start lines with 1. or - for lists. Tab indents a sub-item (Shift+Tab outdents). Start a line with # for a bold heading.</span>}
      </label>
    )
  }
  const listId = suggestions.length ? `dl-${f.key.replace('.', '-')}` : undefined
  return (
    <label>{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={state}
        list={listId} autoComplete="off" placeholder={f.csi === 'section' ? 'Type a section, e.g. 09 30 00' : f.csi === 'division' ? 'Type a number or name' : ''} />
      {listId && (
        <datalist id={listId}>
          {suggestions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </datalist>
      )}
    </label>
  )
}

/** Enter carries the bullet on; Tab and Shift+Tab move the line in or out, marker and all. */
function indentKeys(e: React.KeyboardEvent<HTMLTextAreaElement>, onChange: (v: string) => void) {
  const ta = e.currentTarget
  outlineKey({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, isComposing: e.nativeEvent.isComposing, preventDefault: () => e.preventDefault() }, ta, (next) => {
    // Written and placed in one go, so the next letter typed lands after the new marker.
    flushSync(() => onChange(next.value))
    ta.setSelectionRange(next.start, next.end)
  })
}
