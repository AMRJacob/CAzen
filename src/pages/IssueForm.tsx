import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLACEHOLDER_BRAND, loadBrand, type Brand } from '../lib/brand'
import { isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useFirm } from '../lib/firm'
import { useProject } from '../lib/project'
import { listIssued, nextNumber, openIssued, saveIssued, type IssuedForm } from '../lib/issued'
import { DIVISION_OPTIONS, divisionFor, nextInSection, normaliseSection, sectionOf } from '../lib/csi'
import { db } from '../lib/supabase'
import { defaultLayout } from '../lib/templates/defaults'
import { FORM_LABELS, firmValues, inputFieldsFor, usDate, type FieldDef } from '../lib/templates/fields'
import { prependTo, renderForm } from '../lib/templates/render'
import { loadLayouts } from '../lib/templates/store'
import type { FormKind, Layout } from '../lib/templates/types'
import type { Project } from '../lib/types'

/** Fill in a form and download it on the firm's template. Most fields fill themselves in. */
export default function IssueForm({ kind }: { kind: FormKind }) {
  return isConfigured
    ? <SignedIn kind={kind} />
    : <Form kind={kind} brand={PLACEHOLDER_BRAND} layouts={{ general: defaultLayout('general'), [kind]: defaultLayout(kind) }} project={null} signer="" />
}

function SignedIn({ kind }: { kind: FormKind }) {
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
  return <Form key={`${kind}-${current?.id ?? ''}`} kind={kind} brand={brand} layouts={layouts} project={current} signer={signer} />
}

function Form({ kind, brand, layouts, project, signer }: {
  kind: FormKind; brand: Brand; layouts: Record<string, Layout>; project: Project | null; signer: string
}) {
  const layout = layouts[kind]
  const fields = useMemo(() => inputFieldsFor(kind, layout), [kind, layout])
  // Only ask for fields this firm's template actually prints.
  const used = useMemo(() => new Set(layout.elements.flatMap((e) => [...('field' in e ? [e.field] : []), ...(e.type === 'field' && e.combine ? e.combine.map((c) => c.field) : [])])), [layout])
  const shown = fields.filter((f) => used.has(f.key))

  const [log, setLog] = useState<IssuedForm[]>([])
  const [specs, setSpecs] = useState<{ number: string; title: string | null }[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [attachment, setAttachment] = useState<ArrayBuffer | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      else if (f.auto === 'contractor') a[f.key] = project?.contractor_name ?? ''
      if (f.choices && !a[f.key]) {
        const el = layout.elements.find((e) => e.type === 'choices' && e.field === f.key)
        a[f.key] = el && el.type === 'choices' ? el.options[0]?.value ?? '' : f.choices[0].value
      }
    }
    return a
  }, [project, signer, log, fields, kind, layout])

  // The CSI division follows the submittal/section number as it's typed.
  const sectionField = fields.find((f) => f.csi === 'section')
  const liveAuto: Record<string, string> = { ...auto }
  for (const f of fields) {
    if (f.auto === 'division' && sectionField) liveAuto[f.key] = divisionFor(overrides[sectionField.key] ?? auto[sectionField.key] ?? '')
  }
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
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      if (mode === 'preview') { window.open(url, '_blank'); return }
      const a = document.createElement('a')
      const num = Object.entries(v).find(([k]) => k.endsWith('.number') && !k.startsWith('project.'))?.[1]
      a.href = url
      a.download = `${[v['project.number'], FORM_LABELS[kind], num].filter(Boolean).join(' - ')}.pdf`
      a.click()
      if (project && isConfigured) {
        await saveIssued(project.id, kind, v, bytes)
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
            suggestions={suggestions(f)} />
        ))}
        {kind === 'submittal_cover' && (
          <label className="wide">Contractor’s submittal (PDF) — added behind the transmittal
            <input type="file" accept="application/pdf" onChange={async (e) => setAttachment((await e.target.files?.[0]?.arrayBuffer()) ?? null)} />
          </label>
        )}
      </div>
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
                    {f.file_path && <button onClick={() => openIssued(f.file_path!)}>Open</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function Input({ f, value, onChange, layout, autoValue, overridden, onReset, suggestions = [] }: {
  f: FieldDef; value: string; onChange: (v: string) => void; layout: Layout
  autoValue?: string; overridden: boolean; onReset: () => void; suggestions?: { value: string; label: string }[]
}) {
  const tag = overridden
    ? <button type="button" className="auto-reset" onClick={onReset} title={`Back to: ${autoValue}`}>↺ reset</button>
    : autoValue ? <span className="auto-tag">auto</span> : null
  const label = <span className="field-head">{f.label}{tag}</span>

  if (f.choices) {
    const el = layout.elements.find((e) => e.type === 'choices' && e.field === f.key)
    const options = el && el.type === 'choices' ? el.options : f.choices
    return (
      <label>{label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
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
        <textarea
          rows={rich ? 12 : table ? 5 : 3}
          value={value}
          placeholder={table ? 'One per line: Name | Company | Email' : ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={rich ? (e) => indentKeys(e, onChange) : undefined}
          className={`${rich ? 'mono-ish' : ''} ${autoValue && !overridden ? 'is-auto' : ''}`}
        />
        {f.hint && <span className="hint">{f.hint}</span>}
        {rich && <span className="hint">Start lines with 1. or - for lists. Tab indents a sub-item (Shift+Tab outdents). Start a line with # for a bold heading.</span>}
      </label>
    )
  }
  const listId = suggestions.length ? `dl-${f.key.replace('.', '-')}` : undefined
  return (
    <label>{label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className={autoValue && !overridden ? 'is-auto' : ''}
        list={listId} autoComplete="off" placeholder={f.csi === 'section' ? 'Type a section, e.g. 09 30 00' : f.csi === 'division' ? 'Type a number or name' : ''} />
      {listId && (
        <datalist id={listId}>
          {suggestions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </datalist>
      )}
    </label>
  )
}

/** Tab / Shift+Tab indent or outdent the current line(s) by two spaces in outline fields. */
function indentKeys(e: React.KeyboardEvent<HTMLTextAreaElement>, onChange: (v: string) => void) {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const ta = e.currentTarget
  const { selectionStart: s, selectionEnd: end, value } = ta
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const block = value.slice(lineStart, end)
  const next = block.split('\n').map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n')
  onChange(value.slice(0, lineStart) + next + value.slice(end))
  const delta = next.length - block.length
  requestAnimationFrame(() => {
    ta.selectionStart = Math.max(lineStart, s + (e.shiftKey ? Math.max(-2, delta) : 2))
    ta.selectionEnd = end + delta
  })
}
