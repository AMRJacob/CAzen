import { useEffect, useRef, useState } from 'react'
import { message } from '../lib/errors'
import { readFile, type ProjectStore } from '../lib/files'
import { getDocument } from '../lib/pdf/pdfjs'
import { readPageText, type PageText } from '../lib/pdf/pageText'
import { TitleblockEditor } from './TitleblockEditor'
import { renameSheet, setSheetDate, sheetDates } from '../lib/sheets'
import type { CurrentSheet } from '../lib/types'
import { listTemplates, readPage, readWith, type TitleblockTemplate } from '../lib/titleblocks'
import { niceTitle } from '../lib/titles'

/**
 * Sheets already uploaded, read again.
 *
 * An upload that went in with the wrong title block template — or before there was one — leaves
 * sheets with titles and dates that are wrong or missing. This opens each chosen sheet's own
 * file, reads its title block with the templates as they are now, and shows what it found
 * beside what is on record. Nothing changes until it is applied, and only the rows ticked.
 * The sheet number is shown but never changed from here: it is what everything else hangs on.
 */

interface Row {
  sheet: CurrentSheet
  /** The date on record for this revision. */
  was: string | null
  state: 'waiting' | 'reading' | 'read' | 'failed'
  title: string
  date: string
  number: string
  unsure: boolean
  apply: boolean
  /** Corrected by hand: a new template does not overwrite it. */
  touched?: boolean
  problem?: string
}

export function SheetReread({ project, firmId, sheets, onDone }: {
  project: ProjectStore
  firmId: string
  sheets: CurrentSheet[]
  onDone: (changed: number) => void
}) {
  const [rows, setRows] = useState<Row[]>(() => sheets.map((sheet) => ({ sheet, was: null, state: 'waiting', title: '', date: '', number: '', unsure: false, apply: false })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const patch = (id: string, change: Partial<Row>) => setRows((all) => all.map((r) => (r.sheet.sheet_id === id ? { ...r, ...change } : r)))

  // Each sheet's file is opened once; its words are kept, so trying another template — or a
  // new one — reads them again without fetching anything.
  const held = useRef(new Map<string, { bytes: Uint8Array; text: PageText }>())
  const [templates, setTemplates] = useState<TitleblockTemplate[]>([])
  /** The template to read with; '' lets each sheet take whichever fits it best. */
  const [using, setUsing] = useState('')
  const [drawing, setDrawing] = useState(false)
  const dates = useRef(new Map<string, string | null>())
  // What to read with right now, for the sheets still on their way in: a template chosen or
  // made while a long selection is still being fetched applies to the rest as they arrive.
  const now = useRef<{ list: TitleblockTemplate[]; pick: string }>({ list: [], pick: '' })
  const [opened, setOpened] = useState(0)

  const readingOf = (sheet: CurrentSheet, text: PageText, list: TitleblockTemplate[], pick: string): Partial<Row> => {
    const one = pick ? list.find((t) => t.id === pick) : undefined
    const r = one ? readWith(text, one) : readPage(text, list)
    const title = niceTitle(r.title) ?? ''
    const differs = (!!title && title !== (niceTitle(sheet.title) ?? '')) || (!!r.date && r.date !== (dates.current.get(sheet.revision_id) ?? ''))
    return { state: 'read', title, date: r.date, number: r.number, unsure: !one && !!r.unsure, apply: differs && (!r.number || same(r.number, sheet.number)) }
  }
  /** Read everything already opened again, leaving alone what was corrected by hand. */
  const again = (list: TitleblockTemplate[], pick: string) => { now.current = { list, pick }; setRows((all) => all.map((r) => {
    const h = held.current.get(r.sheet.sheet_id)
    return h && !r.touched ? { ...r, ...readingOf(r.sheet, h.text, list, pick) } : r
  })) }

  useEffect(() => {
    let gone = false
    ;(async () => {
      const list = await listTemplates(firmId)
      dates.current = await sheetDates(sheets.map((x) => x.revision_id))
      if (gone) return
      setTemplates(list)
      now.current = { list, pick: '' }
      setRows((all) => all.map((r) => ({ ...r, was: dates.current.get(r.sheet.revision_id) ?? null })))
      for (const sheet of sheets) {
        if (gone) return
        patch(sheet.sheet_id, { state: 'reading' })
        try {
          const bytes = await readFile(project, sheet.file_path)
          // pdf.js takes the bytes it is given for its own; the copy is what the editor draws from.
          const pdf = await getDocument({ data: bytes.slice() }).promise
          const text = await readPageText(await pdf.getPage(1))
          void pdf.loadingTask.destroy()
          held.current.set(sheet.sheet_id, { bytes, text })
          setOpened((n) => n + 1)
          patch(sheet.sheet_id, readingOf(sheet, text, now.current.list, now.current.pick))
        } catch (e) {
          patch(sheet.sheet_id, { state: 'failed', problem: message(e) })
        }
      }
    })().catch((e) => setError(message(e)))
    return () => { gone = true }
    // The sheets chosen when this opened are the ones read; it is closed to choose others.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const picked = rows.filter((r) => r.apply && r.state === 'read')
  const left = rows.filter((r) => r.state === 'waiting' || r.state === 'reading').length

  async function apply() {
    setBusy(true); setError(null)
    let done = 0
    try {
      for (const r of picked) {
        await renameSheet(r.sheet.sheet_id, { number: r.sheet.number, title: r.title || r.sheet.title || '', filedUnder: r.sheet.filed_under }, r.sheet.revision_id)
        if (r.date && r.date !== (r.was ?? '')) await setSheetDate(r.sheet.revision_id, r.date)
        done++
      }
      onDone(done)
    } catch (e) { setError(`${message(e)} (${done} of ${picked.length} were changed before this.)`); setBusy(false) }
  }

  if (drawing) {
    const pages = rows.filter((r) => held.current.has(r.sheet.sheet_id)).map((r) => ({ ...held.current.get(r.sheet.sheet_id)!, label: r.sheet.number }))
    return (
      <div className="reread reread-draw" role="dialog" aria-label="New title block template">
        <div className="reread-card">
          <TitleblockEditor firmId={firmId} pages={pages}
            onCancel={() => setDrawing(false)}
            onSaved={(t) => {
              const list = [...templates.filter((x) => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name))
              setTemplates(list); setUsing(t.id); setDrawing(false)
              again(list, t.id)
            }} />
        </div>
      </div>
    )
  }

  return (
    <div className="reread" role="dialog" aria-label="Re-read titles and dates">
      <div className="reread-card">
        <div className="pad-head">
          <h3>Re-read titles and dates from the sheets</h3>
          <button className="link" onClick={() => onDone(0)}>Close</button>
        </div>
        <p className="muted small">
          Each sheet’s title block is read again with the title block templates as they are now. Tick what should replace what is on record; the read values can be corrected first. Sheet numbers are not changed here.
          {left > 0 && <strong> Reading {rows.length - left + 1} of {rows.length}…</strong>}
        </p>
        <div className="inline-form reread-with">
          <label className="small">Read with{' '}
            <select value={using} onChange={(e) => { setUsing(e.target.value); again(templates, e.target.value) }}>
              <option value="">Whichever template fits each sheet</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {/* Ready as soon as one sheet has been opened: with forty selected, waiting for the last
              of them before a template could be made looked like a button that did not work. */}
          <button onClick={() => setDrawing(true)} disabled={opened === 0}
            title="Draw boxes round the number, title and date on one of these sheets; the others are then read the same way">
            New template from these sheets…
          </button>
          {opened === 0 && rows.some((r) => r.state === 'failed') && left === 0 && <span className="muted small">None of these sheets could be opened, so there is nothing to draw on.</span>}
          {opened === 0 && left > 0 && <span className="muted small">Opening the first sheet…</span>}
        </div>
        <div className="reread-table">
          <table>
            <thead><tr><th /><th>Sheet</th><th>Title on record</th><th>Title read</th><th>Date on record</th><th>Date read</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const odd = r.state === 'read' && !!r.number && !same(r.number, r.sheet.number)
                return (
                  <tr key={r.sheet.sheet_id} className={r.apply ? '' : 'reread-off'}>
                    <td><input type="checkbox" checked={r.apply} disabled={r.state !== 'read'} aria-label={`Apply to ${r.sheet.number}`} onChange={(e) => patch(r.sheet.sheet_id, { apply: e.target.checked })} /></td>
                    <td className="mono">{r.sheet.number}
                      {odd && <div className="reread-warn" title="The title block read a different sheet number, so the wrong box may have been read">read as {r.number}</div>}
                      {r.unsure && !odd && <div className="reread-warn" title="Two templates fit this sheet about equally">check</div>}
                    </td>
                    <td>{niceTitle(r.sheet.title) || <span className="muted">—</span>}</td>
                    <td>{r.state === 'read'
                      ? <input className="cell" value={r.title} placeholder="Nothing read" aria-label="Title read" onChange={(e) => patch(r.sheet.sheet_id, { title: e.target.value, apply: true, touched: true })} />
                      : <span className="muted">{r.state === 'failed' ? r.problem : r.state === 'reading' ? 'Reading…' : ''}</span>}</td>
                    <td>{r.was ? usDay(r.was) : <span className="muted">—</span>}</td>
                    <td>{r.state === 'read' && <input className="cell" type="date" value={r.date} aria-label="Date read" onChange={(e) => patch(r.sheet.sheet_id, { date: e.target.value, apply: true, touched: true })} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="actions">
          <button className="primary" disabled={busy || left > 0 || !picked.length} onClick={() => void apply()}>
            {busy ? 'Changing…' : picked.length ? `Change ${picked.length} ${picked.length === 1 ? 'sheet' : 'sheets'}` : 'Nothing ticked'}
          </button>
          <button className="link" onClick={() => onDone(0)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const same = (a: string, b: string) => a.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === b.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const usDay = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${m}/${d}/${y}` }
