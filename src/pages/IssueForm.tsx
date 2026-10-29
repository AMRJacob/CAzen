import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PLACEHOLDER_BRAND, loadBrand, type Brand } from '../lib/brand'
import { isConfigured } from '../lib/supabase'
import { useFirm } from '../lib/firm'
import { useProject } from '../lib/project'
import { defaultLayout } from '../lib/templates/defaults'
import { FORM_LABELS, firmValues, inputFieldsFor, type FieldDef } from '../lib/templates/fields'
import { prependTo, renderForm } from '../lib/templates/render'
import { loadLayouts } from '../lib/templates/store'
import type { FormKind, Layout } from '../lib/templates/types'

const today = () => new Date().toISOString().slice(0, 10)

/** Fill in a form and download it on the firm's template. */
export default function IssueForm({ kind }: { kind: FormKind }) {
  return isConfigured ? <SignedIn kind={kind} /> : <Form kind={kind} brand={PLACEHOLDER_BRAND} layouts={{ general: defaultLayout('general'), [kind]: defaultLayout(kind) }} initial={{}} />
}

function SignedIn({ kind }: { kind: FormKind }) {
  const { firm } = useFirm()
  const { current } = useProject()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [layouts, setLayouts] = useState<Record<string, Layout> | null>(null)

  useEffect(() => {
    if (!firm) return
    loadBrand(firm).then(setBrand)
    loadLayouts(firm.id, ['general', kind]).then(setLayouts)
  }, [firm, kind])

  if (!brand || !layouts) return <p className="muted">Loading your template…</p>
  const initial: Record<string, string> = current
    ? { 'project.name': current.name, 'project.number': current.number, 'project.owner': current.owner_name ?? '', 'project.contractor': current.contractor_name ?? '', 'project.address': current.address ?? '' }
    : {}
  return <Form key={`${kind}-${current?.id ?? ''}`} kind={kind} brand={brand} layouts={layouts} initial={initial} />
}

function Form({ kind, brand, layouts, initial }: { kind: FormKind; brand: Brand; layouts: Record<string, Layout>; initial: Record<string, string> }) {
  const fields = inputFieldsFor(kind)
  const layout = layouts[kind]
  // Only ask for fields this firm's template actually prints.
  const used = useMemo(() => new Set(layout.elements.flatMap((e) => ('field' in e ? [e.field] : []))), [layout])
  const shown = fields.filter((f) => used.has(f.key))
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = { 'doc.date': today(), ...initial }
    for (const f of fields) if (f.choices && !v[f.key]) {
      const el = layout.elements.find((e) => e.type === 'choices' && e.field === f.key)
      v[f.key] = el && el.type === 'choices' ? el.options[0]?.value ?? '' : f.choices[0].value
    }
    return v
  })
  const [attachment, setAttachment] = useState<ArrayBuffer | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }))

  async function build(open: boolean) {
    setBusy(true)
    setError(null)
    try {
      let bytes = await renderForm({ layout, letterhead: layouts.general, brand, values: { ...values, ...firmValues(brand) } })
      if (attachment) bytes = await prependTo(bytes, attachment)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      if (open) window.open(url, '_blank')
      else {
        const a = document.createElement('a')
        const num = Object.entries(values).find(([k]) => k.endsWith('.number'))?.[1]
        a.href = url
        a.download = `${[values['project.number'], FORM_LABELS[kind], num].filter(Boolean).join(' - ')}.pdf`
        a.click()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="form card">
        {shown.map((f) => <Input key={f.key} f={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} layout={layout} />)}
        {kind === 'submittal_cover' && (
          <label className="wide">Contractor’s submittal (PDF) — added behind the cover
            <input type="file" accept="application/pdf" onChange={async (e) => setAttachment((await e.target.files?.[0]?.arrayBuffer()) ?? null)} />
          </label>
        )}
      </div>
      <div className="actions">
        <button className="primary" onClick={() => build(false)} disabled={busy}>{busy ? 'Building…' : 'Download PDF'}</button>
        <button onClick={() => build(true)} disabled={busy}>Preview</button>
        {isConfigured && <Link to="/templates" className="small">Change this layout</Link>}
      </div>
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}

function Input({ f, value, onChange, layout }: { f: FieldDef; value: string; onChange: (v: string) => void; layout: Layout }) {
  if (f.choices) {
    const el = layout.elements.find((e) => e.type === 'choices' && e.field === f.key)
    const options = el && el.type === 'choices' ? el.options : f.choices
    return (
      <label>{f.label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )
  }
  if (f.multiline) {
    const el = layout.elements.find((e) => e.type === 'field' && e.field === f.key)
    const rich = el && el.type === 'field' && el.rich
    const table = layout.elements.some((e) => e.type === 'table' && e.field === f.key)
    return (
      <label className="wide">{f.label}
        <textarea
          rows={rich ? 12 : table ? 5 : 3}
          value={value}
          placeholder={table ? 'One per line: Name | Company | Email' : ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={rich ? (e) => indentKeys(e, onChange) : undefined}
          className={rich ? 'mono-ish' : ''}
        />
        {rich && <span className="hint">Start lines with 1. or - for lists. Tab indents a sub-item (Shift+Tab outdents). Start a line with # for a bold heading.</span>}
      </label>
    )
  }
  return <label>{f.label}<input value={value} onChange={(e) => onChange(e.target.value)} type={f.key.endsWith('date') || /received|returned|forwarded|due/.test(f.key) ? 'text' : 'text'} /></label>
}

/** Tab / Shift+Tab indent or outdent the current line(s) by two spaces in outline fields. */
function indentKeys(e: React.KeyboardEvent<HTMLTextAreaElement>, onChange: (v: string) => void) {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const ta = e.currentTarget
  const { selectionStart: s, selectionEnd: end, value } = ta
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const block = value.slice(lineStart, end)
  const lines = block.split('\n')
  const next = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l)).join('\n')
  const updated = value.slice(0, lineStart) + next + value.slice(end)
  onChange(updated)
  const delta = next.length - block.length
  requestAnimationFrame(() => {
    ta.selectionStart = Math.max(lineStart, s + (e.shiftKey ? Math.max(-2, delta) : 2))
    ta.selectionEnd = end + delta
  })
}
