import { useRef, useState } from 'react'
import type { ProjectStore } from '../lib/files'
import { keepPhoto, photoUrl } from '../lib/photos'
import { message } from '../lib/errors'

/** A documentation photograph on the page an observation is being made on. */
export interface PagePhoto { path: string; label: string; inked: boolean }

/**
 * Choosing documentation photographs from the page for an observation (Jacob, 11/24): several at
 * once, their labels and anything drawn on them coming too, and — if asked — taken off the
 * page's Documentation photos.
 *
 * Each becomes a photograph of the observation's own, so tearing the page out can never take it:
 * one drawn on is copied with the drawing laid into the picture (so the markup goes wherever the
 * observation goes, the report included); one not drawn on is the same file when it is being
 * taken off the page, and otherwise a copy.
 */
export function PagePhotoPicker({ project, photos, tile, onTaken, onClose, onTrouble }: {
  project: ProjectStore
  photos: PagePhoto[]
  /** The photograph as the page shows it — with its ink — for the picker and for laying the ink in. */
  tile: (path: string) => React.ReactNode
  onTaken: (got: { paths: string[]; labels: string[]; offPage: string[] }) => void
  onClose: () => void
  onTrouble: (m: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [offPage, setOffPage] = useState(false)
  const [busy, setBusy] = useState(false)
  const grid = useRef<HTMLDivElement | null>(null)
  const flip = (p: string) => setPicked((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))

  /** The photograph with the ink drawn on it laid in, as one picture. */
  const flatten = async (path: string): Promise<Blob> => {
    const url = await photoUrl(project, path)
    try {
      const img = await load(url)
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      const svg = grid.current?.querySelector(`[data-path="${CSS.escape(path)}"] .nb-light-ink svg`) as SVGSVGElement | null
      if (svg) {
        const copy = svg.cloneNode(true) as SVGSVGElement
        copy.setAttribute('width', String(c.width)); copy.setAttribute('height', String(c.height))
        copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const ink = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
        try { g.drawImage(await load(ink), 0, 0, c.width, c.height) } finally { URL.revokeObjectURL(ink) }
      }
      return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('The photograph could not be copied.'))), 'image/jpeg', 0.9))
    } finally { URL.revokeObjectURL(url) }
  }

  const take = async () => {
    setBusy(true)
    try {
      const paths: string[] = []
      let n = 1
      for (const path of picked) {
        const p = photos.find((x) => x.path === path)!
        if (!p.inked && offPage) { paths.push(path); continue }
        paths.push(await keepPhoto(project, await flatten(path), p.label || 'Observation', n++))
      }
      onTaken({ paths, labels: picked.map((x) => photos.find((p) => p.path === x)?.label ?? '').filter(Boolean), offPage: offPage ? picked : [] })
    } catch (e) { onTrouble(message(e)) } finally { setBusy(false) }
  }

  return (
    <div className="take-ask" onClick={onClose}>
      <div className="take-card ppp" role="dialog" aria-label="Photographs from this page" onClick={(e) => e.stopPropagation()}>
        <h3>Photographs from this page</h3>
        <div ref={grid} className="ppp-grid">
          {photos.map((p) => (
            <button key={p.path} type="button" data-path={p.path} className={`ppp-tile${picked.includes(p.path) ? ' on' : ''}`} aria-pressed={picked.includes(p.path)} onClick={() => flip(p.path)}>
              <span className="ppp-pic">{tile(p.path)}</span>
              <span className="ppp-label">{p.label || <span className="muted">No label</span>}{p.inked ? ' · drawn on' : ''}</span>
              {picked.includes(p.path) && <span className="ppp-tick" aria-hidden="true">{picked.indexOf(p.path) + 1}</span>}
            </button>
          ))}
        </div>
        <label className="ppp-off"><input type="checkbox" checked={offPage} onChange={(e) => setOffPage(e.target.checked)} /> Remove from Documentation photos</label>
        <div className="actions">
          <button className="primary" disabled={!picked.length || busy} onClick={() => void take()}>{busy ? 'Adding…' : `Add ${picked.length || ''}`}</button>
          <button className="link" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('The photograph could not be read.')); i.src = src })
