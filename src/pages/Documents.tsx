import { useState } from 'react'
import { splitDrawingSet, disciplineOf, type SplitSheet } from '../lib/pdf/splitSet'

/**
 * Phase 1 starting point: drop in a combined drawing set, see it split into sheets
 * with detected sheet numbers. Saving each sheet as a revision comes next.
 */
export default function Documents() {
  const [sheets, setSheets] = useState<SplitSheet[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setSheets(await splitDrawingSet(await file.arrayBuffer()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function preview(s: SplitSheet) {
    const url = URL.createObjectURL(new Blob([s.bytes as BlobPart], { type: 'application/pdf' }))
    window.open(url, '_blank')
  }

  return (
    <section>
      <h1>Document control</h1>
      <p className="lead">Upload a drawing set PDF. Each page becomes a sheet; replacements later become new revisions.</p>

      <label className="upload">
        <input type="file" accept="application/pdf" onChange={onFile} disabled={busy} />
        {busy ? 'Splitting…' : 'Choose drawing set PDF'}
      </label>
      {error && <div className="notice error">{error}</div>}

      {sheets.length > 0 && (
        <table>
          <thead>
            <tr><th>Page</th><th>Detected sheet no.</th><th>Discipline</th><th /></tr>
          </thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.pageIndex}>
                <td>{s.pageIndex + 1}</td>
                <td>{s.detectedNumber ?? <span className="muted">not found — enter manually</span>}</td>
                <td>{s.detectedNumber ? disciplineOf(s.detectedNumber) : ''}</td>
                <td><button onClick={() => preview(s)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
