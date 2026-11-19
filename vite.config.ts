import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'

/**
 * The service worker, written at build time because only the build knows what the files are
 * called. It is what lets CAzen open with no signal: everything the app is made of is put on the
 * device the first time it loads, and comes from there afterwards.
 *
 * Two rules. The page itself is asked for from the network first, briefly, so a new release is
 * picked up the moment there is signal to fetch it — and comes from the device when there isn't.
 * Everything else carries its own fingerprint in its name and never changes, so the device's copy
 * is always the right one.
 */
function serviceWorker(): Plugin {
  return {
    name: 'cazen-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js' && !f.startsWith('ocr/'))
      const fixed = ['manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'apple-touch-icon.png']
      const files = ['./', ...[...built, ...fixed].filter((f) => f !== 'index.html').map((f) => `./${f}`)]
      const version = Date.now().toString(36)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, files) })
    },
  }
}

/**
 * The reader for scanned pages (Tesseract), served from the app's own address so that reading a
 * scan depends on nothing but CAzen being reachable. About fifteen megabytes, none of it fetched
 * until a scanned PDF is opened, and none of it put on a phone ahead of time.
 */
function scanReader(): Plugin {
  const from = (p: string) => readFileSync(new URL(`./node_modules/${p}`, import.meta.url))
  return {
    name: 'cazen-scan-reader',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'ocr/worker.min.js', source: from('tesseract.js/dist/worker.min.js') })
      for (const core of ['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm']) {
        this.emitFile({ type: 'asset', fileName: `ocr/core/${core}.wasm.js`, source: from(`tesseract.js-core/${core}.wasm.js`) })
      }
      this.emitFile({ type: 'asset', fileName: 'ocr/lang/eng.traineddata.gz', source: from('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz') })
    },
  }
}

const swSource = (version: string, files: string[]) => `// Written by the build (vite.config.ts). Do not edit.
const CACHE = 'cazen-${version}'
const FILES = ${JSON.stringify(files)}

self.addEventListener('install', (e) => {
  // One at a time and forgiving: a single file that fails must not leave the device with nothing.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await Promise.all(FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('cazen-') && name !== CACHE) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

const fromNetwork = async (request, ms) => {
  const stop = new AbortController()
  const timer = ms ? setTimeout(() => stop.abort(), ms) : null
  try {
    const res = await fetch(request, { signal: stop.signal })
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {}) }
    return res
  } finally { if (timer) clearTimeout(timer) }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(new URL('./', self.location.href).pathname)) return

  if (req.mode === 'navigate') {
    // The page: fresh if the network answers within three seconds, the device's copy if not.
    e.respondWith((async () => {
      const page = new Request('./', { cache: 'no-store' })
      try { return await fromNetwork(page, 3000) }
      catch { return (await caches.match('./')) ?? Response.error() }
    })())
    return
  }
  e.respondWith((async () => (await caches.match(req)) ?? fromNetwork(req))())
})
`

// base './' lets the built app run from GitHub Pages (username.github.io/cazen/)
// or any static host without changes.
export default defineConfig({
  plugins: [react(), scanReader(), serviceWorker()],
  base: './',
})
