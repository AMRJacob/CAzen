import { useEffect, useRef, useState } from 'react'
import { pdfPageThumb } from '../lib/pdf/pdfjs'

/**
 * A small picture of a page, for telling sheets apart while naming them.
 *
 * A sheet number read off a title block is a guess until somebody looks at the sheet, and the
 * page numbers in the review table say nothing about what is on the page. A thumbnail is enough
 * to tell a floor plan from a schedule from somebody else's cover page — a scan with no text at
 * all is otherwise completely blind — and the title block itself is one tap away full size.
 *
 * Two things keep this honest on a 200-page upload: nothing is drawn until the row is close to
 * the screen, and drawing goes through one queue a couple of pages at a time, so scrolling
 * doesn't hand pdf.js two hundred documents at once.
 */

const WIDTH = 240 // device pixels: enough that a 120px cell stays sharp on a phone

const cache = new Map<string, string>()
const CACHE_LIMIT = 400
const queue: { key: string; bytes: Uint8Array; done: (url: string | null) => void }[] = []
let running = 0
const AT_ONCE = 2

/** A stable key per page buffer, so a page already drawn isn't drawn again on every re-read. */
let counter = 0
const keys = new WeakMap<object, string>()
function keyOf(bytes: Uint8Array): string {
  let key = keys.get(bytes)
  if (!key) { key = `p${counter++}`; keys.set(bytes, key) }
  return key
}

function pump() {
  while (running < AT_ONCE && queue.length) {
    const job = queue.shift()!
    const had = cache.get(job.key)
    if (had) { job.done(had); continue }
    running++
    pdfPageThumb(job.bytes, WIDTH)
      .then((url) => {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
        cache.set(job.key, url)
        job.done(url)
      })
      .catch(() => job.done(null))
      .finally(() => { running--; pump() })
  }
}

function ask(key: string, bytes: Uint8Array, done: (url: string | null) => void) {
  const had = cache.get(key)
  if (had) { done(had); return () => {} }
  const job = { key, bytes, done }
  queue.push(job)
  pump()
  return () => {
    const at = queue.indexOf(job)
    if (at >= 0) queue.splice(at, 1)
  }
}

export function PageThumb({ bytes, label, onOpen }: {
  bytes: Uint8Array
  label: string
  onOpen?: () => void
}) {
  const key = keyOf(bytes)
  const [url, setUrl] = useState<string | null>(() => cache.get(key) ?? null)
  const [failed, setFailed] = useState(false)
  const [near, setNear] = useState(() => cache.has(key))
  const box = useRef<HTMLButtonElement>(null)

  // Start drawing a little before the row arrives, so scrolling finds pictures already there.
  useEffect(() => {
    if (near || !box.current) return
    const el = box.current
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); watch.disconnect() }
    }, { rootMargin: '400px 0px' })
    watch.observe(el)
    return () => watch.disconnect()
  }, [near])

  useEffect(() => {
    const had = cache.get(key)
    if (had) { setUrl(had); return }
    setUrl(null)
    setFailed(false)
    if (!near) return
    return ask(key, bytes, (made) => {
      if (made) setUrl(made)
      else setFailed(true)
    })
  }, [key, bytes, near])

  return (
    <button
      ref={box}
      type="button"
      className="page-thumb"
      onClick={onOpen}
      disabled={!onOpen}
      title={onOpen ? `Look at ${label} full size` : label}
      aria-label={onOpen ? `Look at ${label} full size` : label}
    >
      {url
        ? <img src={url} alt="" />
        : <span className="page-thumb-wait">{failed ? '—' : ''}</span>}
    </button>
  )
}
