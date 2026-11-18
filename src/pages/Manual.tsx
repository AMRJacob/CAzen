import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle } from '../components/PageTitle'
import { PdfPreview } from '../components/PdfPreview'
import { PageThumb } from '../components/PageThumb'
import { useProject } from '../lib/project'
import { message } from '../lib/errors'
import { readFile } from '../lib/files'
import { ISSUANCE_LABELS, type IssuanceKind, type Project } from '../lib/types'
import {
  byDivision, listManual, listSectionRevisions, renameSection, saveManual, searchManual,
  type CurrentSpec, type SectionToSave, type SpecHit, type SpecRevision,
} from '../lib/manual'
import { cutSection, bodyOf, readManual, FRONT, type ManualPage, type ManualSection } from '../lib/pdf/splitManual'
import { existingSets, suggestSetName, type SetName } from '../lib/sheets'
import { useClickAway } from '../lib/clickAway'

/**
 * The project manual, section by section.
 *
 * A manual is a book nobody reads as a book. It is consulted: somebody wants 09 91 00, or wants
 * every place the word "sealant" appears, and wants to know whether what they are reading is
 * still what is in force. So the page is an index and a search box, and the unit of everything —
 * opening, reissuing, superseding — is the section.
 */

const today = () => new Date().toISOString().slice(0, 10)

const usDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${m}/${d}/${y}` : iso
}

const issuanceText = (kind: IssuanceKind, number: string | null) =>
  !number ? ISSUANCE_LABELS[kind] : /[a-z]/i.test(number) ? number : `${ISSUANCE_LABELS[kind]} ${number}`

export default function Manual() {
  const { current } = useProject()
  const [sections, setSections] = useState<CurrentSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SpecHit[] | null>(null)
  const [allRevs, setAllRevs] = useState(false)
  const [open, setOpen] = useState<{ title: string; bytes: Uint8Array } | null>(null)
  const [shut, setShut] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    if (!current) { setSections([]); setLoading(false); return }
    setLoading(true)
    listManual(current.id)
      .then(setSections)
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false))
  }, [current])
  useEffect(() => { load() }, [load])

  // Searching the manual's words, a moment after typing stops.
  useEffect(() => {
    const q = query.trim()
    if (!current || q.length < 2) { setHits(null); return }
    const t = window.setTimeout(() => {
      searchManual(current.id, q, allRevs).then(setHits).catch((e) => setError(message(e)))
    }, 300)
    return () => window.clearTimeout(t)
  }, [current, query, allRevs])

  const groups = useMemo(() => byDivision(sections), [sections])

  async function show(path: string, title: string) {
    if (!current) return
    try {
      const bytes = await readFile(current, path)
      setOpen({ title, bytes: new Uint8Array(bytes) })
    } catch (e) { setError(message(e)) }
  }

  if (!current) {
    return (
      <section>
        <PageTitle>Project manual</PageTitle>
        <div className="card muted">Choose a project first, on the <Link to="/">Projects</Link> page.</div>
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <PageTitle>Project manual</PageTitle>
          <p className="lead">{current.number} {current.name} · {sections.length} {sections.length === 1 ? 'section' : 'sections'}</p>
        </div>
        {!uploading && (
          <button className="primary desk-only" onClick={() => setUploading(true)}>
            {sections.length ? 'Issue revised sections' : 'Upload the manual'}
          </button>
        )}
      </div>

      {uploading && (
        <ManualUpload
          project={current}
          existing={sections}
          onDone={() => { setUploading(false); load() }}
          onCancel={() => setUploading(false)}
        />
      )}

      {error && <div className="notice error">{error}</div>}

      {!uploading && (
        <div className="manual-find">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the manual — sealant, submittal, 09 91 00…" aria-label="Search the manual" />
          {query.trim().length >= 2 && (
            <label className="manual-allrevs">
              <input type="checkbox" checked={allRevs} onChange={(e) => setAllRevs(e.target.checked)} />
              Superseded issues too
            </label>
          )}
        </div>
      )}

      {hits && (
        <div className="card manual-hits">
          <p className="muted small">{hits.length === 0 ? `Nothing in the manual matches “${query.trim()}”.` : `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`}</p>
          {hits.map((h) => (
            <button key={h.revision_id} className="manual-hit" onClick={() => show(h.file_path, `${h.number} ${h.title ?? ''}`)}>
              <span className="manual-hit-head">
                <span className="mono">{h.number}</span>
                <span>{h.title ?? ''}</span>
                {!h.is_current && <span className="tag muted">superseded</span>}
              </span>
              <span className="manual-hit-snippet">{snippet(h.snippet)}</span>
            </button>
          ))}
        </div>
      )}

      {!uploading && !hits && (
        loading ? <p className="muted">Reading the manual…</p>
        : sections.length === 0 ? (
          <div className="card muted">
            No manual yet. Upload the book and CAzen cuts it into sections, so an addendum can
            replace 09 91 00 without replacing anything else.
          </div>
        ) : (
          <div className="card">
            {groups.map((g) => (
              <div key={g.key} className="manual-division">
                <button className="manual-division-head" aria-expanded={!shut[g.key]}
                  onClick={() => setShut((v) => ({ ...v, [g.key]: !v[g.key] }))}>
                  <span className={`sv-caret${shut[g.key] ? ' shut' : ''}`} aria-hidden="true">›</span>
                  <span className="manual-division-name">{g.label}</span>
                  <span className="sv-band-count">{g.items.length}</span>
                </button>
                {!shut[g.key] && (
                  <table className="manual-table">
                    <tbody>
                      {g.items.map((s) => (
                        <SectionRow key={s.section_id} section={s} project={current}
                          onOpen={() => show(s.file_path, `${s.number} ${s.title ?? ''}`)}
                          onOpenPath={show} onChanged={load} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {open && <PdfPreview bytes={open.bytes} title={open.title} onClose={() => setOpen(null)} />}
    </section>
  )
}

function snippet(s: string) {
  return s.split(/(«[^»]*»)/).map((part, i) => part.startsWith('«') ? <mark key={i}>{part.slice(1, -1)}</mark> : part)
}

function SectionRow({ section, project, onOpen, onOpenPath, onChanged }: {
  section: CurrentSpec
  project: Project
  onOpen: () => void
  onOpenPath: (path: string, title: string) => void
  onChanged: () => void
}) {
  const [history, setHistory] = useState<SpecRevision[] | null>(null)
  const [shown, setShown] = useState(false)
  const [editing, setEditing] = useState<{ number: string; title: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useClickAway(box, () => { if (!saving) setEditing(null) }, !!editing)

  async function toggle() {
    if (!shown && !history) setHistory(await listSectionRevisions(section.section_id).catch(() => []))
    setShown(!shown)
  }

  async function save() {
    if (!editing || saving) return
    setSaving(true)
    setProblem(null)
    try {
      await renameSection(section.section_id, editing)
      setEditing(null)
      onChanged()
    } catch (e) { setProblem(message(e)) } finally { setSaving(false) }
  }

  return (
    <>
      <tr className="opens" tabIndex={0} role="button" aria-label={`Open ${section.number}`}
        onClick={(e) => { if (!editing && !(e.target as HTMLElement).closest('button')) onOpen() }}
        onContextMenu={(e) => { e.preventDefault(); setEditing({ number: section.number, title: section.title ?? '' }) }}
        onKeyDown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}>
        <td className="mono manual-number">{section.number === FRONT ? '' : section.number}</td>
        <td className="manual-title">{section.title ?? (section.number === FRONT ? 'Front matter' : '')}</td>
        <td className="manual-pages muted small">{section.pages ? `${section.pages} ${section.pages === 1 ? 'page' : 'pages'}` : ''}</td>
        <td className="manual-from">{issuanceText(section.issuance_kind, section.issuance_number)}</td>
        <td className="col-date">{usDate(section.issued_on)}</td>
        <td className="col-history">
          {section.revision_count > 1
            ? <button className="link" onClick={toggle}>{shown ? 'Hide' : `${section.revision_count} issues`}</button>
            : <span className="muted">original</span>}
        </td>
      </tr>
      {editing && (
        <tr className="confirm-row"><td colSpan={6}>
          <div ref={box}>
            <div className="sheet-edit">
              <label className="f-number">Section
                <input value={editing.number} autoFocus aria-label="Section number"
                  onChange={(e) => setEditing({ ...editing, number: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(null) }} />
              </label>
              <label className="f-title">Title
                <input value={editing.title} aria-label="Section title"
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(null) }} />
              </label>
              <div className="sheet-edit-go">
                <button className="primary-lite" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              </div>
            </div>
            {problem && <p className="muted small"><span className="bad-text">{problem}</span></p>}
          </div>
        </td></tr>
      )}
      {shown && history?.map((r) => (
        <tr key={r.id} className="history opens" tabIndex={0} role="button"
          onClick={() => onOpenPath(r.file_path, `${section.number} ${r.title_at_rev ?? section.title ?? ''}`)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPath(r.file_path, section.number) } }}>
          <td />
          <td className="manual-title">{r.title_at_rev ?? ''}</td>
          <td className="manual-pages muted small">{r.pages ? `${r.pages} ${r.pages === 1 ? 'page' : 'pages'}` : ''}</td>
          <td className="manual-from">{r.issuances ? issuanceText(r.issuances.kind, r.issuances.number) : ''}</td>
          <td className="col-date">{r.issuances ? usDate(r.issuances.issued_on) : ''}</td>
          <td className="col-history">
            {r.revision_index === section.revision_index ? <span className="tag">current</span> : <span className="tag muted">superseded</span>}
          </td>
        </tr>
      ))}
      {void project}
    </>
  )
}

// ---------- Uploading ----------

interface Draft extends ManualSection {
  include: boolean
  touched?: boolean
}

/**
 * Putting a manual in, or putting four sections of one back in.
 *
 * The cut is offered for review before anything is saved, because a manual cut in the wrong
 * place is worse than one not cut at all — and the thing that makes review quick is seeing the
 * first page of each section next to the number read off it.
 */
function ManualUpload({ project, existing, onDone, onCancel }: {
  project: Project
  existing: CurrentSpec[]
  onDone: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<'pick' | 'reading' | 'review' | 'saving'>('pick')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<ArrayBuffer | null>(null)
  const [pages, setPages] = useState<ManualPage[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [firsts, setFirsts] = useState<Record<string, Uint8Array>>({})
  const [peek, setPeek] = useState<number | null>(null)

  const [kind, setKind] = useState<IssuanceKind>(existing.length ? 'addendum' : 'bid_set')
  const [number, setNumber] = useState('')
  const [namedByHand, setNamedByHand] = useState(false)
  const [sets, setSets] = useState<SetName[]>([])
  const [issuedOn, setIssuedOn] = useState(today())
  useEffect(() => { existingSets(project.id).then(setSets).catch(() => setSets([])) }, [project.id])
  useEffect(() => { if (!namedByHand) setNumber(suggestSetName(kind, sets)) }, [kind, sets, namedByHand])

  const [dragOver, setDragOver] = useState(false)

  async function onFiles(list: File[]) {
    const pdf = list.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdf) { setError('Drop a PDF.'); return }
    setStep('reading')
    setError(null)
    try {
      const buf = await pdf.arrayBuffer()
      const { pages: read, sections } = await readManual(buf, (done, total) => setProgress(`${done} of ${total} pages`))
      setFile(buf)
      setPages(read)
      setDrafts(sections.map((s) => ({ ...s, include: true })))
      setStep('review')
    } catch (e) {
      setError(message(e))
      setStep('pick')
    }
  }

  // The first page of each section, cut on demand, so the review has something to look at.
  useEffect(() => {
    if (!file || step !== 'review') return
    let stop = false
    ;(async () => {
      for (const d of drafts) {
        if (stop) return
        const key = `${d.pages[0]}`
        if (firsts[key]) continue
        try {
          const bytes = await cutSection(file, [d.pages[0]])
          if (stop) return
          setFirsts((f) => ({ ...f, [key]: bytes }))
        } catch { /* a page that won't cut shows no picture, which is not fatal */ }
      }
    })()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, step, drafts.length])

  const edit = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch, touched: true } : d)))

  /** Fold a section into the one before it: the cut was in the wrong place. */
  const joinUp = (i: number) => setDrafts((ds) => {
    if (i === 0) return ds
    const out = ds.slice()
    out[i - 1] = { ...out[i - 1], pages: [...out[i - 1].pages, ...out[i].pages], guessed: true }
    out.splice(i, 1)
    return out
  })

  /** Start a new section at a page inside this one. */
  const splitAt = (i: number, at: number) => setDrafts((ds) => {
    const d = ds[i]
    const cut = d.pages.indexOf(at)
    if (cut <= 0) return ds
    const before = { ...d, pages: d.pages.slice(0, cut) }
    const page = pages[at]
    const after: Draft = {
      number: page?.found ?? '', title: '', pages: d.pages.slice(cut), guessed: !page?.found,
      include: d.include, touched: true,
    }
    const out = ds.slice()
    out.splice(i, 1, before, after)
    return out
  })

  const chosen = drafts.filter((d) => d.include)
  const blank = chosen.filter((d) => !d.number.trim()).length
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const d of chosen) {
    const n = d.number.trim()
    if (!n) continue
    if (seen.has(n)) duplicates.add(n)
    seen.add(n)
  }
  const known = new Set(existing.map((s) => s.number))

  async function save() {
    if (!file) return
    setStep('saving')
    setError(null)
    try {
      const out: SectionToSave[] = []
      for (const d of chosen) {
        setProgress(`cutting ${d.number}`)
        out.push({
          number: d.number.trim(),
          title: d.title.trim(),
          revisionLabel: number,
          pages: d.pages.length,
          bytes: await cutSection(file, d.pages),
          body: bodyOf(d.pages.map((p) => pages[p]).filter(Boolean)),
        })
      }
      await saveManual(project, { kind, number, issuedOn }, out, (done, total, section) =>
        setProgress(`${done} of ${total} · ${section}`))
      onDone()
    } catch (e) {
      setError(message(e))
      setStep('review')
    }
  }

  return (
    <div className="card upload">
      <h3>{existing.length ? 'Issue revised sections' : 'Upload the project manual'}</h3>
      <p className="muted small">
        {existing.length
          ? 'Sections in this upload replace the ones with the same number; the earlier issue stays in that section’s history.'
          : 'The book is cut into sections so an addendum can replace one without replacing the rest. Every cut is shown before anything is saved.'}
      </p>

      <div className="upload-head">
        <label>Issued as
          <select value={kind} onChange={(e) => setKind(e.target.value as IssuanceKind)}>
            {(Object.keys(ISSUANCE_LABELS) as IssuanceKind[]).map((k) => <option key={k} value={k}>{ISSUANCE_LABELS[k]}</option>)}
          </select>
        </label>
        <label>Set name
          <input value={number} placeholder="Addendum 2, ASI-003…"
            onChange={(e) => { setNamedByHand(true); setNumber(e.target.value) }} />
        </label>
        <label>Issue date<input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></label>
      </div>

      {step === 'pick' && (
        <div className={`drop${dragOver ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles([...e.dataTransfer.files]) }}>
          <p>Drop the manual here, or <label className="link">choose a file
            <input type="file" accept="application/pdf" hidden onChange={(e) => onFiles([...(e.target.files ?? [])])} />
          </label>.</p>
        </div>
      )}

      {step === 'reading' && <p className="muted">Reading the manual… {progress}</p>}

      {(step === 'review' || step === 'saving') && (
        <>
          <p className="muted small">
            {drafts.length} {drafts.length === 1 ? 'section' : 'sections'} across {pages.length} pages.
            {drafts.some((d) => d.guessed) && ' Sections marked “check” ran on past a page that didn’t say which section it was.'}
          </p>
          <table className="manual-review">
            <thead><tr>
              <th>
                <input type="checkbox" aria-label="Include every section"
                  checked={drafts.length > 0 && drafts.every((d) => d.include)}
                  ref={(el) => { if (el) el.indeterminate = drafts.some((d) => d.include) && !drafts.every((d) => d.include) }}
                  onChange={(e) => setDrafts((ds) => ds.map((d) => ({ ...d, include: e.target.checked })))} />
              </th>
              <th>View</th><th>Section</th><th>Title</th><th>Pages</th><th>Result</th><th />
            </tr></thead>
            <tbody>
              {drafts.map((d, i) => {
                const n = d.number.trim()
                const first = firsts[`${d.pages[0]}`]
                return (
                  <tr key={`${d.pages[0]}-${i}`} className={d.include ? '' : 'skipped'}>
                    <td>
                      <input type="checkbox" checked={d.include} aria-label={`Include ${n || 'this section'}`}
                        onChange={(e) => setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
                    </td>
                    <td className="thumb-cell">
                      {first
                        ? <PageThumb bytes={first} label={n || `page ${d.pages[0] + 1}`} onOpen={() => setPeek(i)} />
                        : <span className="muted small">…</span>}
                    </td>
                    <td><input className={`cell mono ${d.include && (!n || duplicates.has(n)) ? 'bad' : ''}`} value={d.number}
                      placeholder="09 91 00" onChange={(e) => edit(i, { number: e.target.value })} /></td>
                    <td><input className="cell" value={d.title} onChange={(e) => edit(i, { title: e.target.value })} /></td>
                    <td className="small nowrap">
                      {d.pages.length} ({d.pages[0] + 1}–{d.pages[d.pages.length - 1] + 1})
                      {d.guessed && <span className="unsure-note">check</span>}
                    </td>
                    <td className="small">
                      {!d.include ? 'skip' : !n ? <span className="bad-text">needs a number</span>
                        : duplicates.has(n) ? <span className="bad-text">twice in this upload</span>
                        : known.has(n) ? 'replaces current' : 'new section'}
                    </td>
                    <td className="right nowrap">
                      {i > 0 && <button className="link small" onClick={() => joinUp(i)} title="This section is really part of the one above">join up</button>}
                      {d.pages.length > 1 && (
                        <button className="link small" onClick={() => splitAt(i, d.pages[1])} title="Start a new section at the second page of this one">split</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="actions">
            <button className="primary" onClick={() => void save()}
              disabled={step === 'saving' || blank > 0 || duplicates.size > 0 || chosen.length === 0}>
              {step === 'saving' ? `Saving ${progress}…` : `Save ${chosen.length} ${chosen.length === 1 ? 'section' : 'sections'}`}
            </button>
            <button onClick={onCancel} disabled={step === 'saving'}>Cancel</button>
            {chosen.length > 0 && (
              <span className="muted small">
                {chosen.filter((d) => known.has(d.number.trim())).length} replace · {chosen.filter((d) => d.number.trim() && !known.has(d.number.trim())).length} new
              </span>
            )}
          </div>
        </>
      )}

      {peek !== null && drafts[peek] && firsts[`${drafts[peek].pages[0]}`] && (
        <PdfPreview
          bytes={firsts[`${drafts[peek].pages[0]}`]}
          title={`${drafts[peek].number || 'Section'} · first page`}
          onClose={() => setPeek(null)}
          step={{
            label: `${peek + 1} of ${drafts.length}`,
            onPrev: peek > 0 ? () => setPeek(peek - 1) : undefined,
            onNext: peek < drafts.length - 1 ? () => setPeek(peek + 1) : undefined,
          }}
          extra={(
            <Fragment>
              <label className="pv-field pv-number">Section
                <input className="mono" value={drafts[peek].number} onChange={(e) => edit(peek, { number: e.target.value })} />
              </label>
              <label className="pv-field pv-title">Title
                <input value={drafts[peek].title} onChange={(e) => edit(peek, { title: e.target.value })} />
              </label>
            </Fragment>
          )}
        />
      )}

      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
