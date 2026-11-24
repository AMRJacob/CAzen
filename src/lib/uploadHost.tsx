import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Project } from './types'
import type { Discipline } from './disciplines'

/**
 * Uploads live in the app's frame, not on the Drawings page, so one can carry on while the person
 * goes anywhere else in CAzen. While it saves (or reads a long file) it shrinks to a card in the
 * top-right corner with a progress bar; *Show* opens it again. Leaving the Drawings page no longer
 * stops it — only closing or reloading the tab does, and the browser asks first while one runs.
 *
 * The Drawings page opens one with `useUploads().open(...)` and listens for `UPLOADED` to reload.
 */

export interface UploadRequest {
  project: Project
  firmId: string
  order: Discipline[]
  existingNumbers: Set<string>
  existingTitles?: Map<string, string>
  initialFiles?: File[]
  /** A saved set opened again to re-sort its pages. */
  reopen?: string
}

/** Fired on window when an upload (or a re-sort) has been saved; detail is the project id. */
export const UPLOADED = 'cazen:uploaded'

interface Host {
  open: (req: UploadRequest) => void
  /** An upload is open, shown or in the corner. */
  busy: boolean
}

const Ctx = createContext<Host>({ open: () => {}, busy: false })
export const useUploads = () => useContext(Ctx)

// The upload screen is part of the Drawings page's code; it is fetched only when an upload opens.
const UploadIssuance = lazy(() => import('../pages/Documents').then((m) => ({ default: m.UploadIssuance })))

export function UploadHost({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(UploadRequest & { key: number }) | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const open = useCallback((r: UploadRequest) => { setDone(null); setReq({ ...r, key: Date.now() }) }, [])

  // A word in the corner when one finishes, for a few seconds.
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(null), 8000)
    return () => window.clearTimeout(t)
  }, [done])

  return (
    <Ctx.Provider value={{ open, busy: !!req }}>
      {children}
      {req && (
        <Suspense fallback={null}>
          <UploadIssuance
            key={req.key}
            project={req.project}
            firmId={req.firmId}
            order={req.order}
            existingNumbers={req.existingNumbers}
            existingTitles={req.existingTitles}
            initialFiles={req.initialFiles}
            reopen={req.reopen}
            onDone={(what) => {
              setReq(null)
              setDone(what ?? 'Upload saved')
              window.dispatchEvent(new CustomEvent(UPLOADED, { detail: req.project.id }))
            }}
            onCancel={() => setReq(null)}
          />
        </Suspense>
      )}
      {done && (
        <div className="upload-chip done" role="status">
          <span>{done}</span>
          <button className="link small" onClick={() => setDone(null)} aria-label="Close">×</button>
        </div>
      )}
    </Ctx.Provider>
  )
}
