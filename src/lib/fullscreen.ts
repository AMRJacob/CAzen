import { useCallback, useEffect, useState } from 'react'

/**
 * Give the screen over to the drawings.
 *
 * Two things happen, and the second is the one that always works. CAzen hides its own chrome — the
 * sidebar, the headings, the padding — so the sheet list or the drawing has the whole window. And
 * where the browser allows it, the window itself goes fullscreen too, which takes the browser's
 * bars with it.
 *
 * On an iPhone that second part has long been refused: the Fullscreen API was dropped from iOS
 * while iPadOS kept it, so it is asked for rather than assumed, and nothing depends on the answer.
 * For a phone the honest route to a bar-free screen is Add to Home Screen, which the manifest now
 * supports; this is the in-between, and it costs one tap.
 *
 * The way out is the same button wherever you are, always on screen, saying what it does.
 */

type Fullscreenable = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

const element = () => document.documentElement as Fullscreenable
const browserIsIn = () => {
  const d = document as FullscreenDocument
  return !!(d.fullscreenElement || d.webkitFullscreenElement)
}
/** Whether this browser will take the window fullscreen for a plain element. */
export const windowFullscreenAvailable = () =>
  typeof document !== 'undefined'
  && (!!(document.fullscreenEnabled && element().requestFullscreen) || typeof element().webkitRequestFullscreen === 'function')

export function useFullscreen() {
  const [on, setOn] = useState(false)

  // The browser can leave fullscreen on its own — Escape, a swipe, a notification — so the app
  // follows it out rather than claiming to still be there.
  useEffect(() => {
    const sync = () => { if (!browserIsIn() && windowFullscreenAvailable()) setOn(false) }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('immersive', on)
    return () => document.body.classList.remove('immersive')
  }, [on])

  const toggle = useCallback(() => {
    const d = document as FullscreenDocument
    const next = !on
    setOn(next)
    // Ask the browser as well, and don't mind if it declines.
    void (async () => {
      try {
        if (next) await element().requestFullscreen?.() ?? element().webkitRequestFullscreen?.()
        else if (browserIsIn()) await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())
      } catch { /* Safari on a phone may simply say no; the app's own chrome still goes. */ }
    })()
  }, [on])

  return { on, toggle }
}
