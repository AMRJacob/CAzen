import { useEffect, useRef, useState } from 'react'
import { keepPhoto, photoUrl } from '../lib/photos'
import { message } from '../lib/errors'
import type { ProjectStore } from '../lib/files'

/**
 * The photographs on an observation.
 *
 * On a phone the button opens the camera; on a laptop it opens the file picker. Either way
 * what is kept is a resized JPEG, because thirty full-resolution photographs of sealant joints
 * is a morning of uploading for no gain in what anybody can see.
 */
export function Photos({ project, paths, about, editable, onChange, onTrouble }: {
  project: ProjectStore
  paths: string[]
  /** What the photographs are of, used to name the files. */
  about: string
  editable: boolean
  onChange: (paths: string[]) => void
  onTrouble: (m: string) => void
}) {
  const input = useRef<HTMLInputElement | null>(null)
  const library = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(0)

  async function take(files: FileList | null) {
    if (!files?.length) return
    setBusy(files.length)
    const kept: string[] = []
    for (const file of Array.from(files)) {
      try {
        kept.push(await keepPhoto(project, file, about, paths.length + kept.length + 1))
      } catch (e) { onTrouble(message(e)) }
      setBusy((n) => n - 1)
    }
    if (kept.length) onChange([...paths, ...kept])
    if (input.current) input.current.value = ''
    if (library.current) library.current.value = ''
  }

  return (
    <div className="photos">
      <div className="photo-strip">
        {paths.map((p) => (
          <Photo key={p} project={project} path={p} editable={editable}
            onRemove={() => onChange(paths.filter((x) => x !== p))} />
        ))}
        {busy > 0 && <div className="photo photo-waiting"><span className="muted small">{busy}…</span></div>}
        {editable && (
          <button type="button" className="photo photo-add" onClick={() => input.current?.click()}>
            <span aria-hidden="true">+</span>
            <span className="small">Camera</span>
          </button>
        )}
        {/* A phone's camera button opens the camera and nothing else, so photographs already
            taken — with the phone's own camera, on the walk — need their own way in. */}
        {editable && (
          <button type="button" className="photo photo-add" onClick={() => library.current?.click()}>
            <span aria-hidden="true">▦</span>
            <span className="small">Library</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => void take(e.target.files)} />
      <input ref={library} type="file" accept="image/*" multiple hidden
        onChange={(e) => void take(e.target.files)} />
    </div>
  )
}

function Photo({ project, path, editable, onRemove }: {
  project: ProjectStore
  path: string
  editable: boolean
  onRemove: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [big, setBig] = useState(false)

  useEffect(() => {
    let made: string | null = null
    let gone = false
    photoUrl(project, path).then((u) => {
      if (gone) { URL.revokeObjectURL(u); return }
      made = u
      setUrl(u)
    }).catch(() => { /* a photo that will not load is not worth an error banner */ })
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [project, path])

  return (
    <>
      <div className="photo">
        {url
          ? <img src={url} alt="" onClick={() => setBig(true)} />
          : <span className="muted small">…</span>}
        {editable && <button type="button" className="photo-drop" onClick={onRemove} aria-label="Remove this photo">×</button>}
      </div>
      {big && url && (
        <div className="photo-full" role="dialog" onClick={() => setBig(false)}>
          <img src={url} alt="" />
        </div>
      )}
    </>
  )
}
